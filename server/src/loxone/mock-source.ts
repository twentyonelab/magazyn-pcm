/**
 * MockSource — dane syntetyczne, praca bez laboratorium.
 *
 * Dlaczego to istnieje: kryterium ukonczenia kroku pierwszego wymaga
 * dzialajacego Miniservera, sieci laboratorium i uzupelnionych UUID-ow.
 * Bez zrodla syntetycznego praca nad aplikacja poza labem staje calkowicie.
 * Ten plik jest tez dowodem, ze interfejs LoxoneSource faktycznie jest
 * wymienny — jesli MockSource dziala bez zmian w reszcie aplikacji,
 * WebSocketSource tez bedzie.
 *
 * Model: kazdy punkt dazy do temperatury wymiennika z wlasna stala czasowa
 * (czlon inercyjny pierwszego rzedu). Zachowuje wlasciwosci istotne dla
 * wizualizacji:
 *   - przewodnosc cieplna PCM to 0,2 W/(m*K), wiec konwekcji praktycznie nie ma
 *     i front przemiany posuwa sie od wymiennika na zewnatrz — dolne poziomy
 *     reaguja pierwsze, gorne z opoznieniem,
 *   - stale czasowe sa w minutach, nie w sekundach,
 *   - w pasmie przemiany fazowej temperatura niemal stoi (cieplo utajone),
 *   - przekatna B jest dalej od wymiennika niz A.
 */

import type { MaterialProfile, PointDef, SourceKind } from '@magazyn-pcm/shared';
import type { Logger } from 'pino';
import { BaseSource, type SourceReading } from './source.js';

export interface MockSourceOptions {
  points: readonly PointDef[];
  intervalMs: number;
  material: MaterialProfile;
  logger: Logger;
  /** Dlugosc pelnego cyklu ladowanie -> rozladowanie w sekundach. */
  cycleSeconds?: number;
}

/** Stala czasowa punktu w sekundach — zalezy od pozycji w zbiorniku. */
function timeConstantS(point: PointDef): number {
  const base = 70;
  const levelFactor = { 1: 1, 2: 1.9, 3: 3.1 }[point.geometry?.level ?? 1] ?? 1;
  const diagonalFactor = point.geometry?.diagonal === 'B' ? 1.3 : 1;
  return base * levelFactor * diagonalFactor;
}

export class MockSource extends BaseSource {
  readonly kind: SourceKind = 'mock';

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly startedAtMs = Date.now();
  private lastTickMs = Date.now();
  private readonly cycleSeconds: number;

  /** Biezaca temperatura kazdego punktu — model jest stanowy. */
  private readonly temperatures = new Map<string, number>();

  constructor(private readonly opts: MockSourceOptions) {
    super();
    this.cycleSeconds = opts.cycleSeconds ?? 8 * 60;

    // Start tuz pod pasmem przemiany, zeby plateau bylo widoczne od razu —
    // to najwazniejsze zjawisko w tej wizualizacji.
    const m = opts.material;
    for (const point of opts.points) {
      if (point.kind !== 'temperature' || !point.geometry) continue;
      const levelOffset = (point.geometry.level - 2) * 0.4;
      this.temperatures.set(point.id, m.phaseBandMin - 1.5 + levelOffset);
    }
  }

  async start(): Promise<void> {
    this.running = true;
    this.opts.logger.warn(
      { material: this.opts.material.id },
      'ŹRÓDŁO SYNTETYCZNE — te liczby nie pochodzą z Miniservera',
    );

    this.tick();
    this.timer = setInterval(() => this.tick(), this.opts.intervalMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Temperatura wymiennika: ladowanie w pierwszej polowie cyklu. */
  private exchangerTemperature(elapsedS: number): number {
    const m = this.opts.material;
    const span = m.scaleMax - m.scaleMin;
    const charging = (elapsedS % this.cycleSeconds) / this.cycleSeconds < 0.5;
    return charging ? m.scaleMax - span * 0.1 : m.scaleMin + span * 0.05;
  }

  private tick(): void {
    if (!this.running) return;

    const now = Date.now();
    const dtS = Math.max((now - this.lastTickMs) / 1000, 0.001);
    this.lastTickMs = now;

    const elapsedS = (now - this.startedAtMs) / 1000;
    const target = this.exchangerTemperature(elapsedS);
    const m = this.opts.material;

    const readings: SourceReading[] = [];

    for (const point of this.opts.points) {
      if (point.kind !== 'temperature' || !point.geometry) {
        readings.push({ id: point.id, v: null, readAtMs: now, raw: '' });
        continue;
      }

      const current = this.temperatures.get(point.id) ?? m.phaseBandMin;

      // W pasmie przemiany cieplo utajone drastycznie zwalnia zmiane
      // temperatury — punkt "stoi" w plateau.
      const inPhaseBand = current >= m.phaseBandMin && current <= m.phaseBandMax;
      const tau = timeConstantS(point) * (inPhaseBand ? 5 : 1);

      // Czlon inercyjny pierwszego rzedu.
      const next = current + (target - current) * (1 - Math.exp(-dtS / tau));
      this.temperatures.set(point.id, next);

      // Szum na poziomie dokladnosci sondy DS18B20 (+/- 0,5 K), ale
      // deterministyczny, zeby wartosci nie skakaly chaotycznie.
      const seed = hashString(point.id);
      const noise = Math.sin(elapsedS / 23 + seed) * 0.06;

      readings.push({
        id: point.id,
        v: round(next + noise, 1),
        readAtMs: now,
        raw: String(round(next + noise, 1)),
      });
    }

    this.emitReadings(readings);
    this.emitHealth({
      status: 'ok',
      latencyMs: 1,
      message: 'Dane syntetyczne (LOXONE_SOURCE=mock). To nie są pomiary ze stanowiska.',
    });
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 1000;
  }
  return hash / 100;
}
