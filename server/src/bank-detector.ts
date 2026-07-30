/**
 * Rozpoznawanie, KTORY ZESTAW SOND jest podlaczony.
 *
 * Stanowisko ma dwa zbiorniki, kazdy z wlasnymi szescioma sondami. W Loxone
 * Config przypisanych jest 12 sond, ale magistrala 1-Wire widzi tylko te
 * z aktualnie podlaczonego zbiornika. Zamiast kazac czlowiekowi pamietac
 * o przestawieniu trybu po wymianie zbiornika, pytamy oba zestawy i patrzymy,
 * ktory odpowiada.
 *
 * DLACZEGO TO WAZNE PONAD WYGODE: zestaw jest tozsamy z parafina, a od
 * parafiny zalezy skala barwna i pasmo przemiany. Zla parafina nie daje bledu,
 * tylko obraz w jednym kolorze i dane opisane nie tym materialem, ktory
 * faktycznie byl w zbiorniku.
 *
 * JAK ROZPOZNAJEMY MARTWA SONDE:
 * Loxone dla odlaczonego czujnika 1-Wire zachowuje sie roznie w zaleznosci
 * od konfiguracji — moze zwracac zero, ostatnia znana wartosc albo wartosc
 * poza zakresem pomiarowym. Zamiast zgadywac ktory to przypadek, stosujemy
 * kilka niezaleznych testow i wymagamy, zeby zestaw wygral WYRAZNIE. Gdy
 * wynik jest niejednoznaczny, NIE ZGADUJEMY — zglaszamy to i czekamy na
 * decyzje czlowieka. Cicha pomylka byla by tu grozniejsza od braku wyboru.
 */

import type { BankId, BankState, PointDef } from '@magazyn-pcm/shared';
import type { Logger } from 'pino';
import { LoxoneAuthError, type LoxoneClient } from './loxone/client.js';

/** Poza tym zakresem sonda DS18B20 nie moze pokazywac prawdy (jej zakres: -10…+85). */
const PLAUSIBLE_MIN = -20;
const PLAUSIBLE_MAX = 95;

/** Wartosci, ktore Loxone najczesciej pokazuje dla odlaczonego czujnika. */
const SENTINEL_VALUES = [0, -1, 85, 127, -127, 999, -999];

export interface BankProbe {
  bank: BankId;
  /** Ile sond zestawu odpowiedzialo wiarygodna wartoscia. */
  plausible: number;
  /** Ile sond zestawu odpowiedzialo w ogole. */
  answered: number;
  /** Ile sond zestawu ma przypisany UUID. */
  configured: number;
  values: Array<{ pointId: string; value: number | null; raw: string }>;
}

/** Czy wartosc moze byc prawdziwym odczytem temperatury. */
function isPlausible(value: number | null): boolean {
  if (value === null) return false;
  if (!Number.isFinite(value)) return false;
  if (value < PLAUSIBLE_MIN || value > PLAUSIBLE_MAX) return false;
  // Wartosc dokladnie rowna typowej "zaslepce" jest podejrzana, ale nie
  // odrzucamy jej sama z siebie — 0 stopni to realna temperatura. Liczy sie
  // dopiero razem z tym, ze CALY zestaw pokazuje te sama wartosc (ponizej).
  return true;
}

/**
 * Ocena zestawu na podstawie odczytow.
 *
 * Zestaw uznajemy za zywy, gdy wiekszosc jego sond odpowiada wiarygodnie
 * I nie wszystkie pokazuja identycznej wartosci-zaslepki. Szesc sond
 * w jednym zbiorniku praktycznie nigdy nie ma tej samej temperatury
 * co do dziesiatej czesci stopnia — w magazynie PCM wystepuje stratyfikacja.
 */
function score(probe: BankProbe): number {
  if (probe.plausible === 0) return 0;

  const values = probe.values
    .map((entry) => entry.value)
    .filter((value): value is number => value !== null);

  const unique = new Set(values.map((value) => value.toFixed(1)));

  // Wszystkie sondy pokazuja to samo I jest to typowa zaslepka -> martwy zestaw.
  if (unique.size === 1 && values.length > 1) {
    const only = values[0]!;
    if (SENTINEL_VALUES.some((sentinel) => Math.abs(only - sentinel) < 0.05)) return 0;
  }

  // Punkty za wiarygodne odczyty plus premia za zroznicowanie wartosci
  // (dowod, ze to prawdziwe pomiary, a nie jedna liczba powtorzona szesc razy).
  return probe.plausible * 10 + Math.min(unique.size, 6);
}

export interface DetectBanksOptions {
  client: LoxoneClient;
  points: readonly PointDef[];
  banks: readonly BankId[];
  logger: Logger;
}

