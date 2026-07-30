/**
 * Formatowanie liczb i czasu.
 *
 * Zasady z wymagan interfejsu:
 *   - temperatura ma jedno miejsce po przecinku, przeplyw trzy,
 *   - liczba ZAWSZE z jednostka,
 *   - brak danych to kreska, nigdy zero,
 *   - stala liczba miejsc po przecinku, zeby wartosci nie drgaly przy
 *     odswiezeniu (razem z `font-variant-numeric: tabular-nums` w CSS).
 */

import type {
  MaterialsResponse,
  PcmMaterial,
  PointValue,
  PublicPoint,
  SourceStatus,
} from '@magazyn-pcm/shared';

export const NO_DATA = '—';

/** Wartosc bez jednostki, ze stala liczba miejsc po przecinku. */
export function formatNumber(value: PointValue, point: PublicPoint): string {
  if (value.v === null) return NO_DATA;
  return value.v.toFixed(point.precision);
}

/** Wartosc z jednostka. Stany binarne pokazujemy slownie. */
export function formatValue(value: PointValue, point: PublicPoint): string {
  if (value.v === null) return NO_DATA;

  if (point.kind === 'state') {
    return value.v === 0 ? 'wyłączony' : 'włączony';
  }

  const number = value.v.toFixed(point.precision);
  return point.unit ? `${number} ${point.unit}` : number;
}

/** Wiek wartosci w sekundach albo null, gdy nie bylo odczytu. */
export function ageSeconds(value: PointValue, now: number = Date.now()): number | null {
  if (!value.ts) return null;
  return Math.max(0, Math.round((now - new Date(value.ts).getTime()) / 1000));
}

export function formatAge(value: PointValue, now: number = Date.now()): string {
  const seconds = ageSeconds(value, now);
  if (seconds === null) return NO_DATA;
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} h`;
}

export function formatClock(iso: string | null): string {
  if (!iso) return NO_DATA;
  return new Date(iso).toLocaleTimeString('pl-PL', { hour12: false });
}

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

/** Zapasowy prog przestarzalosci, gdy nie znamy jeszcze konfiguracji serwera. */
export const FALLBACK_STALE_AFTER_MS = 15_000;

/**
 * Czy wartosc jest przestarzala — liczone PO STRONIE PRZEGLADARKI.
 *
 * Dlaczego nie wystarczy pole `stale` z serwera: to pole jest prawdziwe
 * wylacznie w chwili wyslania. Gdy padnie serwer albo lacze, ostatnie
 * otrzymane zdarzenie zostaje na ekranie z `stale: false` i wartosc sprzed
 * godziny wyglada jak aktualna. Przy tygodniowym tescie to najgrozniejszy
 * mozliwy blad tego interfejsu — dlatego wiek liczymy zawsze sami, ze
 * znacznika czasu odczytu.
 */
export function isStale(
  value: PointValue,
  staleAfterMs: number,
  now: number = Date.now(),
  /**
   * Czy kanal do serwera zyje.
   *
   * DLACZEGO TO ZMIENIA WYNIK: przez SSE ida tylko ZMIENIONE wartosci. Gdy
   * temperatura stoi (a w magazynie PCM stoi godzinami — na tym polega
   * plateau), przegladarka nie dostaje odswiezonego znacznika czasu, choc
   * serwer odczytuje sonde co 5 s i wie, ze wartosc jest swieza.
   *
   * Dopoki kanal zyje, o przestarzalosci decyduje wiec SERWER: sam zglasza
   * punkty, ktore zamilkly. Wlasny licznik wieku wlaczamy tylko wtedy, gdy
   * stracilismy lacznosc — bo wtedy nikt nas juz nie ostrzeze.
   */
  channelAlive = false,
): boolean {
  if (!value.ts) return true;
  if (value.stale) return true;
  if (channelAlive) return false;
  return now - new Date(value.ts).getTime() > staleAfterMs;
}

/**
 * Stan pojedynczego punktu — cztery rozne sytuacje, ktore NIE MOGA wygladac
 * tak samo. Zero dla brakujacej wartosci byloby klamstwem.
 */
export type PointState = 'ok' | 'stale' | 'no-data' | 'not-connected';

export function pointState(
  // `undefined` jest tu dopuszczalne swiadomie: wywolania biora punkt
  // z mapy rejestru, a schemat SVG moze odwolywac sie do identyfikatora,
  // ktorego w rejestrze nie ma (choćby przez literowke po przerysowaniu
  // rysunku). Brak definicji ma dac "niepodlaczony", nie wyjatek gaszacy
  // caly widok.
  point: PublicPoint | undefined,
  value: PointValue | undefined,
  staleAfterMs: number = FALLBACK_STALE_AFTER_MS,
  now: number = Date.now(),
  /** Czy kanal do serwera zyje — patrz isStale(). */
  channelAlive = false,
): PointState {
  if (!point || !point.available) return 'not-connected';
  if (!value || value.v === null) return 'no-data';
  return isStale(value, staleAfterMs, now, channelAlive) ? 'stale' : 'ok';
}

export const POINT_STATE_LABEL: Record<PointState, string> = {
  ok: 'aktualne',
  stale: 'przestarzałe',
  'no-data': 'brak danych',
  'not-connected': 'niepodłączony',
};

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  starting: 'uruchamianie',
  ok: 'w porządku',
  degraded: 'częściowo',
  offline: 'brak łączności',
  auth_error: 'logowanie odrzucone',
  error: 'błąd',
};

/**
 * Nazwa materialu dla czlowieka.
 *
 * Identyfikator w danych to RT8HC / RT57HC (klucz w zapisanych sesjach,
 * nie zmieniamy go), ale na ekranie NIGDY nie pokazujemy nazwy producenta —
 * wylacznie oznaczenie parafiny: "8HC", "57HC". Ta funkcja jest jedynym
 * miejscem, w ktorym to tlumaczenie zachodzi.
 */
export function materialLabel(
  material: PcmMaterial | null | undefined,
  materials: MaterialsResponse | null,
): string {
  if (!material) return NO_DATA;
  const fromConfig = materials?.profiles[material]?.label;
  if (fromConfig) return fromConfig;
  // Awaryjnie, gdy konfiguracja jeszcze nie doszla: odetnij prefiks producenta.
  return material.replace(/^RT/i, '');
}

/** Grupy punktow po polsku — do naglowkow w tabeli. */
export const GROUP_LABEL: Record<string, string> = {
  pcm: 'Magazyn PCM',
  buffer: 'Bufor',
  heatpump: 'Pompa ciepła',
  meter: 'Ciepłomierz',
  ambient: 'Otoczenie',
  actuator: 'Elementy wykonawcze',
};
