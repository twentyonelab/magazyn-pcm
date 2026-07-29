/**
 * Punkt startowy middleware.
 *
 * Krok 1: odczyt szesciu temperatur z magazynu PCM i wypisanie ich w konsoli
 * co 5 sekund, plus trzy endpointy REST.
 *
 * Kolejnosc skladania aplikacji:
 *   konfiguracja -> rejestr punktow -> cache + zdrowie + historia ->
 *   zrodlo danych -> serwer HTTP -> tabela w konsoli
 */

import { spawnSync } from 'node:child_process';
import Fastify, { LogController, type FastifyBaseLogger } from 'fastify';
import pino from 'pino';
import type { Session, SourceKind } from '@magazyn-pcm/shared';
import { ConfigError, envFileExists, loadConfig } from './config.js';
import { DEFAULT_MATERIAL, MATERIALS } from './materials.config.js';
import { createRegistry, RegistryError } from './registry.js';
import { ValueCache } from './cache.js';
import { HealthTracker } from './health.js';
import { registerApi } from './api/routes.js';
import { renderPcmTable } from './console-view.js';
import { NdjsonHistoryStore } from './history/ndjson-store.js';
import { NullHistoryStore, type HistoryRecord, type HistoryStore } from './history/store.js';
import type { LoxoneSource } from './loxone/source.js';
import { LoxoneClient } from './loxone/client.js';
import { HttpPollSource } from './loxone/http-poll-source.js';
import { MockSource } from './loxone/mock-source.js';

/**
 * Windows: ustaw strone kodowa konsoli na UTF-8, inaczej polskie znaki
 * i symbol stopnia wyswietlaja sie jako krzaki.
 */
function ensureUtf8Console(): void {
  if (process.platform !== 'win32') return;
  try {
    spawnSync('chcp.com', ['65001'], { stdio: 'ignore' });
  } catch {
    // Nieudane ustawienie kodowania nie jest powodem, zeby nie wystartowac.
  }
}

/** Wypisuje blad konfiguracji w formie zrozumialej dla czlowieka. */
function printFatal(title: string, hints: readonly string[]): void {
  const line = '─'.repeat(72);
  process.stderr.write(`\n${line}\n${title}\n`);
  for (const hint of hints) process.stderr.write(`  • ${hint}\n`);
  process.stderr.write(`${line}\n\n`);
}

