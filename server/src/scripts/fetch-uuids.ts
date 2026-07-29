/**
 * Skrypt pomocniczy: pobiera strukture instalacji z Miniservera i wypisuje
 * wszystkie kontrolki wraz z UUID-ami, zeby dalo sie uzupelnic rejestr punktow.
 *
 * Uruchomienie (z sieci laboratorium):
 *   npm run uuid
 *
 * Skrypt jest zarazem PIERWSZYM TESTEM LACZNOSCI: sprawdza, czy Miniserver
 * z firmware 17.1.6.30 akceptuje uwierzytelnianie HTTP Basic. Jesli nie,
 * powie to wprost — zamiast pozostawic zagadke w logach serwera.
 *
 * Skrypt TYLKO CZYTA. Nie wysyla zadnej komendy sterujacej.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ConfigError, loadConfig, repoRoot } from '../config.js';
import {
  LoxoneAuthError,
  LoxoneClient,
  LoxoneNetworkError,
  type LoxApp3Control,
  type LoxApp3Structure,
} from '../loxone/client.js';
import { POINTS } from '../points.config.js';

const line = '─'.repeat(78);

function out(text = ''): void {
  process.stdout.write(`${text}\n`);
}

function fail(title: string, hints: readonly string[]): never {
  process.stderr.write(`\n${line}\n${title}\n`);
  for (const hint of hints) process.stderr.write(`  • ${hint}\n`);
  process.stderr.write(`${line}\n\n`);
  process.exit(1);
}

/** Kontrolka splaszczona do postaci wygodnej do wypisania. */
interface FlatControl {
  name: string;
  type: string;
  room: string;
  category: string;
  /** UUID stanu `value` — to jego uzywamy do odczytu wartosci. */
  valueUuid: string | null;
  /** UUID kontrolki (uuidAction) — dziala dla wiekszosci kontrolek analogowych. */
  actionUuid: string | null;
  format: string | null;
  states: Record<string, string>;
}

function firstUuid(state: string | string[] | undefined): string | null {
  if (typeof state === 'string') return state;
  if (Array.isArray(state)) return state[0] ?? null;
  return null;
}

function flatten(structure: LoxApp3Structure): FlatControl[] {
  const rooms = structure.rooms ?? {};
  const cats = structure.cats ?? {};
  const result: FlatControl[] = [];

  const visit = (control: LoxApp3Control, prefix = ''): void => {
    const states: Record<string, string> = {};
    for (const [key, value] of Object.entries(control.states ?? {})) {
      const uuid = firstUuid(value);
      if (uuid) states[key] = uuid;
    }

    result.push({
      name: `${prefix}${control.name ?? '(bez nazwy)'}`,
      type: control.type ?? '?',
      room: (control.room && rooms[control.room]?.name) || '—',
      category: (control.cat && cats[control.cat]?.name) || '—',
      valueUuid: states.value ?? null,
      actionUuid: control.uuidAction ?? null,
      format: control.details?.format ?? null,
      states,
    });

    for (const sub of Object.values(control.subControls ?? {})) {
      visit(sub, `${control.name ?? '?'} · `);
    }
  };

  for (const control of Object.values(structure.controls ?? {})) visit(control);
  return result;
}

/** Czy kontrolka wyglada na czujnik temperatury. */
function looksLikeTemperature(control: FlatControl): boolean {
  const haystack = `${control.name} ${control.format ?? ''}`.toLowerCase();
  return (
    haystack.includes('°') ||
    haystack.includes('temp') ||
    /\bpcm\b|magazyn|sonda|czujnik/.test(haystack)
  );
}

