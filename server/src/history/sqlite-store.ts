/**
 * SqliteHistoryStore — docelowy zapis historii pomiarow (krok 4).
 *
 * Podmiana za interfejsem HistoryStore: reszta aplikacji nie wie, ze cokolwiek
 * sie zmienilo. Zapis do pliku NDJSON zostaje jako awaryjne wyjscie
 * (HISTORY_BACKEND=ndjson).
 *
 * Decyzje, ktore warto rozumiec:
 *
 *   - `v REAL` jest NULLOWALNE. Brak danych zapisujemy jako NULL, nigdy jako
 *     zero. Gdyby awaria sondy trafila do bazy jako 0 °C, po dwoch tygodniach
 *     nie dalo by sie tego odroznic od prawdziwego pomiaru.
 *
 *   - Czas trzymamy jako liczbe milisekund (INTEGER), nie tekst. Porownania
 *     zakresow sa wtedy szybkie i nie zaleza od strefy czasowej.
 *
 *   - Tryb WAL. Zapis nie blokuje wtedy odczytu, wiec widok Przebiegi
 *     (krok 8) bedzie mogl czytac baze w trakcie trwajacego testu.
 *
 *   - Wstawki ida w transakcji. Szesc osobnych zapisow co 5 s to szesc
 *     wymuszonych synchronizacji dysku; jedna transakcja to jedna.
 *
 *   - Tabela `meta` przechowuje wersje schematu. Gdy w kroku 8 dojdzie
 *     agregacja, bedzie po czym rozpoznac starsza baze.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Logger } from 'pino';
import type { HistoryRecord, HistoryStore } from './store.js';

const SCHEMA_VERSION = 1;

export interface SqliteHistoryStoreOptions {
  file: string;
  logger: Logger;
}

export class SqliteHistoryStore implements HistoryStore {
  readonly kind = 'SQLite';

  private readonly db: Database.Database;
  private readonly insert: Database.Statement<[number, string, number | null]>;
  private readonly insertMany: Database.Transaction<(records: readonly HistoryRecord[]) => void>;
  private failureLogged = false;

  constructor(private readonly opts: SqliteHistoryStoreOptions) {
    fs.mkdirSync(path.dirname(opts.file), { recursive: true });

    this.db = new Database(opts.file);
    this.db.pragma('journal_mode = WAL');
    // NORMAL zamiast FULL: przy pomiarach co 5 s ryzyko utraty ostatniego
    // zapisu przy naglym zaniku zasilania jest akceptowalne, a obciazenie
    // dysku wyraznie mniejsze.
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS readings (
        ts       INTEGER NOT NULL,
        point_id TEXT    NOT NULL,
        v        REAL
      );

      CREATE INDEX IF NOT EXISTS idx_readings_point_ts
        ON readings (point_id, ts);

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.db
      .prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
      .run('schema_version', String(SCHEMA_VERSION));

    this.insert = this.db.prepare('INSERT INTO readings (ts, point_id, v) VALUES (?, ?, ?)');

    this.insertMany = this.db.transaction((records: readonly HistoryRecord[]) => {
      for (const record of records) {
        this.insert.run(record.tsMs, record.id, record.v);
      }
    });

    const count = this.db.prepare('SELECT COUNT(*) AS c FROM readings').get() as { c: number };
    opts.logger.info(
      { file: opts.file, records: count.c },
      'Baza historii pomiarow otwarta',
    );
  }

  async append(records: readonly HistoryRecord[]): Promise<void> {
    if (records.length === 0) return;

    try {
      this.insertMany(records);
      this.failureLogged = false;
    } catch (error) {
      // Zapis historii nigdy nie przerywa pracy aplikacji, ale cicha utrata
      // danych nie moze przejsc niezauwazona.
      if (!this.failureLogged) {
        this.opts.logger.error(
          { err: error instanceof Error ? error.message : String(error), file: this.opts.file },
          'Nie udało się zapisać historii pomiarów do bazy',
        );
        this.failureLogged = true;
      }
    }
  }

  /** Liczba zapisanych rekordow — do widoku Diagnostyka. */
  recordCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM readings').get() as { c: number };
    return row.c;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
