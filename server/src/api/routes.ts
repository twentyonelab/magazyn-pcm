/**
 * Kontrakt API. Frontend zna wylacznie te sciezki — nigdy nie dowiaduje sie,
 * ze Loxone istnieje.
 *
 *   GET  /api/points          rejestr punktow (bez UUID-ow)
 *   GET  /api/weather         pogoda dla stanowiska (Loxone albo Open-Meteo)
 *   GET  /api/snapshot        biezacy stan wszystkich wartosci
 *   GET  /api/stream          strumien zmian (SSE)
 *   GET  /api/materials       profile PCM, objetosci, przeplyw odniesienia
 *   GET  /api/health          stan lacznosci ze zrodlem
 *   GET  /api/config          konfiguracja do podgladu (bez danych logowania!)
 *   GET  /api/session         biezaca sesja badawcza albo null
 *   GET  /api/sessions        wszystkie sesje z historia zdarzen
 *   POST /api/session         rozpoczecie sesji
 *   POST /api/session/end     zakonczenie sesji
 *   POST /api/session/events  znacznik zdarzenia ("napelniono", ...)
 *   GET  /api/history         szereg czasowy z bazy pomiarow
 *   GET  /api/history.csv     surowe rekordy do analizy w arkuszu
 *
 * Sesje sa danymi WLASNYMI aplikacji — zadna z tych operacji nie wysyla
 * niczego do Loxone. Aplikacja dalej tylko czyta ze sterownika.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  ConfigResponse,
  HistoryResponse,
  MaterialsResponse,
  Session,
  Snapshot,
  WeatherReading,
} from '@magazyn-pcm/shared';
import {
  DEFAULT_MATERIAL,
  FLOW_FULL_SPEED_M3H,
  MATERIALS,
  VOLUMES_L,
} from '../materials.config.js';
import type { AppConfig } from '../config.js';
import type { ValueCache } from '../cache.js';
import type { HealthTracker } from '../health.js';
import type { PointRegistry } from '../registry.js';
import type { StreamHub } from '../stream.js';
import type { SqliteHistoryStore } from '../history/sqlite-store.js';
import { SessionStore, SessionStoreError } from '../session-store.js';
import type { WeatherService } from '../weather.js';

export interface ApiDeps {
  registry: PointRegistry;
  cache: ValueCache;
  health: HealthTracker;
  stream: StreamHub;
  sessions: SessionStore;
  /**
   * Odczyt historii. null = zapis idzie do pliku tekstowego (backend ndjson)
   * i odczytu jeszcze nie ma — /api/history odpowiada wtedy kontraktem
   * "niedostepne", ktory frontend obsluguje od poczatku.
   */
  historyReader: SqliteHistoryStore | null;
  weather: WeatherService;
  cfg: AppConfig;
  getSession: () => Session | null;
}

/** Nazwane rozdzielczosci historii -> sekundy kubelka. */
const RESOLUTIONS: Record<string, number> = {
  '30s': 30,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '6h': 21_600,
  '1d': 86_400,
};

/** Wiecej punktow na serie nie ma sensu — ekran ich nie pokaze. */
const MAX_POINTS_PER_SERIES = 3000;
/** Twardy limit wierszy CSV — chroni serwer przy tygodniowych zakresach. */
const MAX_CSV_ROWS = 500_000;

const historyQuerySchema = z.object({
  ids: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  resolution: z.string().default('auto'),
});

const startSessionSchema = z.object({
  material: z.enum(['RT8HC', 'RT57HC']),
  label: z.string().trim().min(1, 'etykieta sesji nie moze byc pusta').max(120),
  note: z.string().trim().max(2000).nullish(),
});

const addEventSchema = z.object({
  label: z.string().trim().min(1, 'tresc znacznika nie moze byc pusta').max(200),
});

