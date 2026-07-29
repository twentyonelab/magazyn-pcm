/**
 * Kontrakt API. Frontend zna wylacznie te sciezki — nigdy nie dowiaduje sie,
 * ze Loxone istnieje.
 *
 * Krok 1 udostepnia trzy endpointy z listy zadan:
 *   GET /api/points    — rejestr punktow (bez UUID-ow)
 *   GET /api/snapshot  — biezacy stan wszystkich wartosci
 *   GET /api/health    — stan lacznosci ze zrodlem
 *
 * /api/stream (SSE), /api/history i /api/session dochodza w kolejnych krokach.
 * Kształt odpowiedzi /api/snapshot jest jednak juz teraz zgodny z docelowym
 * kontraktem (z polem `session`), zeby ich wlaczenie niczego nie zmienialo
 * po stronie frontendu.
 */

import type { FastifyInstance } from 'fastify';
import type { Session, Snapshot } from '@magazyn-pcm/shared';
import type { ValueCache } from '../cache.js';
import type { HealthTracker } from '../health.js';
import type { PointRegistry } from '../registry.js';

export interface ApiDeps {
  registry: PointRegistry;
  cache: ValueCache;
  health: HealthTracker;
  /**
   * Biezaca sesja badawcza. W kroku 1 zawsze null — zadna sesja nie jest
   * uruchomiona, co jest realnym stanem przed startem testu. Frontend musi
   * ten stan obslugiwac od poczatku.
   */
  getSession: () => Session | null;
}

export async function registerApi(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const { registry, cache, health, getSession } = deps;

  // Krótka lista endpointow — dla czlowieka, ktory wpisze adres w przegladarce.
  app.get('/', async () => ({
    app: 'magazyn-pcm',
    endpoints: ['/api/points', '/api/snapshot', '/api/health'],
  }));

  app.get('/api/points', async () => registry.publicPoints());

  app.get('/api/snapshot', async (): Promise<Snapshot> => {
    const ids = registry.all().map((p) => p.id);
    return {
      ts: new Date().toISOString(),
      session: getSession(),
      values: cache.snapshot(ids),
      health: health.snapshot(),
    };
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
}
