/**
 * Podsumowanie bazy pomiarow — szybka odpowiedz na pytanie "czy dane
 * naprawde sie zbieraja i co w nich jest".
 *
 * Uruchomienie:
 *   npm run baza
 *
 * Czyta baze w trybie TYLKO DO ODCZYTU, wiec mozna to uruchomic w trakcie
 * trwajacego testu — tryb WAL pozwala czytac bez blokowania zapisu.
 */

import fs from 'node:fs';
import Database from 'better-sqlite3';
import { loadConfig } from '../config.js';
import { POINTS } from '../points.config.js';

const cfg = loadConfig();
const line = '─'.repeat(72);

function out(text = ''): void {
  process.stdout.write(`${text}\n`);
}

if (!fs.existsSync(cfg.historyDbAbs)) {
  out();
  out(`Nie ma jeszcze bazy pomiarów: ${cfg.historyDbAbs}`);
  out('Uruchom serwer (npm run dev) — baza powstanie sama przy pierwszym odczycie.');
  out();
  process.exit(0);
}

const db = new Database(cfg.historyDbAbs, { readonly: true });

interface CountRow {
  c: number;
}
interface RangeRow {
  min_ts: number | null;
  max_ts: number | null;
}
interface PointRow {
  point_id: string;
  n: number;
  nulls: number;
  min_v: number | null;
  max_v: number | null;
  last_ts: number;
}

const total = db.prepare('SELECT COUNT(*) AS c FROM readings').get() as CountRow;
const range = db.prepare('SELECT MIN(ts) AS min_ts, MAX(ts) AS max_ts FROM readings').get() as RangeRow;
const schema = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
  | { value: string }
  | undefined;

const perPoint = db
  .prepare(
    `SELECT point_id,
            COUNT(*)                              AS n,
            SUM(CASE WHEN v IS NULL THEN 1 ELSE 0 END) AS nulls,
            MIN(v)                                AS min_v,
            MAX(v)                                AS max_v,
            MAX(ts)                               AS last_ts
       FROM readings
      GROUP BY point_id`,
  )
  .all() as PointRow[];

const fmtTime = (ms: number | null): string =>
  ms === null ? '—' : new Date(ms).toLocaleString('pl-PL', { hour12: false });

out();
out(line);
out('  BAZA POMIARÓW');
out(line);
out(`  plik              ${cfg.historyDbAbs}`);
out(`  rozmiar           ${(fs.statSync(cfg.historyDbAbs).size / 1024).toFixed(1)} kB`);
out(`  wersja schematu   ${schema?.value ?? '—'}`);
out(`  rekordów          ${total.c}`);
out(`  zakres czasu      ${fmtTime(range.min_ts)}  →  ${fmtTime(range.max_ts)}`);

if (perPoint.length === 0) {
  out();
  out('  Brak jakichkolwiek pomiarów. Serwer jeszcze nic nie zapisał.');
  out();
  process.exit(0);
}

// Kolejnosc jak w rejestrze punktow — czyta sie lepiej niz alfabetycznie.
const order = new Map(POINTS.map((point, index) => [point.id, index]));
perPoint.sort((a, b) => (order.get(a.point_id) ?? 999) - (order.get(b.point_id) ?? 999));

out();
out('  punkt          rekordów   bez danych   zakres wartości        ostatni zapis');
out(`  ${'─'.repeat(68)}`);

for (const row of perPoint) {
  const point = POINTS.find((p) => p.id === row.point_id);
  const precision = point?.precision ?? 1;
  const unit = point?.unit ?? '';

  const span =
    row.min_v === null || row.max_v === null
      ? '—'
      : `${row.min_v.toFixed(precision)}…${row.max_v.toFixed(precision)} ${unit}`.trim();

  out(
    `  ${row.point_id.padEnd(14)} ${String(row.n).padStart(8)}   ` +
      `${String(row.nulls).padStart(10)}   ${span.padEnd(21)}  ` +
      new Date(row.last_ts).toLocaleTimeString('pl-PL', { hour12: false }),
  );
}

out();
out('  Kolumna "bez danych" to zapisy NULL — brak odczytu, nigdy zero.');
out();

db.close();
