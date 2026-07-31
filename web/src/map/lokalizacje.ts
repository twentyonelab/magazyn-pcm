/**
 * Punkty na mapie Śląska.
 *
 * JEDEN JEST PRAWDZIWY. Stanowisko badawcze w Gliwicach, na Wydziale
 * Inżynierii Środowiska i Energetyki Politechniki Śląskiej — to z niego
 * płyną dane, które pokazuje cała reszta aplikacji.
 *
 * DWADZIEŚCIA POZOSTAŁYCH JEST WYMYŚLONYCH i muszą tak wyglądać. Służą
 * pokazaniu, jak sieć takich magazynów mogłaby się rozłożyć w regionie —
 * nie stoją za nimi żadne instalacje ani pomiary. Dlatego mają osobny stan
 * `demo`, są wyszarzone, nie dają się kliknąć i mówią o sobie wprost
 * w podpisie. Punkt na mapie, który wygląda jak działający czujnik, a nim
 * nie jest, to najgorszy rodzaj kłamstwa w takim narzędziu.
 *
 * Współrzędne miast są PRAWDZIWE (geokodowane przez Mapbox 2026-07-31),
 * żeby kadr i rozłożenie punktów odpowiadały rzeczywistej geografii.
 */

import type { Kierunek } from '../soc.js';

export interface Lokalizacja {
  id: string;
  /** Nazwa miasta — podpis na mapie. */
  miasto: string;
  /** Pełny opis w karcie po najechaniu. */
  opis: string;
  lon: number;
  lat: number;
  /** `live` = prawdziwe stanowisko z czujnikami. `demo` = punkt pokazowy. */
  stan: 'live' | 'demo';
  /** Magazyn ciepła czy chłodu — decyduje o kolorze pinezki i podpisu. */
  typ: Kierunek;
  /**
   * Poziom naładowania punktu POKAZOWEGO, 0–1.
   *
   * Wartości są WYMYŚLONE i celowo zapisane na stałe, nie losowane: losowanie
   * przy każdym otwarciu mapy udawałoby żywe dane. Stanowisko badawcze tego
   * pola nie ma — jego naładowanie liczy się z prawdziwych sond.
   */
  demoNaladowanie?: number;
}

/** Stanowisko badawcze — jedyny punkt z prawdziwymi danymi. */
export const STANOWISKO: Lokalizacja = {
  id: 'gliwice-kaszubska',
  miasto: 'Gliwice',
  opis: 'Wydział Inżynierii Środowiska i Energetyki, Politechnika Śląska · ul. Kaszubska 26',
  lon: 18.6804,
  lat: 50.2897,
  stan: 'live',
  // Zbiornik z parafiną 57HC to magazyn ciepła. Gdy w stanowisku pojawi się
  // zbiornik 8HC, typ trzeba tu przestawić na 'chlod'.
  typ: 'cieplo',
};

/**
 * Punkty pokazowe: miasto, rodzaj magazynu i poziom naładowania.
 * Trzynaście magazynów ciepła i siedem chłodu — proporcja pokazowa, dobrana
 * tak, żeby oba rodzaje były na mapie widoczne, a ciepło pozostało wiodące.
 */
const DEMO: ReadonlyArray<{
  miasto: string;
  lon: number;
  lat: number;
  typ: Kierunek;
  poziom: number;
}> = [
  { miasto: 'Katowice', lon: 19.0232, lat: 50.2585, typ: 'cieplo', poziom: 0.82 },
  { miasto: 'Zabrze', lon: 18.7854, lat: 50.3084, typ: 'cieplo', poziom: 0.34 },
  { miasto: 'Bytom', lon: 18.922, lat: 50.3469, typ: 'chlod', poziom: 0.71 },
  { miasto: 'Sosnowiec', lon: 19.1302, lat: 50.2761, typ: 'cieplo', poziom: 0.58 },
  { miasto: 'Rybnik', lon: 18.5424, lat: 50.0959, typ: 'chlod', poziom: 0.19 },
  { miasto: 'Tychy', lon: 18.9865, lat: 50.1131, typ: 'cieplo', poziom: 0.95 },
  { miasto: 'Chorzów', lon: 18.9536, lat: 50.2974, typ: 'cieplo', poziom: 0.12 },
  { miasto: 'Dąbrowa Górnicza', lon: 19.2081, lat: 50.3309, typ: 'chlod', poziom: 0.88 },
  { miasto: 'Jastrzębie-Zdrój', lon: 18.5971, lat: 49.9502, typ: 'cieplo', poziom: 0.47 },
  { miasto: 'Ruda Śląska', lon: 18.8745, lat: 50.2859, typ: 'cieplo', poziom: 0.66 },
  { miasto: 'Częstochowa', lon: 19.1182, lat: 50.8119, typ: 'chlod', poziom: 0.41 },
  { miasto: 'Bielsko-Biała', lon: 19.0468, lat: 49.8232, typ: 'cieplo', poziom: 0.73 },
  { miasto: 'Tarnowskie Góry', lon: 18.8548, lat: 50.4444, typ: 'cieplo', poziom: 0.26 },
  { miasto: 'Racibórz', lon: 18.2182, lat: 50.0917, typ: 'chlod', poziom: 0.55 },
  { miasto: 'Cieszyn', lon: 18.6337, lat: 49.7486, typ: 'cieplo', poziom: 0.9 },
  { miasto: 'Żywiec', lon: 19.2012, lat: 49.6886, typ: 'chlod', poziom: 0.63 },
  { miasto: 'Mysłowice', lon: 19.1386, lat: 50.2423, typ: 'cieplo', poziom: 0.38 },
  { miasto: 'Siemianowice Śląskie', lon: 19.032, lat: 50.3024, typ: 'cieplo', poziom: 0.51 },
  { miasto: 'Piekary Śląskie', lon: 18.9449, lat: 50.3844, typ: 'chlod', poziom: 0.29 },
  { miasto: 'Wodzisław Śląski', lon: 18.4658, lat: 50.0026, typ: 'cieplo', poziom: 0.77 },
];

export const LOKALIZACJE: ReadonlyArray<Lokalizacja> = [
  STANOWISKO,
  ...DEMO.map((d) => ({
    id: `demo-${d.miasto.toLowerCase().replace(/[^a-z]+/g, '-')}`,
    miasto: d.miasto,
    opis:
      d.typ === 'chlod'
        ? 'Punkt demonstracyjny · magazyn chłodu — bez instalacji i bez pomiarów'
        : 'Punkt demonstracyjny · magazyn ciepła — bez instalacji i bez pomiarów',
    lon: d.lon,
    lat: d.lat,
    stan: 'demo' as const,
    typ: d.typ,
    demoNaladowanie: d.poziom,
  })),
];

/**
 * Kadr na Śląsk.
 *
 * Wyliczony z rozrzutu punktów (18,22–19,21 długości i 49,69–50,81 szerokości)
 * z zapasem na oddech. `MAX_GRANICE` są szersze — mapa daje się przesunąć,
 * ale nie wyjechać w Bałtyk. Bez tego pierwsze pociągnięcie myszką gubi region.
 */
export const KADR: [[number, number], [number, number]] = [
  [17.95, 49.55],
  [19.5, 50.95],
];

export const MAX_GRANICE: [[number, number], [number, number]] = [
  [16.9, 48.9],
  [20.6, 51.6],
];
