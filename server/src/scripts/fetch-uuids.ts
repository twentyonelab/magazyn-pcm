/**
 * Skrypt pomocniczy: pobiera strukture instalacji z Miniservera, wypisuje
 * kontrolki z UUID-ami i DOPASOWUJE sondy magazynu do punktow rejestru.
 *
 * Uruchomienie (z sieci laboratorium):
 *   npm run uuid            — podglad: co znalazlem i co proponuje
 *   npm run uuid -- --zapisz  — wpisuje UUID-y do points.config.ts
 *   npm run uuid -- --zapisz --nadpisz  — nadpisuje takze juz przypisane
 *
 * Skrypt jest zarazem PIERWSZYM TESTEM LACZNOSCI: sprawdza, czy Miniserver
 * z firmware 17.1.6.30 akceptuje uwierzytelnianie HTTP Basic. Jesli nie,
 * powie to wprost — zamiast pozostawic zagadke w logach serwera.
 *
 * Skrypt TYLKO CZYTA z Miniservera. Nie wysyla zadnej komendy sterujacej.
 * Zapisuje wylacznie lokalny plik rejestru punktow, po kopii zapasowej.
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
import { applyUuids, matchCandidates } from './match-points.js';

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

  // --- Dopasowanie sond magazynu do punktow rejestru ----------------------
  const result = matchCandidates(
    POINTS,
    controls.map((control) => ({
      name: control.name,
      uuid: control.valueUuid ?? control.actionUuid,
    })),
  );

  out();
  out(line);
  out('  DOPASOWANIE SOND MAGAZYNU');
  out(line);
  out('  Konwencja nazw: cyfra = poziom, litera = przekątna (1A → punkt A1).');
  out('  Oznaczenie materiału w nazwie (np. _57HC) jest pomijane.');
  out();

  if (result.matches.length === 0) {
    out('  Nie rozpoznałem ani jednej sondy po nazwie.');
    out('  Nazwij kontrolki w Loxone Config według wzoru 1A, 2B, 3A…');
    out('  albo wpisz UUID-y ręcznie do server/src/points.config.ts.');
  } else {
    // Odczyt kontrolny: czy pod tym UUID-em faktycznie jest temperatura?
    // To wyłapuje pomyłkę w mapowaniu ZANIM zacznie się zbieranie danych.
    out('  punkt   nazwa w Loxone        odczyt      UUID');
    out(`  ${'─'.repeat(74)}`);

    for (const match of result.matches) {
      let reading = '—';
      if (match.candidate.uuid) {
        try {
          const state = await client.readState(match.candidate.uuid);
          reading = state.value === null ? `(${state.raw || 'brak'})` : `${state.value.toFixed(1)} °C`;
        } catch {
          reading = '(błąd odczytu)';
        }
      }
      out(
        `  ${match.pointId.padEnd(7)} ${match.candidate.name.padEnd(20)} ` +
          `${reading.padEnd(11)} ${match.candidate.uuid ?? '—'}`,
      );
    }
  }

  if (result.ambiguous.length > 0) {
    out();
    out('  NIEJEDNOZNACZNE — do jednej pozycji pasuje kilka kontrolek:');
    for (const item of result.ambiguous) {
      out(`    ${item.pointId}: ${item.names.join(' , ')}`);
    }
    out('  Zmień nazwy w Loxone Config albo przypisz UUID ręcznie.');
  }

  if (result.unmatchedPoints.length > 0) {
    out();
    out(`  BEZ DOPASOWANIA (${result.unmatchedPoints.length}): ${result.unmatchedPoints.join(', ')}`);
  }

  // --- Zapis do rejestru --------------------------------------------------
  const wantsWrite = process.argv.includes('--zapisz');
  const overwrite = process.argv.includes('--nadpisz');
  const assignments = result.matches
    .filter((m): m is { pointId: string; candidate: { name: string; uuid: string } } =>
      Boolean(m.candidate.uuid),
    )
    .map((m) => ({ pointId: m.pointId, uuid: m.candidate.uuid }));

  out();
  out(line);
  out('  CO DALEJ');
  out(line);
  out(`  Pełna struktura     ${structureFile}`);
  out(`  Lista kontrolek     ${controlsFile}`);
  out();

  if (!wantsWrite) {
    if (assignments.length > 0) {
      out(`  Znalazłem ${assignments.length} sond gotowych do przypisania.`);
      out('  Sprawdź, czy odczyty powyżej mają sens (czy to na pewno te pozycje),');
      out('  a potem pozwól skryptowi wpisać UUID-y do rejestru:');
      out();
      out('      npm run uuid -- --zapisz');
      out();
      out('  Nic nie zostało jeszcze zmienione. Kopia rejestru powstanie');
      out('  automatycznie przed zapisem.');
    } else {
      out('  Nie ma czego zapisać — najpierw popraw nazwy kontrolek w Loxone Config.');
    }
    out();
    return;
  }

  if (assignments.length === 0) {
    out('  Nie ma czego zapisać.');
    out();
    return;
  }

  const registryFile = path.join(repoRoot, 'server', 'src', 'points.config.ts');
  const source = fs.readFileSync(registryFile, 'utf8');
  const applied = applyUuids(source, assignments, overwrite);

  if (applied.text === source) {
    out('  Rejestr nie wymagał zmian.');
    if (applied.skipped.length > 0) {
      out(`  Pominięte (mają już UUID): ${applied.skipped.join(', ')}`);
      out('  Żeby nadpisać: npm run uuid -- --zapisz --nadpisz');
    }
    out();
    return;
  }

  // Kopia zapasowa PRZED zapisem — rejestr to plik, w ktorym literowka
  // kosztuje cala historie pomiarow.
  const backup = `${registryFile}.kopia-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(registryFile, backup);
  fs.writeFileSync(registryFile, applied.text, 'utf8');

  const written = assignments
    .filter((a) => !applied.failed.includes(a.pointId) && !applied.skipped.includes(a.pointId))
    .map((a) => a.pointId);

  out(`  ZAPISANO ${written.length} UUID-ów do rejestru: ${written.join(', ')}`);
  out(`  Kopia poprzedniej wersji: ${path.basename(backup)}`);

  if (applied.skipped.length > 0) {
    out(`  Pominięte (mają już UUID): ${applied.skipped.join(', ')}`);
    out('  Żeby nadpisać: npm run uuid -- --zapisz --nadpisz');
  }
  if (applied.failed.length > 0) {
    out(`  NIE UDAŁO SIĘ podmienić: ${applied.failed.join(', ')} — wpisz ręcznie.`);
  }

  out();
  out('  Teraz:');
  out('    1. ustaw LOXONE_SOURCE=http w pliku .env (jeśli jeszcze nie),');
  out('    2. uruchom  npm run dev,');
  out('    3. sprawdź w konsoli sześć temperatur i widok Diagnostyka.');
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
