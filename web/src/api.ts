/**
 * Warstwa dostepu do danych. Frontend zna wylacznie /api/* — nigdy nie
 * dowiaduje sie, ze Loxone istnieje.
 */

import type {
  AddEventBody,
  ConfigResponse,
  HistoryResponse,
  MaterialsResponse,
  PublicPoint,
  SessionEvent,
  SessionRecord,
  Snapshot,
  StartSessionBody,
} from '@magazyn-pcm/shared';

/** Komunikat o niedostepnym serwerze — po ludzku, z podpowiedzia co zrobic. */
const SERVER_DOWN =
  'Nie mogę połączyć się z serwerem aplikacji. Sprawdź, czy jest uruchomiony (npm run dev).';

async function getJson<T>(path: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, { headers: { Accept: 'application/json' } });
  } catch (error) {
    // Sieciowy blad fetch znaczy w praktyce jedno: serwera nie ma.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error(SERVER_DOWN);
  }

  // 502/503/504 to typowa odpowiedz posrednika, gdy serwer nie odpowiada.
  // Vite w trybie dev zwraca w tej sytuacji 500.
  if (response.status >= 500) {
    throw new Error(SERVER_DOWN);
  }

  if (!response.ok) {
    throw new Error(`Serwer odrzucił zapytanie ${path} (HTTP ${response.status}).`);
  }

  return (await response.json()) as T;
}

export function fetchPoints(): Promise<PublicPoint[]> {
  return getJson<PublicPoint[]>('/api/points');
}

export function fetchSnapshot(): Promise<Snapshot> {
  return getJson<Snapshot>('/api/snapshot');
}

/** Profile materiałów, zakresy skal i objętości zbiorników — konfiguracja. */
export function fetchMaterials(): Promise<MaterialsResponse> {
  return getJson<MaterialsResponse>('/api/materials');
}

export interface HistoryParams {
  ids: string[];
  from: string;
  to: string;
  resolution: string;
}

function historyQuery(params: HistoryParams): string {
  return new URLSearchParams({
    ids: params.ids.join(','),
    from: params.from,
    to: params.to,
    resolution: params.resolution,
  }).toString();
}

/**
 * Historia pomiarow. Gdy serwer zapisuje do pliku tekstowego zamiast bazy,
 * odpowiada `available: false` — ta sciezka jest obslugiwana od pierwszej
 * wersji aplikacji.
 */
export async function fetchHistory(params: HistoryParams): Promise<HistoryResponse> {
  const response = await fetch(`/api/history?${historyQuery(params)}`, {
    headers: { Accept: 'application/json' },
  });

  // 400 niesie czytelny komunikat (np. "za duzo punktow") — pokazujemy go
  // czlowiekowi zamiast ogolnego bledu.
  if (response.status === 400) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? 'Serwer odrzucił zapytanie o historię.');
  }
  if (!response.ok) throw new Error('Nie mogę pobrać historii z serwera.');

  return (await response.json()) as HistoryResponse;
}

/** Adres eksportu CSV — do pobrania przez zwykly link. */
export function historyCsvUrl(params: HistoryParams): string {
  return `/api/history.csv?${historyQuery(params)}`;
}

export function fetchConfig(): Promise<ConfigResponse> {
  return getJson<ConfigResponse>('/api/config');
}

// ---------------------------------------------------------------------------
// Sesje badawcze
// ---------------------------------------------------------------------------

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Serwer odrzucił operację (HTTP ${response.status}).`);
  }
  return payload as T;
}

export function fetchCurrentSession(): Promise<SessionRecord | null> {
  return getJson<SessionRecord | null>('/api/session');
}

export function fetchSessions(): Promise<SessionRecord[]> {
  return getJson<SessionRecord[]>('/api/sessions');
}

export function startSession(body: StartSessionBody): Promise<SessionRecord> {
  return postJson<SessionRecord>('/api/session', body);
}

export function endSession(): Promise<SessionRecord> {
  return postJson<SessionRecord>('/api/session/end', {});
}

export function addSessionEvent(body: AddEventBody): Promise<SessionEvent> {
  return postJson<SessionEvent>('/api/session/events', body);
}
