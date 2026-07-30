/**
 * Wykrywanie PRZERW w zbieraniu danych.
 *
 * Uruchomienie:
 *   npm run przerwy            (prog dobrany z konfiguracji)
 *   npm run przerwy -- 600     (prog 600 s)
 *
 * Po co: uspiony laptop, restart po aktualizacji Windows albo zerwana siec
 * nie zglaszaja sie same. W bazie zostaje po nich tylko DZIURA — a dziura
 * jest niewidoczna, dopoki ktos jej nie poszuka. Ten skrypt szuka.
 *
 * Jak liczy: bierze wszystkie znaczniki czasu zapisow (dowolnego punktu)
 * i szuka odstepow wiekszych od progu. Serwer zapisuje kazda zmiane
 * wartosci, a przy stabilnej temperaturze dopisuje heartbeat co
 * HISTORY_HEARTBEAT_S — wiec jesli dzialal, odstepy nie moga byc dluzsze
 * niz heartbeat z marginesem. Dluzszy odstep znaczy: NIE DZIALAL.
 */

import fs from 'node:fs';
import Database from 'better-sqlite3';
import { loadConfig } from '../config.js';

const cfg = loadConfig();
const line = '─'.repeat(72);

function out(text = ''): void {
  process.stdout.write(`${text}\n`);
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

function formatMoment(ms: number): string {
  return new Date(ms).toLocaleString('pl-PL', { hour12: false });
}

if (cfg.HISTORY_BACKEND !== 'sqlite') {
  out();
  out('Ten skrypt czyta bazę SQLite, a HISTORY_BACKEND jest ustawiony na ndjson.');
  out('Zmień backend w pliku .env albo przeanalizuj pliki z katalogu historii ręcznie.');
  out();
  process.exit(0);
}

if (!fs.existsSync(cfg.historyDbAbs)) {
  out();
  out(`Nie ma jeszcze bazy pomiarów: ${cfg.historyDbAbs}`);
  out('Uruchom serwer — baza powstanie przy pierwszym odczycie.');
  out();
  process.exit(0);
}

// Prog: argument z wiersza polecen albo 2,5 x heartbeat (min. 60 s).
const argument = Number(process.argv[2]);
const heartbeatMs = cfg.HISTORY_HEARTBEAT_S * 1000;
const thresholdMs = Number.isFinite(argument) && argument > 0
  ? argument * 1000
  : Math.max(Math.round(heartbeatMs * 2.5), 60_000);

const db = new Database(cfg.historyDbAbs, { readonly: true });

// DISTINCT, bo w jednym cyklu zapisuje sie kilka punktow z tym samym czasem.
const stamps = db
  .prepare('SELECT DISTINCT ts FROM readings ORDER BY ts')
  .all() as Array<{ ts: number }>;

out();
out(line);
out('  PRZERWY W ZBIERANIU DANYCH');
out(line);

if (stamps.length < 2) {
  out('  Za mało danych, żeby szukać przerw.');
  out();
  process.exit(0);
}

const firstMs = stamps[0]!.ts;
const lastMs = stamps[stamps.length - 1]!.ts;
const spanMs = lastMs - firstMs;

interface Gap {
  fromMs: number;
  toMs: number;
  durationMs: number;
}

const gaps: Gap[] = [];
for (let i = 1; i < stamps.length; i += 1) {
  const previous = stamps[i - 1]!.ts;
  const current = stamps[i]!.ts;
  if (current - previous > thresholdMs) {
    gaps.push({ fromMs: previous, toMs: current, durationMs: current - previous });
  }
}

const lostMs = gaps.reduce((sum, gap) => sum + gap.durationMs, 0);
// Dostepnosc: ile czasu z calego okresu bylo faktycznie pokryte zapisami.
const availability = spanMs > 0 ? ((spanMs - lostMs) / spanMs) * 100 : 100;

out(`  plik              ${cfg.historyDbAbs}`);
out(`  okres             ${formatMoment(firstMs)}  →  ${formatMoment(lastMs)}`);
out(`  długość okresu    ${formatDuration(spanMs)}`);
out(`  próg przerwy      ${formatDuration(thresholdMs)} (heartbeat ${cfg.HISTORY_HEARTBEAT_S} s)`);
out();
out(`  przerw            ${gaps.length}`);
out(`  czas bez danych   ${formatDuration(lostMs)}`);
out(`  dostępność        ${availability.toFixed(2)} %`);

if (gaps.length === 0) {
  out();
  out('  Ani jednej przerwy powyżej progu. Zbieranie było ciągłe.');
  out();
  process.exit(0);
}

// Najdluzsze przerwy na wierzchu — one najbardziej boli w analizie.
const worst = [...gaps].sort((a, b) => b.durationMs - a.durationMs).slice(0, 20);

out();
out('  Najdłuższe przerwy:');
out(`  ${'─'.repeat(66)}`);
for (const gap of worst) {
  out(`  ${formatMoment(gap.fromMs)}  →  ${formatMoment(gap.toMs)}   ${formatDuration(gap.durationMs)}`);
}

if (gaps.length > worst.length) {
  out(`  … oraz ${gaps.length - worst.length} krótszych.`);
}

out();
out('  Najczęstsze przyczyny przerw:');
out('    • laptop uśpiony (zamknięta pokrywa, brak aktywności)');
out('    • restart po aktualizacji Windows bez autostartu serwera');
out('    • zerwana łączność z Miniserverem (patrz też widok Diagnostyka)');
out('    • serwer zatrzymany ręcznie');
out();
out('  Jak temu zapobiec: README, rozdział „Zbieranie danych bez przerw".');
out();

db.close();
