/**
 * Wspolne typy dla serwera i frontendu.
 *
 * To jest kontrakt miedzy warstwami. Frontend zna WYLACZNIE te typy —
 * nigdy nie widzi UUID-ow Loxone ani niczego, co dotyczy sposobu pobierania
 * danych.
 *
 * Plik zawiera tylko typy i czyste stale (zero logiki, zero zaleznosci),
 * dzieki czemu nie wymaga kroku budowania — serwer i Vite czytaja go
 * bezposrednio jako TypeScript.
 */

// ---------------------------------------------------------------------------
// Punkty pomiarowe
// ---------------------------------------------------------------------------

export type PointKind =
  | 'temperature'
  | 'flow'
  | 'energy'
  | 'power'
  | 'volume'
  | 'delta'
  | 'state';

export type PointGroup =
  | 'pcm'
  | 'buffer'
  | 'heatpump'
  | 'meter'
  | 'ambient'
  | 'actuator';

/** Pozycja sondy w zbiorniku: dwie przekatne x trzy poziomy. */
export interface PointGeometry {
  diagonal: 'A' | 'B';
  /** 1 = dol zbiornika, 3 = gora. Patrz otwarte pytanie nr 1 w specyfikacji. */
  level: 1 | 2 | 3;
}

/**
 * Definicja punktu pomiarowego — postac serwerowa, z UUID-em Loxone.
 */
export interface PointDef {
  /** Stabilny identyfikator logiczny. NIE zmieniac po starcie zbierania danych. */
  id: string;
  /** UUID z LoxAPP3.json; null = punkt jeszcze niepodlaczony. */
  uuid: string | null;
  label: string;
  unit: string;
  kind: PointKind;
  group: PointGroup;
  /** Liczba miejsc po przecinku przy wyswietlaniu. */
  precision: number;
  geometry?: PointGeometry;
  /** false = punkt zadeklarowany, ale jeszcze nie mamy z niego danych. */
  available: boolean;
}

/**
 * Punkt w postaci publicznej — to, co widzi frontend.
 * UUID celowo nie wychodzi poza serwer.
 */
export type PublicPoint = Omit<PointDef, 'uuid'>;

// ---------------------------------------------------------------------------
// Wartosci
// ---------------------------------------------------------------------------

/**
 * Wartosc punktu.
 *
 * `v: null` znaczy BRAK DANYCH. Nigdy nie zastepujemy go zerem —
 * zero na wykresie temperatury to klamstwo.
 *
 * `ts` to czas ostatniego UDANEGO ODCZYTU ze zrodla, a nie czas ostatniej
 * zmiany wartosci. Sondy 1-Wire odswiezaja sie co ~15 s, wiec przy stabilnej
 * temperaturze wartosc sie nie zmienia — a mimo to jest aktualna.
 */
export interface PointValue {
  v: number | null;
  ts: string | null;
  /** true = wartosc starsza niz POLL_INTERVAL_MS * STALE_FACTOR. */
  stale: boolean;
}

export type PointValues = Record<string, PointValue>;

// ---------------------------------------------------------------------------
// Stan zdrowia zrodla
// ---------------------------------------------------------------------------

export type SourceStatus =
  /** Start aplikacji, jeszcze nie bylo pierwszego odczytu. */
  | 'starting'
  /** Wszystko dziala. */
  | 'ok'
  /** Odczyty czesciowo sie nie udaja albo trwaja za dlugo. */
  | 'degraded'
  /** Brak lacznosci z Miniserverem, trwaja ponowne proby z backoffem. */
  | 'offline'
  /** Blad odrzucenia logowania — odpytywanie ZATRZYMANE, zeby nie zablokowac konta. */
  | 'auth_error'
  /** Inny blad trwaly. */
  | 'error';

export type SourceKind = 'http-poll' | 'websocket' | 'mock';

