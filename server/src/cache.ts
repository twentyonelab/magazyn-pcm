/**
 * ValueCache — biezace wartosci wszystkich punktow.
 *
 * Dwie decyzje, ktore warto rozumiec:
 *
 * 1. `ts` to czas ostatniego UDANEGO ODCZYTU ze zrodla, a nie czas ostatniej
 *    zmiany wartosci. Sondy 1-Wire odswiezaja sie co ~15 s, a prog
 *    przestarzalosci to 3 x 5 s = 15 s. Gdybysmy liczyli od zmiany wartosci,
 *    sprawny czujnik przy stabilnej temperaturze cyklicznie migalby jako
 *    "przestarzaly" — falszywy alarm. Przy liczeniu od udanego odczytu
 *    "przestarzale" znaczy dokladnie to, co ma znaczyc: stracilismy kontakt.
 *
 * 2. Przestarzalosc jest WYLICZANA przy odczycie, nigdy zapisywana. Nie ma
 *    wiec stanu, ktory moze sie rozjechac z rzeczywistoscia miedzy tickami.
 */

import type { PointValue, PointValues } from '@magazyn-pcm/shared';

interface Entry {
  /** null = brak danych. Nigdy nie zastepujemy zerem. */
  v: number | null;
  /** Czas ostatniego udanego odczytu (ms epoch). */
  readAtMs: number;
  /** Czas ostatniej zmiany wartosci (ms epoch) — do zapisu historii. */
  changedAtMs: number;
}

export interface CacheUpdate {
  id: string;
  value: PointValue;
  /** true = wartosc rozni sie od poprzedniej (albo to pierwszy odczyt). */
  changed: boolean;
}

export class ValueCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly staleAfterMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Zapisuje udany odczyt. Zwraca informacje, czy wartosc sie zmienila —
   * dzieki temu SSE i historia moga wysylac/zapisywac tylko zmiany.
   */
  set(id: string, v: number | null, readAtMs: number = this.now()): CacheUpdate {
    const previous = this.entries.get(id);
    const changed = previous === undefined || previous.v !== v;

    this.entries.set(id, {
      v,
      readAtMs,
      changedAtMs: changed ? readAtMs : (previous?.changedAtMs ?? readAtMs),
    });

    return { id, value: this.get(id), changed };
  }

  /** Wartosc punktu. Punkt nieznany albo bez odczytu = brak danych. */
  get(id: string): PointValue {
    const entry = this.entries.get(id);
    if (!entry) return { v: null, ts: null, stale: true };

    return {
      v: entry.v,
      ts: new Date(entry.readAtMs).toISOString(),
      stale: this.now() - entry.readAtMs > this.staleAfterMs,
    };
  }

  /** Czy punkt ma wartosc przestarzala (albo nie ma jej wcale). */
  isStale(id: string): boolean {
    return this.get(id).stale;
  }

  /** Wartosci wszystkich podanych punktow. */
  snapshot(ids: readonly string[]): PointValues {
    const out: PointValues = {};
    for (const id of ids) out[id] = this.get(id);
    return out;
  }

  /** Identyfikatory punktow z przestarzala wartoscia. */
  staleIds(ids: readonly string[]): string[] {
    return ids.filter((id) => this.isStale(id));
  }

  /** Czas ostatniej zmiany wartosci — potrzebny dla heartbeatu historii. */
  changedAtMs(id: string): number | null {
    return this.entries.get(id)?.changedAtMs ?? null;
  }

  /** Czy dla tego punktu byl kiedykolwiek udany odczyt. */
  hasReading(id: string): boolean {
    return this.entries.has(id);
  }
}
