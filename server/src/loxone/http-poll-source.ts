/**
 * HttpPollSource — implementacja v1: odpytywanie Miniservera przez HTTP.
 *
 * Zachowanie wobec bledow (to najwazniejsza czesc tego pliku):
 *
 *   Odrzucone logowanie (401/403) -> ZATRZYMANIE odpytywania, zero ponowien.
 *       Miniserver blokuje konto po serii nieudanych logowan. Literowka
 *       w hasle plus automatyczne ponawianie co 5 s to 12 nieudanych prob
 *       na minute i zablokowane konto na godziny.
 *
 *   Blad sieciowy / timeout -> ponowienie z backoffem wykladniczym.
 *       Tu ponawianie jest bezpieczne i pozadane: Miniserver moze sie
 *       restartowac albo laptop mogl chwilowo stracic siec.
 *
 * Odczyty ida SEKWENCYJNIE. Miniserver Compact to slaby sprzet, a szesc
 * rownoleglych zapytan co 5 s nie daje zadnego zysku (magistrala 1-Wire i tak
 * odswieza sondy co ~15 s).
 */

import type { PointDef, SourceKind } from '@magazyn-pcm/shared';
import type { Logger } from 'pino';
import { BaseSource, type SourceReading } from './source.js';
import { LoxoneAuthError, LoxoneNetworkError, type LoxoneClient } from './client.js';

export interface HttpPollSourceOptions {
  client: LoxoneClient;
  /** Punkty do odpytywania — wylacznie te z przypisanym UUID-em. */
  points: readonly PointDef[];
  intervalMs: number;
  logger: Logger;
  /** Maksymalny odstep miedzy proba po bledach sieciowych. */
  maxBackoffMs?: number;
  /** Co ile cykli sprawdzic, czy konfiguracja w Loxone Config sie zmienila. */
  configCheckEveryTicks?: number;
  onConfigChanged?: (previous: string, current: string) => void;
}

export class HttpPollSource extends BaseSource {
  readonly kind: SourceKind = 'http-poll';

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private tickInFlight = false;
  private consecutiveFailures = 0;
  private tickCount = 0;
  private structureVersion: string | null = null;

  private readonly maxBackoffMs: number;
  private readonly configCheckEveryTicks: number;

  constructor(private readonly opts: HttpPollSourceOptions) {
    super();
    this.maxBackoffMs = opts.maxBackoffMs ?? 60_000;
    this.configCheckEveryTicks = opts.configCheckEveryTicks ?? 60;
  }

  async start(): Promise<void> {
    this.running = true;

    // Jedna weryfikacja danych logowania na starcie. Jesli haslo jest zle,
    // dowiemy sie po JEDNEJ probie, a nie po dwunastu.
    try {
      const info = await this.opts.client.getApiInfo();
      this.opts.logger.info(
        { miniserver: info.raw, latencyMs: info.latencyMs },
        'Połączenie z Miniserverem nawiązane',
      );
    } catch (error) {
      if (error instanceof LoxoneAuthError) {
        this.stopPolling();
        this.emitHealth({
          status: 'auth_error',
          latencyMs: null,
          fatal: true,
          message:
            'Miniserver odrzucił logowanie. Przerywam próby, żeby nie zablokował konta. ' +
            'Sprawdź LOXONE_USER i LOXONE_PASS w pliku .env.',
        });
        return;
      }

      // Brak sieci na starcie nie jest bledem trwalym — laboratorium moze byc
      // chwilowo niedostepne. Wchodzimy w normalny cykl z backoffem.
      this.opts.logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'Nie udało się potwierdzić łączności na starcie — próbuję dalej',
      );
      this.emitHealth({
        status: 'offline',
        latencyMs: null,
        message:
          `Nie widzę Miniservera ${this.opts.client.safeUrl}. ` +
          'Sprawdź, czy jesteś w sieci laboratorium. Próbuję dalej.',
      });
    }

    // Wersja struktury konfiguracji — punkt odniesienia do wykrycia zmian
    // w Loxone Config (zmiana moze przestawic UUID-y).
    try {
      this.structureVersion = await this.opts.client.getStructureVersion();
    } catch {
      // Nieistotne dla dzialania — sprobujemy pozniej.
    }

    if (this.opts.points.length === 0) {
      // Tylko log — stan lacznosci ustala cykl odczytu, zeby komunikat
      // o brakujacych UUID-ach nie przyslonil informacji "nie ma polaczenia".
      this.opts.logger.warn(
        'Żaden punkt nie ma jeszcze przypisanego UUID-a — uruchom `npm run uuid`',
      );
    }

