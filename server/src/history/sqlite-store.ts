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

/**
 * 1 -> tabela readings(ts, point_id, v)
 * 2 -> dodane readings.bank: z ktorego wymiennego zbiornika pochodzi odczyt
 */
const SCHEMA_VERSION = 2;

export interface SqliteHistoryStoreOptions {
  file: string;
  logger: Logger;
}

export class SqliteHistoryStore implements HistoryStore {
  readonly kind = 'SQLite';

  private readonly db: Database.Database;
  private readonly insert: Database.Statement<[number, string, number | null, string | null]>;
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
        v        REAL,
        -- Wymienny zbiornik, z ktorego pochodzi odczyt. NULL dla punktow
        -- niezwiazanych ze zbiornikiem oraz dla rekordow sprzed migracji.
        bank     TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_readings_point_ts
        ON readings (point_id, ts);

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.migrate(opts.logger);

    this.db
      .prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
      .run('schema_version', String(SCHEMA_VERSION));

    this.insert = this.db.prepare(
      'INSERT INTO readings (ts, point_id, v, bank) VALUES (?, ?, ?, ?)',
    );

    this.insertMany = this.db.transaction((records: readonly HistoryRecord[]) => {
      for (const record of records) {
        this.insert.run(record.tsMs, record.id, record.v, record.bank ?? null);
      }
    });

    const count = this.db.prepare('SELECT COUNT(*) AS c FROM readings').get() as { c: number };
    opts.logger.info(
      { file: opts.file, records: count.c },
      'Baza historii pomiarow otwarta',
    );
  }

  /**
   * Migracja schematu. Istniejaca baza nie moze stracic danych ani wymagac
   * usuniecia — pomiary z tygodni testu sa nieodtwarzalne.
   */
  private migrate(logger: Logger): void {
    const columns = this.db.prepare('PRAGMA table_info(readings)').all() as Array<{
      name: string;
    }>;

    if (!columns.some((column) => column.name === 'bank')) {
      // Rekordy sprzed migracji dostaja bank = NULL: nie wiemy, z ktorego
      // zbiornika pochodza, i lepiej to przyznac niz dopisac zmyslona wartosc.
      this.db.exec('ALTER TABLE readings ADD COLUMN bank TEXT');
      logger.info('Baza historii rozszerzona o kolumnę `bank` (wymienne zbiorniki)');
    }

    // Indeks zakladamy TUTAJ, nie razem z tabela. Na istniejacej bazie
    // (schema 1) kolumny `bank` jeszcze nie ma w chwili tworzenia tabeli —
    // proba indeksowania jej tam wywracala start na bazie z danymi.
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_readings_bank ON readings (bank, point_id, ts)');
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

  /**
   * Odczyt szeregu czasowego z usrednianiem do kubelkow czasowych.
   *
   * Kubelek bez ani jednego odczytu po prostu NIE ISTNIEJE w wyniku —
   * na wykresie robi się dziura. To celowe: dziura mowi "nie mierzylismy",
   * a zero czy interpolacja by klamaly.
   */
  queryBuckets(
    pointId: string,
    fromMs: number,
    toMs: number,
    bucketMs: number,
  ): Array<{ ts: string; v: number | null }> {
    // UWAGA na typ parametru: better-sqlite3 wiaze liczby JS jako REAL,
    // wiec `ts / @bucket` byloby dzieleniem zmiennoprzecinkowym — kazdy
    // wiersz dostawalby unikalny "kubelek" i GROUP BY nie grupowalby NICZEGO.
    // CAST na INTEGER wymusza dzielenie calkowite niezaleznie od wiazania.
    const rows = this.db
      .prepare(
        `SELECT CAST(ts / @bucket AS INTEGER) * CAST(@bucket AS INTEGER) AS bucket_ts,
                AVG(v)                 AS avg_v,
                COUNT(v)               AS with_value,
                COUNT(*)               AS total
           FROM readings
          WHERE point_id = @id AND ts >= @from AND ts < @to
          GROUP BY bucket_ts
          ORDER BY bucket_ts`,
      )
      .all({ id: pointId, from: fromMs, to: toMs, bucket: bucketMs }) as Array<{
      bucket_ts: number;
      avg_v: number | null;
      with_value: number;
      total: number;
    }>;

    return rows.map((row) => ({
      ts: new Date(row.bucket_ts).toISOString(),
      // Kubelek, w ktorym byly wylacznie zapisy NULL (czujnik nie odpowiadal,
      // ale heartbeat to odnotowal), zwraca null — nie znika z wyniku.
      v: row.with_value > 0 ? row.avg_v : null,
    }));
  }

  /** Surowe rekordy — do eksportu CSV. Iterator, zeby nie ladowac wszystkiego naraz. */
  *iterateRaw(
    pointIds: readonly string[],
    fromMs: number,
    toMs: number,
  ): IterableIterator<{ ts: number; point_id: string; v: number | null }> {
    const placeholders = pointIds.map(() => '?').join(',');
    const stmt = this.db.prepare(
      `SELECT ts, point_id, v FROM readings
        WHERE point_id IN (${placeholders}) AND ts >= ? AND ts < ?
        ORDER BY ts, point_id`,
    );
    yield* stmt.iterate(...pointIds, fromMs, toMs) as IterableIterator<{
      ts: number;
      point_id: string;
      v: number | null;
    }>;
  }

  /** Liczba surowych rekordow w zakresie — do walidacji przed odczytem raw. */
  countRaw(pointIds: readonly string[], fromMs: number, toMs: number): number {
    const placeholders = pointIds.map(() => '?').join(',');
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM readings
          WHERE point_id IN (${placeholders}) AND ts >= ? AND ts < ?`,
      )
      .get(...pointIds, fromMs, toMs) as { c: number };
    return row.c;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