async function main(): Promise<void> {
  ensureUtf8Console();

  // --- Konfiguracja --------------------------------------------------------
  let cfg;
  try {
    cfg = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      printFatal(error.message, error.hints);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const logger = pino({
    level: cfg.LOG_LEVEL,
    ...(process.stdout.isTTY
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
  });

  if (!envFileExists) {
    logger.warn(
      'Nie znalazłem pliku .env — działam na wartościach domyślnych. ' +
        'Skopiuj .env.example do .env, żeby ustawić własne.',
    );
  }

  // --- Rejestr punktow -----------------------------------------------------
  let registry;
  try {
    registry = createRegistry();
  } catch (error) {
    if (error instanceof RegistryError) {
      printFatal('Rejestr punktow (server/src/points.config.ts) zawiera bledy:', error.problems);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const pcmPoints = registry.pcmPoints();
  const pollable = registry.pollablePoints();
  const pendingUuid = registry.pendingUuidPoints();

  // --- Cache, zdrowie, historia -------------------------------------------
  const cache = new ValueCache(cfg.staleAfterMs);

  const history: HistoryStore = cfg.HISTORY_ENABLED
    ? new NdjsonHistoryStore({ dir: cfg.historyDirAbs, logger })
    : new NullHistoryStore();

  // --- Zrodlo danych -------------------------------------------------------
  const material = MATERIALS[DEFAULT_MATERIAL];
  const sourceKind: SourceKind = cfg.isMock ? 'mock' : 'http-poll';

  const healthTracker = new HealthTracker({
    sourceKind,
    pollIntervalMs: cfg.POLL_INTERVAL_MS,
    staleAfterMs: cfg.staleAfterMs,
    registry,
    cache,
  });

  let source: LoxoneSource;

  if (cfg.isMock) {
    // Zrodlo syntetyczne symuluje punkty zadeklarowane jako dostepne,
    // niezaleznie od tego, czy maja juz przypisany UUID.
    source = new MockSource({
      points: registry.all().filter((p) => p.available),
      intervalMs: cfg.POLL_INTERVAL_MS,
      material,
      logger,
    });
  } else {
    const client = new LoxoneClient({
      host: cfg.LOXONE_HOST,
      user: cfg.LOXONE_USER,
      pass: cfg.LOXONE_PASS,
      timeoutMs: cfg.LOXONE_TIMEOUT_MS,
    });

    source = new HttpPollSource({
      client,
      points: pollable,
      intervalMs: cfg.POLL_INTERVAL_MS,
      logger,
      onConfigChanged: () => healthTracker.markConfigChanged(),
    });
  }

  // --- Podlaczenie zrodla do reszty aplikacji ------------------------------
  // Wszystko ponizej dziala identycznie dla kazdej implementacji LoxoneSource.

  /** Kiedy ostatnio zapisalismy dany punkt do historii (ms epoch). */
  const lastHistoryWriteMs = new Map<string, number>();
  const heartbeatMs = cfg.HISTORY_HEARTBEAT_S * 1000;

  source.onReadings((readings) => {
    const toPersist: HistoryRecord[] = [];

    for (const reading of readings) {
      if (!registry.has(reading.id)) {
        logger.warn({ id: reading.id }, 'Zrodlo zwrocilo punkt, ktorego nie ma w rejestrze');
        continue;
      }

      const update = cache.set(reading.id, reading.v, reading.readAtMs);

      // Do historii idzie kazda ZMIANA wartosci, a dodatkowo — co
      // HISTORY_HEARTBEAT_S — wartosc niezmieniona. Dzieki temu w danych
      // widac roznice miedzy stabilna temperatura a martwym czujnikiem.
      const lastWrite = lastHistoryWriteMs.get(reading.id);
      const heartbeatDue =
        heartbeatMs > 0 && (lastWrite === undefined || reading.readAtMs - lastWrite >= heartbeatMs);

      if (update.changed || heartbeatDue) {
        toPersist.push({ id: reading.id, v: reading.v, tsMs: reading.readAtMs });
        lastHistoryWriteMs.set(reading.id, reading.readAtMs);
      }
    }

    if (toPersist.length > 0) void history.append(toPersist);
  });

  source.onHealth((event) => {
    healthTracker.update({
      status: event.status,
      latencyMs: event.latencyMs,
      message: event.message ?? null,
    });

    if (event.fatal) {
      printFatal(event.message ?? 'Źródło danych zatrzymało się z powodu błędu trwałego.', [
        'Odpytywanie zostało ZATRZYMANE — to celowe, żeby Miniserver nie zablokował konta.',
        'Popraw dane w pliku .env i uruchom serwer ponownie.',
        'Stan błędu jest też widoczny pod adresem /api/health.',
      ]);
    }
  });

  // --- Serwer HTTP ---------------------------------------------------------
  // Logger podajemy jako FastifyBaseLogger — inaczej Fastify wywnioskowalby
  // konkretny typ pino i instancja przestalaby pasowac do FastifyInstance.
  // Log kazdego zapytania HTTP zasmiecalby konsole, w ktorej co 5 s pojawia
  // sie tabela temperatur.
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    logController: new LogController({ disableRequestLogging: true }),
  });

  // Krok 1 nie zarzadza sesjami badawczymi — null jest realnym stanem
  // "zaden test nie jest uruchomiony" i frontend musi go obslugiwac od poczatku.
  const getSession = (): Session | null => null;

  await registerApi(app, { registry, cache, health: healthTracker, getSession });
  await app.listen({ host: cfg.HOST, port: cfg.PORT });

  // --- Start zrodla --------------------------------------------------------
  await source.start();

  // --- Baner startowy -----------------------------------------------------
  const line = '─'.repeat(72);
  const sourceLabel = cfg.isMock
    ? 'dane syntetyczne (mock)'
    : `Miniserver ${cfg.LOXONE_HOST}, odpytywanie HTTP`;

  process.stdout.write(
    [
      '',
      line,
      '  MAGAZYN PCM · middleware',
      line,
      `  źródło danych        ${sourceLabel}`,
      `  interwał odczytu     ${cfg.POLL_INTERVAL_MS / 1000} s`,
      `  próg przestarzałości ${cfg.staleAfterMs / 1000} s (${cfg.STALE_FACTOR} × interwał)`,
      `  punkty w magazynie   ${pcmPoints.length}`,
      `  punkty odpytywane    ${cfg.isMock ? registry.all().filter((p) => p.available).length : pollable.length}`,
      `  materiał (skala)     ${material.label} · ${material.scaleMin}–${material.scaleMax} °C · przemiana ${material.phaseBandMin}–${material.phaseBandMax} °C`,
      `  historia             ${cfg.HISTORY_ENABLED ? `${history.kind} → ${cfg.historyDirAbs}` : 'wyłączona'}`,
      `  API                  http://${cfg.HOST}:${cfg.PORT}/api/snapshot`,
      line,
      '',
    ].join('\n'),
  );

  if (!cfg.isMock && pendingUuid.length > 0) {
    printFatal(
      `${pendingUuid.length} punktów nie ma jeszcze przypisanego UUID-a, więc nie da się ich odczytać.`,
      [
        `Punkty: ${pendingUuid.map((p) => p.id).join(', ')}`,
        'Podłącz się do sieci laboratorium i uruchom: npm run uuid',
        'Wklej UUID-y do server/src/points.config.ts.',
        'Żeby popracować bez laboratorium, ustaw LOXONE_SOURCE=mock w pliku .env.',
      ],
    );
  }

  // --- Tabela w konsoli ---------------------------------------------------
  let tableTimer: NodeJS.Timeout | null = null;

  if (cfg.CONSOLE_TABLE && pcmPoints.length > 0) {
    const printTable = (): void => {
      process.stdout.write(
        `${renderPcmTable({
          pcmPoints,
          getValue: (id) => cache.get(id),
          health: healthTracker.snapshot(),
          materialLabel: material.label,
        })}\n`,
      );
    };

    // Pierwszy wydruk po polowie interwalu, zeby zdazyl dojsc pierwszy odczyt.
    setTimeout(printTable, Math.min(cfg.POLL_INTERVAL_MS / 2, 2000));
    tableTimer = setInterval(printTable, cfg.POLL_INTERVAL_MS);
  }

  // --- Zamykanie ----------------------------------------------------------
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    process.stdout.write(`\nZamykam (${signal})…\n`);
    if (tableTimer) clearInterval(tableTimer);

    await source.stop();
    await history.close();
    await app.close();

    process.stdout.write('Zamkniete.\n');
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  printFatal('Serwer nie wystartował.', [
    error instanceof Error ? error.message : String(error),
  ]);
  process.exitCode = 1;
});
