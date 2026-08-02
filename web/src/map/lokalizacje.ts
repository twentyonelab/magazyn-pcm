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
  /**
   * Nazwa INSTALACJI — to ona jest podpisem przy znaczniku.
   *
   * Osobne pole od miasta, bo podpis „Katowice" przy znaczniku czytał się
   * jak etykieta miasta postawiona przez Mapboxa, a nie jak nazwa obiektu.
   * Miasto zostaje w `miasto` i pokazuje się w karcie po najechaniu, gdzie
   * mówi o położeniu, zamiast udawać nazwę magazynu.
   */
  nazwa: string;
  /** Miasto — informacja o położeniu, pokazywana w karcie. */
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
  nazwa: 'Magazyn Politechnika',
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
 * Punkty pokazowe: nazwa instalacji, miasto, rodzaj magazynu i poziom
 * naładowania.
 *
 * Trzynaście magazynów CIEPŁA i siedem CHŁODU. Każdy rodzaj ma własną barwę
 * znacznika — pomarańcz i lodowy błękit — a po wejściu w punkt cały interfejs
 * przechodzi na barwę jego nośnika. Dzięki temu widać na mapie, z czym się ma
 * do czynienia, jeszcze przed kliknięciem.
 */
const DEMO: ReadonlyArray<{
  nazwa: string;
  miasto: string;
  lon: number;
  lat: number;
  typ: Kierunek;
  poziom: number;
}> = [
  { nazwa: 'Magazyn Koszutka', miasto: 'Katowice', lon: 19.0232, lat: 50.2585, typ: 'cieplo', poziom: 0.82 },
  { nazwa: 'Magazyn Zaborze', miasto: 'Zabrze', lon: 18.7854, lat: 50.3084, typ: 'cieplo', poziom: 0.34 },
  { nazwa: 'Magazyn Miechowice', miasto: 'Bytom', lon: 18.922, lat: 50.3469, typ: 'chlod', poziom: 0.71 },
  { nazwa: 'Magazyn Zagórze', miasto: 'Sosnowiec', lon: 19.1302, lat: 50.2761, typ: 'cieplo', poziom: 0.58 },
  { nazwa: 'Magazyn Boguszowice', miasto: 'Rybnik', lon: 18.5424, lat: 50.0959, typ: 'chlod', poziom: 0.19 },
  { nazwa: 'Magazyn Paprocany', miasto: 'Tychy', lon: 18.9865, lat: 50.1131, typ: 'cieplo', poziom: 0.95 },
  { nazwa: 'Magazyn Batory', miasto: 'Chorzów', lon: 18.9536, lat: 50.2974, typ: 'cieplo', poziom: 0.12 },
  { nazwa: 'Magazyn Gołonóg', miasto: 'Dąbrowa Górnicza', lon: 19.2081, lat: 50.3309, typ: 'chlod', poziom: 0.88 },
  { nazwa: 'Magazyn Zdrój', miasto: 'Jastrzębie-Zdrój', lon: 18.5971, lat: 49.9502, typ: 'cieplo', poziom: 0.47 },
  { nazwa: 'Magazyn Halemba', miasto: 'Ruda Śląska', lon: 18.8745, lat: 50.2859, typ: 'cieplo', poziom: 0.66 },
  { nazwa: 'Magazyn Raków', miasto: 'Częstochowa', lon: 19.1182, lat: 50.8119, typ: 'chlod', poziom: 0.41 },
  { nazwa: 'Magazyn Wapienica', miasto: 'Bielsko-Biała', lon: 19.0468, lat: 49.8232, typ: 'cieplo', poziom: 0.73 },
  { nazwa: 'Magazyn Repty', miasto: 'Tarnowskie Góry', lon: 18.8548, lat: 50.4444, typ: 'cieplo', poziom: 0.26 },
  { nazwa: 'Magazyn Ostróg', miasto: 'Racibórz', lon: 18.2182, lat: 50.0917, typ: 'chlod', poziom: 0.55 },
  { nazwa: 'Magazyn Bobrek', miasto: 'Cieszyn', lon: 18.6337, lat: 49.7486, typ: 'cieplo', poziom: 0.9 },
  { nazwa: 'Magazyn Sporysz', miasto: 'Żywiec', lon: 19.2012, lat: 49.6886, typ: 'chlod', poziom: 0.63 },
  { nazwa: 'Magazyn Brzezinka', miasto: 'Mysłowice', lon: 19.1386, lat: 50.2423, typ: 'cieplo', poziom: 0.38 },
  { nazwa: 'Magazyn Michałkowice', miasto: 'Siemianowice Śląskie', lon: 19.032, lat: 50.3024, typ: 'cieplo', poziom: 0.51 },
  { nazwa: 'Magazyn Szarlej', miasto: 'Piekary Śląskie', lon: 18.9449, lat: 50.3844, typ: 'chlod', poziom: 0.29 },
  { nazwa: 'Magazyn Wilchwy', miasto: 'Wodzisław Śląski', lon: 18.4658, lat: 50.0026, typ: 'cieplo', poziom: 0.77 },
];

/**
 * Rozsunięcie punktów pokazowych od środków miast.
 *
 * Znacznik postawiony dokładnie na współrzędnych miasta siadał na jego
 * podpisie z mapy Mapboxa — czytało się „Katowice Katowice". Przesuwamy więc
 * każdy o kilkaset metrów w inną stronę: dość, żeby zszedł z nazwy, i za mało,
 * żeby wyszedł z obszaru miasta.
 *
 * Przesunięcia są WYLICZANE Z NAZWY, nie losowane. Losowanie przy każdym
 * otwarciu mapy przestawiałoby znaczniki w kółko — a punkt pokazowy ma stać
 * tam, gdzie stał wczoraj. Ta sama nazwa zawsze daje to samo przesunięcie.
 */
function rozsuniecie(nazwa: string): { lon: number; lat: number } {
  // Prosta suma kodów znaków wystarcza: potrzebujemy powtarzalnego rozrzutu,
  // a nie dobrej funkcji skrótu.
  let suma = 0;
  for (let i = 0; i < nazwa.length; i += 1) suma += nazwa.charCodeAt(i) * (i + 1);

  const kat = (suma % 360) * (Math.PI / 180);
  // 0,012–0,022 stopnia to około 1–2,5 km — poza podpisem, w granicach miasta.
  const promien = 0.012 + ((suma % 7) / 7) * 0.01;

  return {
    // Długość geograficzna zwęża się z szerokością; na 50°N stopień długości
    // ma około 0,64 stopnia szerokości, więc bez tej poprawki rozrzut byłby
    // spłaszczony w pionie.
    lon: Math.cos(kat) * (promien / 0.64),
    lat: Math.sin(kat) * promien,
  };
}

export const LOKALIZACJE: ReadonlyArray<Lokalizacja> = [
  STANOWISKO,
  ...DEMO.map((d) => ({
    id: `demo-${d.miasto.toLowerCase().replace(/[^a-z]+/g, '-')}`,
    nazwa: d.nazwa,
    miasto: d.miasto,
    opis:
      d.typ === 'chlod'
        ? 'Punkt demonstracyjny · magazyn chłodu — bez instalacji i bez pomiarów'
        : 'Punkt demonstracyjny · magazyn ciepła — bez instalacji i bez pomiarów',
    lon: d.lon + rozsuniecie(d.miasto).lon,
    lat: d.lat + rozsuniecie(d.miasto).lat,
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