export interface Health {
  source: SourceStatus;
  sourceKind: SourceKind;
  /** Czas odpowiedzi ostatniego cyklu odczytu w ms. */
  latencyMs: number | null;
  lastOkAt: string | null;
  /** Punkty, ktorych wartosc jest przestarzala. */
  staleIds: string[];
  /** Punkty oczekujace na uzupelnienie UUID-a w rejestrze. */
  pendingUuidIds: string[];
  uptimeS: number;
  pollIntervalMs: number;
  staleAfterMs: number;
  /** Komunikat dla czlowieka, po polsku. null = brak nic do powiedzenia. */
  message: string | null;
  /** true = konfiguracja w Loxone Config zmienila sie od startu aplikacji. */
  configChanged: boolean;
}

// ---------------------------------------------------------------------------
// Sesja badawcza
// ---------------------------------------------------------------------------

export type PcmMaterial = 'RT8HC' | 'RT57HC';

/**
 * Profil materialu PCM. Zakresy skali barwnej MUSZA pochodzic z konfiguracji,
 * nie byc zapisane na stale w kodzie widoku — plateau przemiany RT8HC ma
 * szerokosc 2 K i przy skali 0-100 stopni cala przemiana jest jednym kolorem.
 */
export interface MaterialProfile {
  id: PcmMaterial;
  label: string;
  /** Dolna granica skali barwnej. */
  scaleMin: number;
  /** Gorna granica skali barwnej. */
  scaleMax: number;
  /** Pasmo przemiany fazowej — najwazniejsza informacja na ekranie. */
  phaseBandMin: number;
  phaseBandMax: number;
  /** Szczyt topnienia. */
  peak: number;
  /** kJ/kg */
  latentHeat: number;
  /** Maksymalna temperatura pracy materialu. */
  tMax: number;
}

/**
 * Metadane sesji badawczej. Material jest atrybutem SESJI, nigdy nie jest
 * czescia identyfikatora punktu pomiarowego.
 */
export interface Session {
  material: PcmMaterial;
  label: string;
  startedAt: string;
  note: string | null;
}

// ---------------------------------------------------------------------------
// Kontrakt API
// ---------------------------------------------------------------------------

/**
 * GET /api/materials
 *
 * Konfiguracja, bez ktorej nie da sie poprawnie narysowac skali barwnej ani
 * opisac zbiornikow. Zakresy skal i objetosci sa wartosciami konfiguracyjnymi
 * — nigdy nie zapisujemy ich na stale w kodzie widoku.
 */
export interface MaterialsResponse {
  /** Material uzywany, gdy zadna sesja badawcza nie jest uruchomiona. */
  defaultMaterial: PcmMaterial;
  profiles: Record<PcmMaterial, MaterialProfile>;
  /** Objetosci zbiornikow w litrach. */
  volumesL: {
    buffer: number;
    storage: number;
  };
  /** Przeplyw, przy ktorym animacja przeplywu osiaga pelna predkosc (m3/h). */
  flowFullSpeed: number;
}

/** GET /api/snapshot */
export interface Snapshot {
  ts: string;
  /** null = zadna sesja badawcza nie jest uruchomiona (realny stan przed testem). */
  session: Session | null;
  values: PointValues;
  health: Health;
}

/** Zdarzenie SSE `values` (krok 3). */
export interface ValuesEvent {
  ts: string;
  values: PointValues;
}

/** GET /api/history — odpowiedz, gdy odczyt historii jeszcze nie jest gotowy. */
export interface HistoryUnavailable {
  available: false;
  reason: 'not_implemented';
  message: string;
}

export interface HistorySeries {
  id: string;
  points: Array<{ ts: string; v: number | null }>;
}

/** GET /api/history — docelowa odpowiedz. */
export interface HistoryAvailable {
  available: true;
  from: string;
  to: string;
  resolution: string;
  series: HistorySeries[];
}

export type HistoryResponse = HistoryAvailable | HistoryUnavailable;

// ---------------------------------------------------------------------------
// Pomocnicze
// ---------------------------------------------------------------------------

/** Wartosc pusta — jedyny poprawny sposob wyrazenia braku danych. */
export const EMPTY_VALUE: PointValue = { v: null, ts: null, stale: true };

/** Kolejnosc poziomow do rysowania od gory zbiornika w dol. */
export const LEVELS_TOP_DOWN: Array<1 | 2 | 3> = [3, 2, 1];

export const LEVEL_LABELS: Record<1 | 2 | 3, string> = {
  3: 'górny',
  2: 'środek',
  1: 'dolny',
};
