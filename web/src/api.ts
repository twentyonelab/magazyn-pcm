/**
 * Warstwa dostepu do danych. Frontend zna wylacznie /api/* — nigdy nie
 * dowiaduje sie, ze Loxone istnieje.
 *
 * Sciezki sa wzgledne i takie zostaja w calym pliku; jedynie tuz przed
 * wywolaniem `fetch` przechodza przez `adresApi`, ktory dokleja adres
 * serwera, gdy strona stoi gdzie indziej niz on (patrz adres-api.ts).
 */

import { OPCJE_API, adresApi } from './adres-api.js';
import { aktywnyPunkt } from './demo/aktywnyPunkt.js';
import { historiaPunktu } from './demo/punkt.js';
import { TRYB_POKAZOWY } from './demo/stale.js';
import {
  MATERIALY_POKAZOWE,
  PUNKTY_POKAZOWE,
  historiaPokazowa,
  migawkaPokazowa,
} from './demo/zrodlo.js';
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

/**
 * Rzucane, gdy serwer odpowiada 401. Osobny typ, zeby warstwa danych mogla
 * pokazac ekran logowania, a nie komunikat o awarii — brak sesji to nie blad.
 */
export class WymaganeLogowanie extends Error {
  constructor() {
    super('Wymagane logowanie.');
    this.name = 'WymaganeLogowanie';
  }
}

export interface AuthState {
  required: boolean;
  loggedIn: boolean;
}

export function fetchAuthState(): Promise<AuthState> {
  // Pokaz nie ma czego chronic — brama logowania w ogole sie nie pojawia.
  if (TRYB_POKAZOWY) return Promise.resolve({ required: false, loggedIn: true });
  return getJson<AuthState>('/api/auth');
}

export async function login(password: string): Promise<void> {
  const response = await fetch(adresApi('/api/login'), {
    ...OPCJE_API,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (response.ok) return;

  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? 'Nie udało się zalogować.');
}

export async function logout(): Promise<void> {
  await fetch(adresApi('/api/logout'), { ...OPCJE_API, method: 'POST' });
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(adresApi(path), { ...OPCJE_API, headers: { Accept: 'application/json' } });
  } catch (error) {
    // Sieciowy blad fetch znaczy w praktyce jedno: serwera nie ma.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error(SERVER_DOWN);
  }

  // Brak sesji to nie awaria — osobny typ bledu prowadzi do ekranu logowania.
  if (response.status === 401) {
    throw new WymaganeLogowanie();
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
  if (TRYB_POKAZOWY) return Promise.resolve(PUNKTY_POKAZOWE);
  return getJson<PublicPoint[]>('/api/points');
}

export function fetchSnapshot(): Promise<Snapshot> {
  if (TRYB_POKAZOWY) return Promise.resolve(migawkaPokazowa(Date.now()));
  return getJson<Snapshot>('/api/snapshot');
}

/** Profile materiałów, zakresy skal i objętości zbiorników — konfiguracja. */
export function fetchMaterials(): Promise<MaterialsResponse> {
  if (TRYB_POKAZOWY) return Promise.resolve(MATERIALY_POKAZOWE);
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
  // Punkt pokazowy z mapy MA PIERWSZEŃSTWO: gdyby zapytanie poszło do serwera,
  // pod jego nazwą narysowałby się przebieg stanowiska badawczego.
  const punkt = aktywnyPunkt();
  if (punkt) return historiaPunktu(punkt, params);
  if (TRYB_POKAZOWY) return historiaPokazowa(params);
  const response = await fetch(adresApi(`/api/history?${historyQuery(params)}`), {
    ...OPCJE_API,
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
  return adresApi(`/api/history.csv?${historyQuery(params)}`);
}

export function fetchConfig(): Promise<ConfigResponse> {
  return getJson<ConfigResponse>('/api/config');
}

// ---------------------------------------------------------------------------
// Sesje badawcze
// ---------------------------------------------------------------------------

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(adresApi(path), {
    ...OPCJE_API,
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
  if (TRYB_POKAZOWY) return Promise.resolve(null);
  return getJson<SessionRecord | null>('/api/session');
}

export function fetchSessions(): Promise<SessionRecord[]> {
  if (TRYB_POKAZOWY) return Promise.resolve([]);
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