/** Odpytuje wszystkie zestawy i zwraca surowe wyniki. */
export async function probeBanks(opts: DetectBanksOptions): Promise<BankProbe[]> {
  const results: BankProbe[] = [];

  for (const bank of opts.banks) {
    const probe: BankProbe = { bank, plausible: 0, answered: 0, configured: 0, values: [] };

    for (const point of opts.points) {
      const uuid = point.uuidByBank?.[bank];
      if (!uuid) continue;
      probe.configured += 1;

      try {
        const state = await opts.client.readState(uuid);
        probe.answered += 1;
        probe.values.push({ pointId: point.id, value: state.value, raw: state.raw });
        if (isPlausible(state.value)) probe.plausible += 1;
      } catch (error) {
        // Odrzucone logowanie musi wyjsc na wierzch, nie zginac w detekcji.
        if (error instanceof LoxoneAuthError) throw error;
        probe.values.push({ pointId: point.id, value: null, raw: '(brak odpowiedzi)' });
      }
    }

    results.push(probe);
  }

  return results;
}

export interface DetectionResult extends BankState {
  probes: BankProbe[];
}

/**
 * Wybiera aktywny zestaw. Zwraca `active: null`, gdy nie da sie rozstrzygnac —
 * lepiej powiedziec "nie wiem" niz opisac dane zla parafina.
 */
export function chooseBank(probes: readonly BankProbe[]): DetectionResult {
  const alive: Partial<Record<BankId, number>> = {};
  for (const probe of probes) alive[probe.bank] = probe.plausible;

  const configured = probes.filter((probe) => probe.configured > 0);

  if (configured.length === 0) {
    return {
      active: null,
      detection: 'unknown',
      alive,
      message:
        'Żaden zestaw sond nie ma przypisanych UUID-ów. Uruchom `npm run uuid` w sieci laboratorium.',
      probes: [...probes],
    };
  }

  const ranked = [...configured].sort((a, b) => score(b) - score(a));
  const best = ranked[0]!;
  const runnerUp = ranked[1];
  const bestScore = score(best);
  const runnerUpScore = runnerUp ? score(runnerUp) : 0;

  if (bestScore === 0) {
    return {
      active: null,
      detection: 'unknown',
      alive,
      message:
        'Żaden zestaw sond nie odpowiada wiarygodnie. Sprawdź, czy zbiornik jest podłączony ' +
        'do magistrali 1-Wire i czy widać jego sondy w Loxone Config.',
      probes: [...probes],
    };
  }

  // Oba zestawy odpowiadaja podobnie — to znaczy, ze albo podlaczone sa dwa
  // zbiorniki naraz, albo odlaczone sondy udaja zywe. Nie zgadujemy.
  if (runnerUp && runnerUpScore > 0 && bestScore - runnerUpScore < 20) {
    return {
      active: null,
      detection: 'unknown',
      alive,
      message:
        `Oba zestawy sond odpowiadają (${best.bank}: ${best.plausible}, ` +
        `${runnerUp.bank}: ${runnerUp.plausible} sond). Nie potrafię rozstrzygnąć, który ` +
        'zbiornik jest podłączony — wybierz zestaw ręcznie w Ustawieniach.',
      probes: [...probes],
    };
  }

  return {
    active: best.bank,
    detection: 'auto',
    alive,
    message: null,
    probes: [...probes],
  };
}

/**
 * Detektor uzywany przez serwer: rozpoznaje zestaw na starcie i sprawdza
 * ponownie w tle, zeby wymiana zbiornika w trakcie pracy nie wymagala
 * restartu aplikacji.
 */
export class BankDetector {
  private state: BankState;
  private manual: BankId | null = null;

  constructor(
    private readonly opts: DetectBanksOptions & { forcedBank?: BankId | null },
  ) {
    this.manual = opts.forcedBank ?? null;
    this.state = this.manual
      ? {
          active: this.manual,
          detection: 'manual',
          alive: {},
          message: `Zestaw wybrany ręcznie w konfiguracji (${this.manual}).`,
        }
      : { active: null, detection: 'unknown', alive: {}, message: 'Jeszcze nie sprawdzono.' };
  }

  snapshot(): BankState {
    return this.state;
  }

  get activeBank(): BankId | null {
    return this.state.active;
  }

  /** Ustawienie reczne wygrywa nad rozpoznaniem — czlowiek wie lepiej. */
  setManual(bank: BankId | null): void {
    this.manual = bank;
    if (bank) {
      this.state = {
        active: bank,
        detection: 'manual',
        alive: this.state.alive,
        message: `Zestaw wybrany ręcznie (${bank}).`,
      };
    }
  }

  /** Zwraca true, gdy aktywny zestaw sie zmienil. */
  async detect(): Promise<boolean> {
    // Reczny wybor pomija odpytywanie: nie ma po co obciazac magistrali.
    if (this.manual) return false;

    const probes = await probeBanks(this.opts);
    const result = chooseBank(probes);
    const previous = this.state.active;

    this.state = {
      active: result.active,
      detection: result.detection,
      alive: result.alive,
      message: result.message,
    };

    if (previous !== result.active) {
      this.opts.logger.info(
        { poprzedni: previous, aktualny: result.active, sondy: result.alive },
        'Rozpoznano zestaw sond (wymienny zbiornik)',
      );
      return true;
    }

    return false;
  }
}