async function main(): Promise<void> {
  let cfg;
  try {
    cfg = loadConfig({ ...process.env, LOXONE_SOURCE: 'http' });
  } catch (error) {
    if (error instanceof ConfigError) fail(error.message, error.hints);
    throw error;
  }

  const client = new LoxoneClient({
    host: cfg.LOXONE_HOST,
    user: cfg.LOXONE_USER,
    pass: cfg.LOXONE_PASS,
    timeoutMs: Math.max(cfg.LOXONE_TIMEOUT_MS, 10_000),
  });

  out();
  out(line);
  out(`  ODCZYT STRUKTURY Z MINISERVERA · ${cfg.LOXONE_HOST}`);
  out(line);

  // --- Test 1: czy Basic auth dziala na tym firmware -----------------------
  out();
  out('1. Sprawdzam łączność i uwierzytelnianie HTTP Basic…');
  try {
    const info = await client.getApiInfo();
    out(`   OK — ${info.raw || '(pusta odpowiedź)'}  [${info.latencyMs} ms]`);
  } catch (error) {
    if (error instanceof LoxoneAuthError) {
      fail('Miniserver odrzucił logowanie.', [
        'Sprawdź LOXONE_USER i LOXONE_PASS w pliku .env.',
        'Sprawdź, czy użytkownik ma w Loxone Config uprawnienia do wizualizacji.',
        'NIE uruchamiaj tego skryptu w pętli — Miniserver blokuje konto po serii nieudanych logowań.',
        'Jeśli hasło jest pewne: nowsze firmware może wymagać uwierzytelniania tokenem.',
        'Wtedy trzeba przełączyć client.ts na tokeny — reszta aplikacji się nie zmienia.',
      ]);
    }
    if (error instanceof LoxoneNetworkError) {
      fail(error.message, [
        'Sprawdź, czy jesteś w tej samej sieci co Miniserver.',
        `Otwórz w przeglądarce: http://${cfg.LOXONE_HOST} — powinno poprosić o hasło.`,
        'Sprawdź adres LOXONE_HOST w pliku .env.',
      ]);
    }
    throw error;
  }

  // --- Test 2: struktura instalacji ---------------------------------------
  out();
  out('2. Pobieram LoxAPP3.json…');
  const { data: structure, latencyMs } = await client.getStructure();
  const controls = flatten(structure);
  out(`   OK — ${controls.length} kontrolek  [${latencyMs} ms]`);

  const ms = structure.msInfo ?? {};
  out();
  out(line);
  out('  MINISERVER');
  out(line);
  out(`  nazwa            ${ms.msName ?? '—'}`);
  out(`  projekt          ${ms.projectName ?? '—'}`);
  out(`  numer seryjny    ${ms.serialNr ?? '—'}`);
  out(`  firmware         ${ms.swVersion ?? '—'}`);
  out(`  lokalizacja      ${ms.location ?? '—'}`);
  out(`  lastModified     ${structure.lastModified ?? '—'}`);

  // --- Kandydaci na sondy temperatury -------------------------------------
  const candidates = controls.filter(looksLikeTemperature);

  if (candidates.length > 0) {
    out();
    out(line);
    out(`  PRAWDOPODOBNE CZUJNIKI TEMPERATURY (${candidates.length})`);
    out(line);
    for (const control of candidates) printControl(control);
  }

  // --- Wszystkie kontrolki, pogrupowane po pomieszczeniu ------------------
  out();
  out(line);
  out(`  WSZYSTKIE KONTROLKI (${controls.length})`);
  out(line);

  const byRoom = new Map<string, FlatControl[]>();
  for (const control of controls) {
    const bucket = byRoom.get(control.room);
    if (bucket) bucket.push(control);
    else byRoom.set(control.room, [control]);
  }

  for (const [room, roomControls] of [...byRoom.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], 'pl'),
  )) {
    out();
    out(`  ${room}  (${roomControls.length})`);
    for (const control of roomControls) printControl(control);
  }

  // --- Zapis do plikow ----------------------------------------------------
  const outDir = path.join(repoRoot, 'data', 'loxone');
  fs.mkdirSync(outDir, { recursive: true });

  const structureFile = path.join(outDir, 'LoxAPP3.json');
  const controlsFile = path.join(outDir, 'kontrolki.json');
  fs.writeFileSync(structureFile, JSON.stringify(structure, null, 2), 'utf8');
  fs.writeFileSync(controlsFile, JSON.stringify(controls, null, 2), 'utf8');

  // --- Podpowiedz do wklejenia -------------------------------------------
  const pending = POINTS.filter((p) => p.available && p.uuid === null);

  out();
  out(line);
  out('  CO DALEJ');
  out(line);
  out(`  Pełna struktura     ${structureFile}`);
  out(`  Lista kontrolek     ${controlsFile}`);
  out();

  if (pending.length === 0) {
    out('  Wszystkie dostępne punkty mają już przypisane UUID-y. Nic do zrobienia.');
  } else {
    out(`  W rejestrze czeka ${pending.length} punktów bez UUID-a:`);
    out(`  ${pending.map((p) => p.id).join(', ')}`);
    out();
    out('  Otwórz  server/src/points.config.ts  i wpisz UUID (kolumna "value")');
    out('  w miejsce null, na przykład:');
    out();
    out("      uuid: '0f869a41-0300-1c36-ffff504f94d0a3e3',");
    out();
    out('  Wskazówka: dla sond temperatury używaj UUID-a stanu "value".');
    out('  Gdy go nie ma, spróbuj UUID kontrolki (uuidAction).');
  }
  out();
}

function printControl(control: FlatControl): void {
  const uuid = control.valueUuid ?? control.actionUuid ?? '—';
  const kind = control.valueUuid ? 'value' : control.actionUuid ? 'action' : '—';
  out(`    ${control.name}`);
  out(
    `      ${uuid}  (${kind})  typ: ${control.type}` +
      `${control.format ? `  format: ${control.format}` : ''}` +
      `${control.category !== '—' ? `  kat.: ${control.category}` : ''}`,
  );
}

main().catch((error: unknown) => {
  fail('Nie udało się pobrać struktury z Miniservera.', [
    error instanceof Error ? error.message : String(error),
  ]);
});
