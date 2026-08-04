/**
 * Pogoda dla stanowiska badawczego (Gliwice, ul. Kaszubska 26).
 *
 * STAN NA 2026-08-04 — pogoda ze sterownika jest WPIETA, ale jeszcze pusta.
 * W projekcie pojawil sie pokoj „Otoczenie" z czterema kontrolkami uslugi
 * pogodowej Loxone (temperatura, wilgotnosc, cisnienie, pyl) i ich UUID-y
 * siedza w `points.config.ts`. Wszystkie odpowiadaja HTTP 200 i wartoscia
 * ZERO, bo `msInfo.latitude` i `msInfo.longitude` w zapisanym projekcie nadal
 * wynosza 0 — usluga pogodowa nie ma dla czego liczyc pogody.
 *
 * DLATEGO ZERA SA TU ODRZUCANE JAWNIE (patrz `wygladaNaBrakLokalizacji`).
 * Sam fakt, ze punkt odpowiada, nie znaczy, ze mierzy: „0 °C na zewnatrz
 * w sierpniu" to zla dana udajaca dobra, czyli dokladnie ten rodzaj bledu,
 * ktorego na ekranie badawczym nie wolno przepuscic. Surowe zera widac
 * natomiast w Diagnostyce, w grupie Otoczenie — tam maja byc widoczne,
 * bo one wlasnie mowia, czego brakuje w sterowniku.
 *
 * ZEBY POGODA ZACZELA IsC Z LOXONE, po stronie sterownika zostaje jedno:
 * ustawic lokalizacje projektu (Gliwice, ul. Kaszubska 26) i zapisac
 * konfiguracje. Zrodlo przelaczy sie samo, bez zmiany w kodzie.
 *
 * Dlatego modul ma DWA ZRODLA i zawsze mowi, z ktorego korzysta:
 *   1. `loxone`     — punkty POGODA_* z rejestru, gdy maja UUID-y i dane.
 *                     Doklandnie ten sam mechanizm, ktory dziala dla cieplomierza.
 *   2. `open-meteo` — darmowa sluzba pogodowa, bez klucza i rejestracji.
 *                     Dziala od zaraz i nie wymaga niczego w Loxone.
 *
 * Loxone ma pierwszenstwo. Gdy pojawia sie tam dane, zrodlo przelacza sie samo
 * i widac to w interfejsie — nikt nie musi nic przestawiac w kodzie.
 */

import type { WeatherReading, WeatherSource } from '@magazyn-pcm/shared';
import type { ValueCache } from './cache.js';
import type { PointRegistry } from './registry.js';

/** Stanowisko badawcze — wspolrzedne z geokodowania adresu (Mapbox). */
export const STANOWISKO = {
  lat: 50.2897,
  lon: 18.6804,
  opis: 'Gliwice, ul. Kaszubska 26',
} as const;

/**
 * Pogoda zmienia sie w minutach, nie w sekundach.
 *
 * Dziesiec minut to kompromis: ekran jest wystarczajaco aktualny, a nie dobijamy
 * sie do cudzej darmowej sluzby przy kazdym odswiezeniu strony.
 */
const CACHE_MS = 10 * 60 * 1000;

/** Po bledzie nie ponawiamy od razu — inaczej awaria sieci robi z nas floodera. */
const RETRY_AFTER_ERROR_MS = 60 * 1000;

/**
 * Kody pogody WMO uzywane przez Open-Meteo, po polsku.
 * Wypisane sa te, ktore realnie wystepuja w Polsce.
 */
const KODY_WMO: Record<number, string> = {
  0: 'bezchmurnie',
  1: 'przejaśnienia',
  2: 'częściowe zachmurzenie',
  3: 'zachmurzenie',
  45: 'mgła',
  48: 'mgła osadzająca szron',
  51: 'mżawka',
  53: 'mżawka',
  55: 'silna mżawka',
  56: 'mżawka marznąca',
  57: 'silna mżawka marznąca',
  61: 'słaby deszcz',
  63: 'deszcz',
  65: 'silny deszcz',
  66: 'deszcz marznący',
  67: 'silny deszcz marznący',
  71: 'słaby śnieg',
  73: 'śnieg',
  75: 'silny śnieg',
  77: 'śnieg ziarnisty',
  80: 'przelotny deszcz',
  81: 'przelotny deszcz',
  82: 'ulewa',
  85: 'przelotny śnieg',
  86: 'silny przelotny śnieg',
  95: 'burza',
  96: 'burza z gradem',
  99: 'burza z gradem',
};

function opisKodu(kod: number | null): string | null {
  if (kod === null) return null;
  return KODY_WMO[kod] ?? 'warunki nietypowe';
}

/** Identyfikatory punktow pogodowych w rejestrze — patrz points.config.ts. */
const PUNKTY = {
  temp: 'WEATHER_TEMP',
  humidity: 'WEATHER_HUMIDITY',
  wind: 'WEATHER_WIND',
  radiation: 'WEATHER_RADIATION',
  pressure: 'WEATHER_PRESSURE',
} as const;

/**
 * Czy odczyt z Loxone to podpis „usluga pogodowa nic nie liczy".
 *
 * Sterownik bez ustawionej lokalizacji oddaje na WSZYSTKICH polach dokladnie
 * zero — nie null, nie blad, tylko zero. Zadne z tych zer nie jest fizycznie
 * mozliwe razem z pozostalymi: cisnienie 0 hPa to proznia, a wilgotnosc 0 %
 * przy 0 °C to powietrze idealnie suche. Wystapienie tego zestawu naraz
 * rozstrzyga wiec sprawe bez zgadywania.
 *
 * Uwaga na przyszlosc: sprawdzamy KOMBINACJE, nie samo `tempC === 0`. Zero
 * stopni na zewnatrz jest w Gliwicach zima zupelnie normalne i pojedynczy
 * warunek wyrzucalby wtedy poprawny odczyt.
 */
