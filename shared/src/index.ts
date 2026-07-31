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

/**
 * Pozycja sondy w zbiorniku: dwie przekatne x trzy poziomy.
 * Na kazdym poziomie A i B leza na DWOCH ROZNYCH przekatnych zbiornika.
 */
export interface PointGeometry {
  diagonal: 'A' | 'B';
  /** 1 = dol zbiornika, 2 = srodek, 3 = gora. Potwierdzone 2026-07-29. */
  level: 1 | 2 | 3;
}

/**
 * ZESTAW SOND = wymienny zbiornik.
 *
 * Stanowisko ma dwa zbiorniki, kazdy z wlasnymi szescioma sondami, i pracuje
 * z jednym naraz. W Loxone Config przypisanych jest 12 sond; podlaczony
 * zbiornik odpowiada, drugi nie. Zestaw jest tozsamy z parafina, bo kazdy
 * zbiornik jest napelniony innym materialem — dlatego rozpoznanie zestawu
 * jednoczesnie ustawia wlasciwa skale barwna.
 */
export type BankId = PcmMaterial;

/**
 * Definicja punktu pomiarowego — postac serwerowa, z UUID-em Loxone.
 */
export interface PointDef {
  /**
   * Stabilny identyfikator logiczny. NIE zmieniac po starcie zbierania danych.
   * Sonda w tej samej pozycji obu zbiornikow ma TEN SAM identyfikator (A1),
   * bo to ta sama pozycja pomiarowa. Z ktorego zbiornika pochodzi odczyt,
   * mowi pole `bank` w historii — inaczej nie dalo by sie porownac tej samej
   * pozycji miedzy materialami.
   */
  id: string;
  /** UUID z LoxAPP3.json; null = punkt jeszcze niepodlaczony. */
  uuid: string | null;
  /**
   * UUID-y per zestaw — tylko dla sond w wymiennych zbiornikach.
   * Gdy pole jest obecne, `uuid` jest ignorowane.
   */
  uuidByBank?: Partial<Record<BankId, string | null>>;
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

/** Skad wiadomo, ktory zestaw sond jest podlaczony. */
export type BankDetection = 'auto' | 'manual' | 'unknown';

export interface BankState {
  /** Aktywny zestaw albo null, gdy jeszcze nie rozpoznany. */
  active: BankId | null;
  detection: BankDetection;
  /** Ile sond kazdego zestawu odpowiada w tej chwili. */
  alive: Partial<Record<BankId, number>>;
  /** Komunikat dla czlowieka, po polsku. */
  message: string | null;
}

export interface Health {
  source: SourceStatus;
  sourceKind: SourceKind;
  /** Wymienne zbiorniki: ktory zestaw sond jest podlaczony. */
  bank: BankState;
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

/**
 * Znacznik zdarzenia w sesji: "napelniono", "start ladowania",
 * "zauwazono kawerne". Bez adnotacji dane po dwoch tygodniach sa nieczytelne
 * — to jest realna wartosc dla R&D.
 */
export interface SessionEvent {
  ts: string;
  label: string;
}

/** Pelny zapis sesji — to, co przechowuje serwer i pokazuje widok Sesje. */
export interface SessionRecord extends Session {
  id: number;
  endedAt: string | null;
  events: SessionEvent[];
}

/** POST /api/session — rozpoczecie sesji. */
export interface StartSessionBody {
  material: PcmMaterial;
  label: string;
  note?: string | null;
}

/** POST /api/session/events — dodanie znacznika. */
export interface AddEventBody {
  label: string;
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

/**
 * GET /api/config — konfiguracja aplikacji do podgladu w widoku Ustawienia.
 * Tylko do odczytu. NIGDY nie zawiera danych logowania.
 */
export interface PointMapping {
  id: string;
  label: string;
  /** UUID z Loxone Config; null = jeszcze nieprzypisany. */
  uuid: string | null;
  group: PointGroup;
  kind: PointKind;
  unit: string;
  available: boolean;
}

// ---------------------------------------------------------------------------
// Pogoda dla stanowiska
// ---------------------------------------------------------------------------

/**
 * Skad przyszla pogoda.
 *
 * Zrodlo jest czescia ODCZYTU, a nie szczegolem technicznym: na ekranie
 * badawczym trzeba wiedziec, czy liczba pochodzi ze sterownika przy
 * instalacji, czy z prognozy dla okolicy. To dwie rozne rzeczy.
 */
export type WeatherSource = 'loxone' | 'open-meteo';

export interface WeatherReading {
  source: WeatherSource;
  /** Znacznik czasu odczytu w ISO. */
  ts: string;
  /** Opis miejsca, dla ktorego liczona jest pogoda. */
  place: string;
  /** Brak pomiaru to null, nigdy zero. */
  tempC: number | null;
  humidity: number | null;
  windKmh: number | null;
  radiationWm2: number | null;
  cloudCover: number | null;
  /** Slowny opis warunkow, gdy zrodlo go podaje. */
  text: string | null;
}

export interface ConfigResponse {
  sourceKind: SourceKind;
  loxoneHost: string;
  pollIntervalMs: number;
  staleFactor: number;
  staleAfterMs: number;
  historyEnabled: boolean;
  historyBackend: 'sqlite' | 'ndjson';
  historyPath: string;
  /** Liczba rekordow w bazie; null gdy backend nie umie policzyc. */
  historyRecords: number | null;
  historyHeartbeatS: number;
  mappings: PointMapping[];
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
