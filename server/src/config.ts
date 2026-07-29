/**
 * Konfiguracja z pliku .env, walidowana przez zod.
 *
 * Dane logowania do Miniservera zyja WYLACZNIE tutaj i w .env.
 * Nigdy nie trafiaja do kodu ani do niczego, co widzi przegladarka.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Katalog glowny monorepo (server/src -> server -> korzen). */
export const repoRoot = path.resolve(here, '..', '..');

const envPath = path.join(repoRoot, '.env');
export const envFileExists = fs.existsSync(envPath);
if (envFileExists) {
  dotenv.config({ path: envPath, quiet: true });
}

/** Pomocnik: liczba z tekstu, z domyslna wartoscia. */
const numberFromEnv = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const booleanFromEnv = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  LOXONE_SOURCE: z.enum(['mock', 'http']).default('mock'),

  LOXONE_HOST: z.string().min(1).default('192.168.1.27'),
  LOXONE_USER: z.string().default(''),
  LOXONE_PASS: z.string().default(''),
  LOXONE_TIMEOUT_MS: numberFromEnv(4000, 500, 60_000),

  POLL_INTERVAL_MS: numberFromEnv(5000, 1000, 600_000),
  STALE_FACTOR: numberFromEnv(3, 2, 100),

  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: numberFromEnv(4000, 1, 65_535),

  HISTORY_ENABLED: booleanFromEnv(true),
  /** sqlite = docelowy zapis; ndjson = awaryjne wyjscie bez zaleznosci natywnych. */
  HISTORY_BACKEND: z.enum(['sqlite', 'ndjson']).default('sqlite'),
  HISTORY_DB: z.string().default('./data/pomiary.db'),
  HISTORY_DIR: z.string().default('./data/history'),
  HISTORY_HEARTBEAT_S: numberFromEnv(300, 0, 86_400),

  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),
  CONSOLE_TABLE: booleanFromEnv(true),
});

export type RawConfig = z.infer<typeof schema>;

export interface AppConfig extends RawConfig {
  /** Po tym czasie bez udanego odczytu wartosc jest przestarzala. */
  staleAfterMs: number;
  /** Bezwzgledna sciezka katalogu historii (backend ndjson). */
  historyDirAbs: string;
  /** Bezwzgledna sciezka pliku bazy (backend sqlite). */
  historyDbAbs: string;
  /** true = pracujemy na danych syntetycznych. */
  isMock: boolean;
}

/** Blad konfiguracji z komunikatem gotowym do pokazania czlowiekowi. */
export class ConfigError extends Error {
  readonly hints: string[];
  constructor(message: string, hints: string[] = []) {
    super(message);
    this.name = 'ConfigError';
    this.hints = hints;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (i) => `${i.path.join('.') || '(nieznane)'}: ${i.message}`,
    );
    throw new ConfigError('Konfiguracja w pliku .env jest niepoprawna.', [
      ...problems,
      'Porównaj swój .env z plikiem .env.example.',
    ]);
  }

  const cfg = parsed.data;

  // Prawdziwy Miniserver bez danych logowania nie ma sensu — lepiej powiedziec
  // to teraz, niz wygenerowac serie odrzuconych logowan.
  if (cfg.LOXONE_SOURCE === 'http' && (!cfg.LOXONE_USER || !cfg.LOXONE_PASS)) {
    const hints = [
      'Uzupełnij LOXONE_USER i LOXONE_PASS w pliku .env.',
      'W Loxone Config załóż osobnego użytkownika TYLKO DO ODCZYTU — nie używaj konta admin.',
      'Albo ustaw LOXONE_SOURCE=mock, żeby pracować na danych syntetycznych bez laboratorium.',
    ];
    if (!envFileExists) {
      hints.unshift('Nie widzę pliku .env — skopiuj .env.example do .env i uzupełnij hasło.');
    }
    throw new ConfigError(
      'Wybrane źródło to prawdziwy Miniserver (LOXONE_SOURCE=http), ale brakuje nazwy użytkownika lub hasła.',
      hints,
    );
  }

  return {
    ...cfg,
    staleAfterMs: cfg.POLL_INTERVAL_MS * cfg.STALE_FACTOR,
    historyDirAbs: path.isAbsolute(cfg.HISTORY_DIR)
      ? cfg.HISTORY_DIR
      : path.resolve(repoRoot, cfg.HISTORY_DIR),
    historyDbAbs: path.isAbsolute(cfg.HISTORY_DB)
      ? cfg.HISTORY_DB
      : path.resolve(repoRoot, cfg.HISTORY_DB),
    isMock: cfg.LOXONE_SOURCE === 'mock',
  };
}
