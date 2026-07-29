/**
 * Warstwa dostepu do danych. Frontend zna wylacznie /api/* — nigdy nie
 * dowiaduje sie, ze Loxone istnieje.
 */

import type {
  HistoryResponse,
  PublicPoint,
  Snapshot,
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

/**
 * Historia pomiarow. W tej wersji serwer odpowiada `available: false` —
 * cala sciezka po stronie frontendu jest jednak gotowa, wiec wlaczenie
 * historii bedzie zmiana wylacznie po stronie serwera.
 */
export function fetchHistory(params: {
  ids: string[];
  from: string;
  to: string;
  resolution: string;
}): Promise<HistoryResponse> {
  const query = new URLSearchParams({
    ids: params.ids.join(','),
    from: params.from,
    to: params.to,
    resolution: params.resolution,
  });
  return getJson<HistoryResponse>(`/api/history?${query.toString()}`);
}
