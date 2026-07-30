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
import type { BankId, BankState, PointValues, Session, SourceKind } from '@magazyn-pcm/shared';
import { ConfigError, envFileExists, loadConfig } from './config.js';
import { DEFAULT_MATERIAL, MATERIALS } from './materials.config.js';
import { createRegistry, RegistryError } from './registry.js';
import { ValueCache } from './cache.js';
import { HealthTracker } from './health.js';
import { registerApi } from './api/routes.js';
import { registerAuth } from './auth.js';
import { BankDetector } from './bank-detector.js';
import { renderPcmTable } from './console-view.js';
import { NdjsonHistoryStore } from './history/ndjson-store.js';
import { SqliteHistoryStore } from './history/sqlite-store.js';
import { NullHistoryStore, type HistoryRecord, type HistoryStore } from './history/store.js';
import { SessionStore } from './session-store.js';
import { StreamHub } from './stream.js';
import path from 'node:path';
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

  // Wybor zapisu historii. Reszta aplikacji zna wylacznie interfejs
  // HistoryStore, wiec ta decyzja nie wychodzi poza te linie.
  const history: HistoryStore = !cfg.HISTORY_ENABLED
    ? new NullHistoryStore()
    : cfg.HISTORY_BACKEND === 'sqlite'
      ? new SqliteHistoryStore({ file: cfg.historyDbAbs, logger })
      : new NdjsonHistoryStore({ dir: cfg.historyDirAbs, logger });

  // Odczyt historii istnieje tylko przy backendzie SQLite. Przy ndjson
  // /api/history odpowiada kontraktem "niedostepne" — frontend ma na to
  // gotowa sciezke od pierwszej wersji.
  const historyReader = history instanceof SqliteHistoryStore ? history : null;

  // Sesje badawcze zyja w osobnym pliku JSON — patrz komentarz w SessionStore.
  const sessionStore = new SessionStore(
    path.join(path.dirname(cfg.historyDbAbs), 'sesje.json'),
    logger,
  );


  // --- Zrodlo danych -------------------------------------------------------
  const sourceKind: SourceKind = cfg.isMock ? 'mock' : 'http-poll';

  // Klient Loxone tworzymy przed detektorem zestawu, bo detektor tez z niego
  // korzysta (musi odpytac sondy obu zbiornikow).
  const client = cfg.isMock
    ? null
    : new LoxoneClient({
        host: cfg.LOXONE_HOST,
        user: cfg.LOXONE_USER,
        pass: cfg.LOXONE_PASS,
        timeoutMs: cfg.LOXONE_TIMEOUT_MS,
      });

  /**
   * Wymienne zbiorniki. Zestaw jest tozsamy z parafina, wiec jego rozpoznanie
   * ustawia jednoczesnie wlasciwa skale barwna.
   *
   * W trybie syntetycznym nie ma czego wykrywac — zestaw bierzemy z sesji albo
   * z wymuszenia w konfiguracji.
   */
  const forcedBank: BankId | null = cfg.FORCE_BANK === '' ? null : cfg.FORCE_BANK;

  const bankDetector =
    client && registry.knownBanks().length > 0
      ? new BankDetector({
          client,
          points: registry.all(),
          banks: registry.knownBanks(),
          logger,
          forcedBank,
        })
      : null;

  /** Aktywny zestaw: reczne wymuszenie, potem sesja, potem detekcja. */
  const activeBank = (): BankId | null =>
    forcedBank ?? bankDetector?.activeBank ?? sessionStore.current()?.material ?? DEFAULT_MATERIAL;

  const bankState = (): BankState =>
    bankDetector?.snapshot() ?? {
      active: activeBank(),
      detection: forcedBank ? 'manual' : 'unknown',
      alive: {},
      message: cfg.isMock
        ? 'Dane syntetyczne — zestaw sond nie jest wykrywany.'
        : 'Rejestr punktów nie ma jeszcze UUID-ów dla zestawów.',
    };

  // Material: sesja ma pierwszenstwo (badacz zadeklarowal, co bada),
  // a gdy sesji nie ma — wykryty zbiornik.
  const materialId = sessionStore.current()?.material ?? activeBank() ?? DEFAULT_MATERIAL;
  const material = MATERIALS[materialId];

  const healthTracker = new HealthTracker({
    sourceKind,
    pollIntervalMs: cfg.POLL_INTERVAL_MS,
    staleAfterMs: cfg.staleAfterMs,
    registry,
    cache,
    getBank: bankState,
  });

  const stream = new StreamHub(logger, () => healthTracker.snapshot());

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
    source = new HttpPollSource({
      client: client!,
      // Cele odpytywania zaleza od AKTYWNEGO ZESTAWU, a ten moze sie zmienic
      // po wymianie zbiornika — dlatego funkcja, nie lista.
      resolveTargets: () =>
        registry
          .pollablePoints(activeBank())
          .map((point) => ({ id: point.id, uuid: registry.uuidFor(point, activeBank())! })),
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

  /**
   * Punkty, ktore uznajemy juz za przestarzale. Trzymamy to jawnie, bo
   * przejscie w stan przestarzaly nie generuje zadnego odczytu — bez tego
   * zbioru cisza czujnika bylaby dla przegladarki nieodroznialna od
   * stabilnej temperatury.
   */
  const staleIds = new Set<string>();

  source.onReadings((readings) => {
    const toPersist: HistoryRecord[] = [];
    // Do przegladarki idzie tylko to, co sie zmienilo.
    const changedValues: PointValues = {};

    for (const reading of readings) {
      if (!registry.has(reading.id)) {
        logger.warn({ id: reading.id }, 'Zrodlo zwrocilo punkt, ktorego nie ma w rejestrze');
        continue;
      }

      const update = cache.set(reading.id, reading.v, reading.readAtMs);

      // Wysylamy tez punkt, ktory wlasnie przestal byc przestarzaly —
      // sama wartosc sie nie zmienila, ale jej znaczenie owszem.
      if (update.changed || staleIds.has(reading.id)) {
        changedValues[reading.id] = update.value;
        staleIds.delete(reading.id);
      }

      // Do historii idzie kazda ZMIANA wartosci, a dodatkowo — co
      // HISTORY_HEARTBEAT_S — wartosc niezmieniona. Dzieki temu w danych
      // widac roznice miedzy stabilna temperatura a martwym czujnikiem.
      const lastWrite = lastHistoryWriteMs.get(reading.id);
      const heartbeatDue =
        heartbeatMs > 0 && (lastWrite === undefined || reading.readAtMs - lastWrite >= heartbeatMs);

      if (update.changed || heartbeatDue) {
        const point = registry.get(reading.id);
        toPersist.push({
          id: reading.id,
          v: reading.v,
          tsMs: reading.readAtMs,
          // Zbiornik zapisujemy tylko przy sondach, ktore sie z nim wymieniaja.
          bank: point && registry.isBanked(point) ? activeBank() : null,
        });
        lastHistoryWriteMs.set(reading.id, reading.readAtMs);
      }
    }

    if (toPersist.length > 0) void history.append(toPersist);

    stream.sendValues(changedValues);
    stream.sendHealthIfChanged(healthTracker.snapshot());
  });

  /**
   * Przeglad przestarzalych. Uruchamiany czesciej niz prog przestarzalosci,
   * zeby awaria sondy pokazala sie na ekranie bez zwleki.
   */
  const staleSweepMs = Math.max(Math.round(cfg.staleAfterMs / 3), 1000);

  const staleSweepTimer = setInterval(() => {
    const newlyStale: PointValues = {};

    for (const point of registry.all()) {
      // Punkt, z ktorego nigdy nie bylo odczytu, nie "staje sie" przestarzaly —
      // on po prostu nie ma danych i klient wie to ze snapshotu.
      if (!cache.hasReading(point.id)) continue;

      const value = cache.get(point.id);
      if (value.stale && !staleIds.has(point.id)) {
        staleIds.add(point.id);
        newlyStale[point.id] = value;
      }
    }

    if (Object.keys(newlyStale).length > 0) {
      logger.warn(
        { ids: Object.keys(newlyStale) },
        'Punkty przestały odpowiadać — oznaczam wartości jako przestarzałe',
      );
      stream.sendValues(newlyStale);
    }

    stream.sendHealthIfChanged(healthTracker.snapshot());
  }, staleSweepMs);

  staleSweepTimer.unref();

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

  const getSession = (): Session | null => sessionStore.currentAsSession();

  // Brama logowania rejestruje sie PRZED endpointami, zeby jej hook
  // obejmowal takze SSE. Bez tego strumien wartosci wyciekalby bez hasla.
  await registerAuth(app, {
    enabled: cfg.AUTH_ENABLED,
    passwordHash: cfg.AUTH_PASSWORD_HASH,
    sessionDays: cfg.AUTH_SESSION_DAYS,
    dataDir: path.dirname(cfg.historyDbAbs),
    logger,
  });

  await registerApi(app, {
    registry,
    cache,
    health: healthTracker,
    stream,
    sessions: sessionStore,
    historyReader,
    cfg,
    getSession,
  });
  await app.listen({ host: cfg.HOST, port: cfg.PORT });

  // --- Rozpoznanie zestawu sond -------------------------------------------
  // Robimy to PRZED startem odpytywania, zeby pierwszy cykl trafil od razu
  // w UUID-y wlasciwego zbiornika.
  let bankTimer: NodeJS.Timeout | null = null;

  if (bankDetector) {
    try {
      await bankDetector.detect();
      const state = bankDetector.snapshot();
      if (state.active) {
        logger.info({ zestaw: state.active, sondy: state.alive }, 'Aktywny zbiornik rozpoznany');
      } else {
        logger.warn({ powod: state.message }, 'Nie rozpoznano zbiornika');
      }
    } catch (error) {
      logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'Rozpoznanie zbiornika nie udalo sie — probuje dalej w tle',
      );
    }

    // Wymiana zbiornika w trakcie pracy nie moze wymagac restartu aplikacji.
    bankTimer = setInterval(() => {
      void bankDetector
        .detect()
        .then((changed) => {
          if (changed) {
            // Zmiana zbiornika zmienia znaczenie danych — klienci musza
            // dowiedziec sie od razu, a nie przy nastepnym odswiezeniu.
            stream.sendHealth(healthTracker.snapshot());
          }
        })
        .catch(() => {
          // Blad detekcji nie moze przerwac zbierania danych.
        });
    }, cfg.BANK_RECHECK_S * 1000);
    bankTimer.unref();
  }

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
      `  parafina (skala)     ${material.label} · ${material.scaleMin}–${material.scaleMax} °C · przemiana ${material.phaseBandMin}–${material.phaseBandMax} °C`,
      `  zbiornik (zestaw)    ${(() => {
        const state = bankState();
        if (!state.active) return 'nierozpoznany';
        const label = MATERIALS[state.active].label;
        // Trzy rozne rzeczy: rozpoznane po sondach, wymuszone w .env,
        // albo tylko zalozone (tryb syntetyczny, brak UUID-ow).
        if (state.detection === 'auto') return `${label} (rozpoznany po sondach)`;
        if (state.detection === 'manual') return `${label} (wymuszony w .env)`;
        return `${label} (założony — brak rozpoznania)`;
      })()}`,
      `  historia             ${
        cfg.HISTORY_ENABLED
          ? `${history.kind} → ${cfg.HISTORY_BACKEND === 'sqlite' ? cfg.historyDbAbs : cfg.historyDirAbs}`
          : 'wyłączona'
      }`,
      `  API                  http://${cfg.HOST}:${cfg.PORT}/api/snapshot`,
      `  strumień zmian       http://${cfg.HOST}:${cfg.PORT}/api/stream`,
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
    if (bankTimer) clearInterval(bankTimer);
    clearInterval(staleSweepTimer);

    stream.close();
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