function parseTime(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export async function registerApi(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const { registry, cache, health, stream, sessions, historyReader, weather, cfg, getSession } =
    deps;

  // Krótka lista endpointow — dla czlowieka, ktory wpisze adres w przegladarce.
  app.get('/', async () => ({
    app: 'magazyn-pcm',
    endpoints: [
      '/api/points',
      '/api/weather',
      '/api/snapshot',
      '/api/stream',
      '/api/materials',
      '/api/health',
      '/api/config',
      '/api/session',
      '/api/sessions',
      '/api/history',
      '/api/history.csv',
    ],
  }));

  app.get('/api/points', async () => registry.publicPoints());

  /**
   * Pogoda dla stanowiska. `null` znaczy „nie wiem" — i tak to jest pokazywane.
   *
   * Zapytanie do sluzby zewnetrznej idzie z SERWERA, nie z przegladarki:
   * jedno na dziesiec minut zamiast jednego na kazda otwarta karte, a przy
   * okazji przegladarka nie musi siegac nigdzie poza nasze /api.
   */
  app.get('/api/weather', async (_request, reply): Promise<WeatherReading | null> => {
    // Krotki cache po stronie przegladarki — pogoda i tak zmienia sie rzadziej.
    reply.header('Cache-Control', 'public, max-age=120');
    return weather.current();
  });

  /**
   * Konfiguracja materiałów i zbiorników. Bez tego frontend nie mógłby
   * poprawnie zbudować skali barwnej — a zakres skali decyduje o tym, czy
   * przemiana fazowa jest w ogóle widoczna.
   */
  app.get('/api/materials', async (): Promise<MaterialsResponse> => ({
    defaultMaterial: DEFAULT_MATERIAL,
    profiles: MATERIALS,
    volumesL: { buffer: VOLUMES_L.buffer, storage: VOLUMES_L.storage },
    flowFullSpeed: FLOW_FULL_SPEED_M3H,
  }));

  app.get('/api/snapshot', async (): Promise<Snapshot> => {
    const ids = registry.all().map((p) => p.id);
    return {
      ts: new Date().toISOString(),
      session: getSession(),
      values: cache.snapshot(ids),
      health: health.snapshot(),
    };
  });

  /**
   * Strumien zmian (SSE). Wysyla tylko zmienione punkty — klient scala je
   * z lokalnym stanem. Po ponownym polaczeniu klient powinien pobrac
   * /api/snapshot, zeby nadrobic to, co przegapil.
   */
  app.get('/api/stream', (request, reply) => {
    stream.addClient(request, reply);
    // Odpowiedzia zarzadza juz StreamHub (reply.hijack()).
  });

  app.get('/api/health', async (_request, reply) => {
    const snapshot = health.snapshot();
    // Odrzucone logowanie i brak lacznosci to stany, o ktorych warto wiedziec
    // takze po kodzie odpowiedzi HTTP.
    if (snapshot.source === 'auth_error' || snapshot.source === 'error') {
      reply.code(503);
    }
    return snapshot;
  });

  /**
   * Podglad konfiguracji dla widoku Ustawienia. Tylko do odczytu.
   * Dane logowania NIGDY tedy nie przechodza — celowo nie ma ich w typie.
   */
  app.get('/api/config', async (): Promise<ConfigResponse> => ({
    sourceKind: cfg.isMock ? 'mock' : 'http-poll',
    loxoneHost: cfg.LOXONE_HOST,
    pollIntervalMs: cfg.POLL_INTERVAL_MS,
    staleFactor: cfg.STALE_FACTOR,
    staleAfterMs: cfg.staleAfterMs,
    historyEnabled: cfg.HISTORY_ENABLED,
    historyBackend: cfg.HISTORY_BACKEND,
    historyPath: cfg.HISTORY_BACKEND === 'sqlite' ? cfg.historyDbAbs : cfg.historyDirAbs,
    historyRecords: historyReader ? historyReader.recordCount() : null,
    historyHeartbeatS: cfg.HISTORY_HEARTBEAT_S,
    mappings: registry.all().map((point) => ({
      id: point.id,
      label: point.label,
      uuid: point.uuid,
      group: point.group,
      kind: point.kind,
      unit: point.unit,
      available: point.available,
    })),
  }));

  // -------------------------------------------------------------------------
  // Sesje badawcze
  // -------------------------------------------------------------------------

  app.get('/api/session', async () => sessions.current());

  app.get('/api/sessions', async () => sessions.list());

  app.post('/api/session', async (request, reply) => {
    const body = startSessionSchema.safeParse(request.body);
    if (!body.success) {
      reply.code(400);
      return { error: body.error.issues.map((i) => i.message).join('; ') };
    }

    try {
      const record = sessions.start(body.data.material, body.data.label, body.data.note ?? null);
      // Zmiana sesji zmienia znaczenie danych — klienci SSE musza to zobaczyc
      // od razu, nie przy nastepnym odswiezeniu strony.
      stream.sendHealth(health.snapshot());
      reply.code(201);
      return record;
    } catch (error) {
      if (error instanceof SessionStoreError) {
        reply.code(error.statusCode);
        return { error: error.message };
      }
      throw error;
    }
  });

  app.post('/api/session/end', async (_request, reply) => {
    try {
      const record = sessions.end();
      stream.sendHealth(health.snapshot());
      return record;
    } catch (error) {
      if (error instanceof SessionStoreError) {
        reply.code(error.statusCode);
        return { error: error.message };
      }
      throw error;
    }
  });

  app.post('/api/session/events', async (request, reply) => {
    const body = addEventSchema.safeParse(request.body);
    if (!body.success) {
      reply.code(400);
      return { error: body.error.issues.map((i) => i.message).join('; ') };
    }

    try {
      const event = sessions.addEvent(body.data.label);
      reply.code(201);
      return event;
    } catch (error) {
      if (error instanceof SessionStoreError) {
        reply.code(error.statusCode);
        return { error: error.message };
      }
      throw error;
    }
  });

  // -------------------------------------------------------------------------
  // Historia pomiarow
  // -------------------------------------------------------------------------

  /**
   * Waliduje wspolne parametry historii. Zwraca null i ustawia odpowiedz,
   * gdy cos jest nie tak — wolajacy po prostu robi wtedy `return`.
   */
  const parseHistoryParams = (
    query: unknown,
    reply: { code: (n: number) => unknown },
  ): { ids: string[]; fromMs: number; toMs: number; resolution: string } | { error: string } => {
    const parsed = historyQuerySchema.safeParse(query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Wymagane parametry: ids, from, to. Opcjonalny: resolution.' };
    }

    const ids = parsed.data.ids
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const unknown = ids.filter((id) => !registry.has(id));
    if (ids.length === 0 || unknown.length > 0) {
      reply.code(400);
      return {
        error:
          unknown.length > 0
            ? `Nieznane punkty: ${unknown.join(', ')}.`
            : 'Podaj co najmniej jeden identyfikator punktu.',
      };
    }

    const fromMs = parseTime(parsed.data.from);
    const toMs = parseTime(parsed.data.to);
    if (fromMs === null || toMs === null || fromMs >= toMs) {
      reply.code(400);
      return { error: 'Zakres czasu jest niepoprawny: from musi być wcześniejsze niż to.' };
    }

    return { ids, fromMs, toMs, resolution: parsed.data.resolution };
  };

  app.get('/api/history', async (request, reply): Promise<HistoryResponse | { error: string }> => {
    // Kontrakt "niedostepne" — frontend obsluguje go od pierwszej wersji,
    // wiec wlaczenie historii bylo zmiana wylacznie po stronie serwera.
    if (!cfg.HISTORY_ENABLED) {
      return {
        available: false,
        reason: 'not_implemented',
        message: 'Zapis historii jest wyłączony (HISTORY_ENABLED=false).',
      };
    }
    if (!historyReader) {
      return {
        available: false,
        reason: 'not_implemented',
        message:
          'Historia zapisuje się do plików tekstowych (HISTORY_BACKEND=ndjson) — odczyt wymaga bazy SQLite. Ustaw HISTORY_BACKEND=sqlite.',
      };
    }

    const params = parseHistoryParams(request.query, reply);
    if ('error' in params) return params;
    const { ids, fromMs, toMs, resolution } = params;

    // Rozdzielczosc: nazwana, "raw" albo "auto" dobierane do zakresu tak,
    // zeby seria nie przekroczyla sensownej liczby punktow.
    let bucketMs: number;
    if (resolution === 'raw') {
      const count = historyReader.countRaw(ids, fromMs, toMs);
      if (count > MAX_POINTS_PER_SERIES * ids.length) {
        reply.code(400);
        return {
          error:
            `Surowe dane w tym zakresie to ${count} rekordów — za dużo do narysowania. ` +
            'Zawęź zakres albo wybierz grubszą rozdzielczość.',
        };
      }
      bucketMs = Math.max(cfg.POLL_INTERVAL_MS, 1000);
    } else if (resolution === 'auto') {
      bucketMs = Math.max(cfg.POLL_INTERVAL_MS, Math.ceil((toMs - fromMs) / 700 / 1000) * 1000);
    } else {
      const seconds = RESOLUTIONS[resolution];
      if (!seconds) {
        reply.code(400);
        return {
          error: `Nieznana rozdzielczość "${resolution}". Dostępne: auto, raw, ${Object.keys(RESOLUTIONS).join(', ')}.`,
        };
      }
      bucketMs = seconds * 1000;
      if ((toMs - fromMs) / bucketMs > MAX_POINTS_PER_SERIES) {
        reply.code(400);
        return {
          error: 'Ta rozdzielczość dałaby za dużo punktów dla tego zakresu — wybierz grubszą.',
        };
      }
    }

    return {
      available: true,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      resolution: `${Math.round(bucketMs / 1000)}s`,
      series: ids.map((id) => ({
        id,
        points: historyReader.queryBuckets(id, fromMs, toMs, bucketMs),
      })),
    };
  });

  /**
   * Surowe rekordy jako CSV — do analizy w arkuszu. Format uniwersalny:
   * przecinek jako separator, kropka dziesietna, czas ISO. Puste pole
   * w kolumnie wartosci to brak danych — nigdy zero.
   */
  app.get('/api/history.csv', async (request, reply) => {
    if (!historyReader) {
      reply.code(404);
      return { error: 'Eksport CSV wymaga bazy SQLite (HISTORY_BACKEND=sqlite).' };
    }

    const params = parseHistoryParams(request.query, reply);
    if ('error' in params) return params;
    const { ids, fromMs, toMs } = params;

    const count = historyReader.countRaw(ids, fromMs, toMs);
    if (count > MAX_CSV_ROWS) {
      reply.code(400);
      return {
        error: `Zakres zawiera ${count} rekordów — limit eksportu to ${MAX_CSV_ROWS}. Zawęź zakres.`,
      };
    }

    const lines: string[] = ['ts,punkt,wartosc'];
    for (const row of historyReader.iterateRaw(ids, fromMs, toMs)) {
      lines.push(`${new Date(row.ts).toISOString()},${row.point_id},${row.v ?? ''}`);
    }

    const day = new Date(fromMs).toISOString().slice(0, 10);
    reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="pomiary-${day}.csv"`);
    return lines.join('\n');
  });
}