    this.scheduleNext(0);
  }

  async stop(): Promise<void> {
    this.stopPolling();
  }

  private stopPolling(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  /** Opoznienie do nastepnego cyklu: normalny interwal albo backoff. */
  private nextDelayMs(): number {
    if (this.consecutiveFailures === 0) return this.opts.intervalMs;
    const factor = 2 ** Math.min(this.consecutiveFailures, 5);
    return Math.min(this.opts.intervalMs * factor, this.maxBackoffMs);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    // Zabezpieczenie przed nakladaniem sie cykli: odczyt trwajacy dluzej niz
    // interwal nie moze odpalic kolejnego rownolegle.
    if (this.tickInFlight) {
      this.opts.logger.warn('Poprzedni cykl odczytu jeszcze trwa — pomijam ten cykl');
      // Nastepny cykl probujemy w normalnym rytmie, bez zageszczania.
      this.scheduleNext(this.opts.intervalMs);
      return;
    }

    // Brak punktow z UUID-em nie zwalnia nas ze sprawdzania lacznosci —
    // inaczej diagnostyka pokazywalaby "brak UUID-ow" takze wtedy, gdy
    // prawdziwym problemem jest brak polaczenia z Miniserverem.
    if (this.opts.points.length === 0) {
      await this.probeConnection();
      this.scheduleNext(this.nextDelayMs());
      return;
    }

    this.tickInFlight = true;
    this.tickCount += 1;

    const startedAt = Date.now();
    const readings: SourceReading[] = [];
    let authFailed = false;
    let networkFailures = 0;
    let badCodes = 0;

    try {
      for (const point of this.opts.points) {
        if (!this.running) break;
        if (!point.uuid) continue;

        try {
          const result = await this.opts.client.readState(point.uuid);

          if (result.code !== 0 && result.code !== 200) {
            badCodes += 1;
            this.opts.logger.warn(
              { point: point.id, code: result.code, raw: result.raw },
              'Miniserver zwrocil nietypowy kod odpowiedzi dla punktu',
            );
            continue;
          }

          readings.push({
            id: point.id,
            v: result.value,
            readAtMs: Date.now(),
            raw: result.raw,
          });
        } catch (error) {
          if (error instanceof LoxoneAuthError) {
            authFailed = true;
            break;
          }
          networkFailures += 1;
          this.opts.logger.debug(
            {
              point: point.id,
              err: error instanceof LoxoneNetworkError ? error.message : String(error),
            },
            'Nie udalo sie odczytac punktu',
          );
        }
      }
    } finally {
      this.tickInFlight = false;
    }

    const latencyMs = Date.now() - startedAt;

    // --- Odrzucone logowanie: koniec, bez ponowien ---------------------------
    if (authFailed) {
      this.stopPolling();
      this.emitHealth({
        status: 'auth_error',
        latencyMs,
        fatal: true,
        message:
          'Miniserver odrzucił logowanie w trakcie pracy. Zatrzymałem odpytywanie, ' +
          'żeby nie zablokował konta. Sprawdź dane w pliku .env i uprawnienia użytkownika.',
      });
      return;
    }

    if (readings.length > 0) {
      this.emitReadings(readings);
    }

    // --- Stan lacznosci -----------------------------------------------------
    if (readings.length === 0) {
      this.consecutiveFailures += 1;
      this.emitHealth({
        status: 'offline',
        latencyMs,
        message:
          `Nie udało się odczytać żadnego punktu (próba ${this.consecutiveFailures}). ` +
          `Kolejna próba za ${Math.round(this.nextDelayMs() / 1000)} s.`,
      });
    } else if (networkFailures > 0 || badCodes > 0) {
      this.consecutiveFailures = 0;
      this.emitHealth({
        status: 'degraded',
        latencyMs,
        message: `Część punktów nie odpowiedziała (${networkFailures + badCodes} z ${this.opts.points.length}).`,
      });
    } else {
      this.consecutiveFailures = 0;
      this.emitHealth({ status: 'ok', latencyMs, message: null });
    }

    if (latencyMs > this.opts.intervalMs) {
      this.opts.logger.warn(
        { latencyMs, intervalMs: this.opts.intervalMs },
        'Cykl odczytu trwal dluzej niz interwal odpytywania',
      );
    }

    // --- Czy ktos zmienil konfiguracje w Loxone Config? ---------------------
    if (this.tickCount % this.configCheckEveryTicks === 0) {
      void this.checkStructureVersion();
    }

    this.scheduleNext(this.nextDelayMs());
  }

  /**
   * Sprawdzenie samej lacznosci, gdy nie ma jeszcze zadnego punktu z UUID-em.
   * Dzieki temu diagnostyka rozroznia "nie ma polaczenia" od "nie ma UUID-ow".
   */
  private async probeConnection(): Promise<void> {
    const uuidHint =
      'Uzupełnij UUID-y w server/src/points.config.ts (`npm run uuid`), ' +
      'żeby zacząć odczytywać wartości.';

    try {
      const info = await this.opts.client.getApiInfo();
      this.consecutiveFailures = 0;
      this.emitHealth({
        status: 'degraded',
        latencyMs: info.latencyMs,
        message: `Połączenie z Miniserverem działa, ale żaden punkt nie ma UUID-a. ${uuidHint}`,
      });
    } catch (error) {
      if (error instanceof LoxoneAuthError) {
        this.stopPolling();
        this.emitHealth({
          status: 'auth_error',
          latencyMs: null,
          fatal: true,
          message:
            'Miniserver odrzucił logowanie. Przerywam próby, żeby nie zablokował konta. ' +
            'Sprawdź LOXONE_USER i LOXONE_PASS w pliku .env.',
        });
        return;
      }

      this.consecutiveFailures += 1;
      this.emitHealth({
        status: 'offline',
        latencyMs: null,
        message:
          `${error instanceof Error ? error.message : String(error)} ` +
          `Kolejna próba za ${Math.round(this.nextDelayMs() / 1000)} s. ${uuidHint}`,
      });
    }
  }

  private async checkStructureVersion(): Promise<void> {
    try {
      const current = await this.opts.client.getStructureVersion();
      if (current === null) return;

      if (this.structureVersion === null) {
        this.structureVersion = current;
        return;
      }

      if (current !== this.structureVersion) {
        this.opts.logger.warn(
          { previous: this.structureVersion, current },
          'Konfiguracja w Loxone Config zmienila sie od startu aplikacji — ' +
            'sprawdz, czy UUID-y w rejestrze punktow nadal sa aktualne (npm run uuid)',
        );
        this.opts.onConfigChanged?.(this.structureVersion, current);
        this.structureVersion = current;
      }
    } catch {
      // Sprawdzenie wersji jest opcjonalne — nie psujemy cyklu odczytu.
    }
  }
}