function wygladaNaBrakLokalizacji(
  tempC: number,
  humidity: number | null,
  pressure: number | null,
): boolean {
  if (tempC !== 0) return false;
  if (pressure !== null && pressure === 0) return true;
  return humidity === 0;
}

export interface WeatherDeps {
  registry: PointRegistry;
  cache: ValueCache;
  /** Wylaczenie odpytywania sluzby zewnetrznej (praca bez internetu). */
  allowExternal: boolean;
  timeoutMs: number;
  log: { warn: (obj: unknown, msg: string) => void };
}

export class WeatherService {
  private ostatni: WeatherReading | null = null;
  private ostatniAtMs = 0;
  private ostatniBladAtMs = 0;
  /** Jedno wspolne zapytanie dla wszystkich rownoczesnych odczytow. */
  private wLocie: Promise<WeatherReading | null> | null = null;

  constructor(private readonly deps: WeatherDeps) {}

  /**
   * Biezaca pogoda albo null, gdy nie ma jej z zadnego zrodla.
   *
   * Null jest pelnoprawna odpowiedzia — interfejs pokazuje wtedy, ze pogody
   * nie ma, zamiast rysowac zera.
   */
  async current(): Promise<WeatherReading | null> {
    const zLoxone = this.zLoxone();
    if (zLoxone) return zLoxone;

    if (!this.deps.allowExternal) return null;

    const teraz = Date.now();
    if (this.ostatni && teraz - this.ostatniAtMs < CACHE_MS) return this.ostatni;
    if (teraz - this.ostatniBladAtMs < RETRY_AFTER_ERROR_MS) return this.ostatni;

    // Kilka rownoczesnych zapytan z przegladarek nie mnozy zapytan na zewnatrz.
    this.wLocie ??= this.zOpenMeteo().finally(() => {
      this.wLocie = null;
    });

    return this.wLocie;
  }

  /**
   * Pogoda z punktow POGODA_* w Loxone.
   *
   * Wystarcza sama temperatura — pozostale pola sa opcjonalne, bo nie kazdy
   * projekt w Loxone Config wystawi je wszystkie.
   */
  private zLoxone(): WeatherReading | null {
    const { registry, cache } = this.deps;

    const odczyt = (id: string): number | null => {
      const point = registry.get(id);
      if (!point || !point.available) return null;
      const value = cache.get(id);
      return typeof value.v === 'number' ? value.v : null;
    };

    const tempC = odczyt(PUNKTY.temp);
    if (tempC === null) return null;

    const humidity = odczyt(PUNKTY.humidity);
    const pressure = odczyt(PUNKTY.pressure);

    // Usluga pogodowa bez lokalizacji oddaje zera na wszystkich polach.
    // Odrzucamy je tutaj, a nie na ekranie, zeby zadna warstwa wyzej nie
    // musiala wiedziec, ze taki stan istnieje.
    if (wygladaNaBrakLokalizacji(tempC, humidity, pressure)) return null;

    return {
      source: 'loxone',
      ts: cache.get(PUNKTY.temp).ts ?? new Date().toISOString(),
      place: STANOWISKO.opis,
      tempC,
      humidity,
      windKmh: odczyt(PUNKTY.wind),
      radiationWm2: odczyt(PUNKTY.radiation),
      cloudCover: null,
      text: null,
    };
  }

  private async zOpenMeteo(): Promise<WeatherReading | null> {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${STANOWISKO.lat}&longitude=${STANOWISKO.lon}` +
      '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,weather_code' +
      ',shortwave_radiation' +
      '&timezone=Europe%2FWarsaw';

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(this.deps.timeoutMs) });
      if (!res.ok) throw new Error(`odpowiedz ${res.status}`);

      const dto = (await res.json()) as { current?: Record<string, number | string | null> };
      const c = dto.current;
      if (!c) throw new Error('brak sekcji "current"');

      const liczba = (klucz: string): number | null => {
        const v = c[klucz];
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      };

      const czytanie: WeatherReading = {
        source: 'open-meteo',
        ts: typeof c.time === 'string' ? new Date(c.time).toISOString() : new Date().toISOString(),
        place: STANOWISKO.opis,
        tempC: liczba('temperature_2m'),
        humidity: liczba('relative_humidity_2m'),
        windKmh: liczba('wind_speed_10m'),
        radiationWm2: liczba('shortwave_radiation'),
        cloudCover: liczba('cloud_cover'),
        text: opisKodu(liczba('weather_code')),
      };

      this.ostatni = czytanie;
      this.ostatniAtMs = Date.now();
      this.ostatniBladAtMs = 0;
      return czytanie;
    } catch (error) {
      this.ostatniBladAtMs = Date.now();
      this.deps.log.warn(
        { err: (error as Error).message },
        'Nie udalo sie pobrac pogody (Open-Meteo)',
      );
      // Ostatnia znana pogoda ma swoj wlasny znacznik czasu, wiec interfejs
      // pokaze, ze jest stara. To lepsze niz puste pole.
      return this.ostatni;
    }
  }

  /** Zrodlo ostatniej odpowiedzi — do diagnostyki. */
  lastSource(): WeatherSource | null {
    return this.zLoxone()?.source ?? this.ostatni?.source ?? null;
  }
}
