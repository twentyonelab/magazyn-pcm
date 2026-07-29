/**
 * NdjsonHistoryStore — zapis pomiarow do pliku tekstowego, jedna linia
 * na jeden pomiar. Rozwiazanie tymczasowe do kroku 4 (SQLite), ale dziala
 * od pierwszego dnia, wiec zadne dane z testow nie przepadaja.
 *
 * Format: jeden plik na dobe, data w nazwie.
 *   data/history/2026-07-29.ndjson
 *   {"ts":"2026-07-29T18:04:07.000Z","id":"A1","v":8.4}
 *
 * NDJSON zamiast CSV, bo `null` da sie w nim zapisac jednoznacznie —
 * a rozroznienie "brak danych" od "zero" jest w tym projekcie krytyczne.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from 'pino';
import type { HistoryRecord, HistoryStore } from './store.js';

export interface NdjsonHistoryStoreOptions {
  dir: string;
  logger: Logger;
}

export class NdjsonHistoryStore implements HistoryStore {
  readonly kind = 'plik NDJSON';

  private handle: fsp.FileHandle | null = null;
  private currentDay: string | null = null;
  private failureLogged = false;

  constructor(private readonly opts: NdjsonHistoryStoreOptions) {
    fs.mkdirSync(opts.dir, { recursive: true });
  }

  private dayOf(tsMs: number): string {
    return new Date(tsMs).toISOString().slice(0, 10);
  }

  private async handleFor(day: string): Promise<fsp.FileHandle> {
    if (this.handle && this.currentDay === day) return this.handle;

    if (this.handle) {
      await this.handle.close();
      this.handle = null;
    }

    const file = path.join(this.opts.dir, `${day}.ndjson`);
    this.handle = await fsp.open(file, 'a');
    this.currentDay = day;
    return this.handle;
  }

  async append(records: readonly HistoryRecord[]): Promise<void> {
    if (records.length === 0) return;

    try {
      // Rekordy moga trafic na przelom doby — grupujemy po dniu.
      const byDay = new Map<string, HistoryRecord[]>();
      for (const record of records) {
        const day = this.dayOf(record.tsMs);
        const bucket = byDay.get(day);
        if (bucket) bucket.push(record);
        else byDay.set(day, [record]);
      }

      for (const [day, dayRecords] of byDay) {
        const handle = await this.handleFor(day);
        const lines = dayRecords
          .map((r) =>
            JSON.stringify({ ts: new Date(r.tsMs).toISOString(), id: r.id, v: r.v }),
          )
          .join('\n');
        await handle.write(`${lines}\n`);
      }

      this.failureLogged = false;
    } catch (error) {
      // Zapis historii nigdy nie przerywa pracy aplikacji — ale musi byc
      // widoczny w logu, zeby cicha utrata danych nie przeszla niezauwazona.
      if (!this.failureLogged) {
        this.opts.logger.error(
          { err: error instanceof Error ? error.message : String(error), dir: this.opts.dir },
          'Nie udało się zapisać historii pomiarów',
        );
        this.failureLogged = true;
      }
    }
  }

  async close(): Promise<void> {
    if (this.handle) {
      await this.handle.close();
      this.handle = null;
    }
  }
}
