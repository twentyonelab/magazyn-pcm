/**
 * MODEL DOBY PRACY STANOWISKA — źródło danych trybu pokazowego.
 *
 * Po co to istnieje: strona pokazowa stoi na GitHub Pages, który serwuje
 * wyłącznie pliki i nie ma jak uruchomić serwera odpytującego Miniserver.
 * Bez tego modułu wszystkie sondy pokazywałyby kreski i nie dałoby się
 * pokazać nikomu, jak aplikacja pracuje.
 *
 * TE LICZBY SĄ ZMYŚLONE. Nie pochodzą z żadnego pomiaru i nie wolno ich
 * cytować jako wyniku. Interfejs mówi to wprost plakietką „dane pokazowe",
 * której nie da się wyłączyć — patrz PlakietkaPokazowa.
 *
 * DLACZEGO WYLICZANE Z CZASU, A NIE LOSOWANE. Wartość jest czystą funkcją
 * znacznika czasu: `f(ts)`. Dzięki temu wykres historyczny i bieżący odczyt
 * nigdy się nie rozjeżdżają, przeładowanie strony niczego nie przestawia,
 * a to samo zapytanie o historię zawsze zwraca to samo. Losowanie przy
 * każdym wywołaniu dałoby wykres, który zmienia kształt przy odświeżeniu.
 *
 * CO MODEL POKAZUJE. Dobę pracy magazynu z materiałem 57HC:
 *
 *   06–11  ładowanie      pompa ciepła grzeje, temperatura rośnie i ZATRZYMUJE
 *                         SIĘ w paśmie przemiany — materiał pochłania ciepło
 *                         utajone, nie grzejąc się dalej. To najważniejsza
 *                         rzecz do pokazania na tym stanowisku.
 *   11–17  postój         powolne stygnięcie, rozwarstwienie się wygładza
 *   17–22  rozładowanie   odbiór ciepła, temperatura spada i znowu przystaje
 *                         w paśmie — tym razem materiał ciepło oddaje
 *   22–06  spoczynek      dryf w dół, zbiornik prawie jednorodny
 *
 * Plateau jest w modelu ZAMIERZONE i wpisane wprost (funkcja `zPlateau`),
 * a nie wzięte z równania przewodnictwa. To ilustracja zjawiska, nie symulacja.
 */

import { PASMO_MAX, PASMO_MIN } from './stale.js';

/** Doba w milisekundach. */
const DOBA_MS = 24 * 3600 * 1000;

/** Skrajne temperatury cyklu — poza pasmem przemiany po obu stronach. */
const T_DOL = 44;
const T_GORA = 66;

/**
 * Powtarzalny szum z znacznika czasu.
 *
 * Zwykły `Math.random` odpada — wartość musi być funkcją czasu, żeby dwa
 * zapytania o ten sam moment dały to samo. To zwykły hash rozsmarowany
 * na przedział (-1, 1).
 */
function szum(ms: number, ziarno: number): number {
  const x = Math.sin(ms * 0.000_012_3 + ziarno * 137.51) * 43_758.545_3;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Miękkie przejście 0→1 na przedziale [a, b] — bez kantów na wykresie. */
function wygladz(x: number, a: number, b: number): number {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
}

/**
 * Postęp cyklu w dobie: 0 = najzimniej, 1 = najcieplej.
 *
 * Godziny są ułamkowe, więc przejścia wypadają płynnie także między próbkami.
 */
export function postepDoby(ms: number): number {
  const d = new Date(ms);
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

  if (h < 6) return 0.06 * (1 - h / 6); // noc: resztka ciepła schodzi
  if (h < 11) return wygladz(h, 6, 11); // ładowanie
  if (h < 17) return 1 - 0.18 * wygladz(h, 11, 17); // postój, lekkie straty
  if (h < 22) return 0.82 * (1 - wygladz(h, 17, 22)); // rozładowanie
  return 0.06 + 0.0 * h; // wieczór: prawie zimno
}

/**
 * Ile CZASU cyklu przypada na pasmo przemiany.
 *
 * Liczba nie jest dobrana na oko. Przy stałej mocy czas jest proporcjonalny
 * do pochłoniętego ciepła, a dla 57HC wychodzi:
 *
 *   utajone   240 kJ/kg                        (z profilu materiału)
 *   jawne     ok. 2 kJ/(kg·K) × 22 K = 44 kJ/kg (zakres 44–66 °C tego modelu)
 *
 * czyli na samą przemianę idzie 240/284 ≈ 85% energii ładowania — i tyle samo
 * czasu. Stąd wykres prawdziwego magazynu PCM jest w większości płaski,
 * a strome odcinki widać tylko na końcach.
 *
 * Bierzemy 0,72 zamiast 0,85, bo model dostaje pasmu mniej czasu z dwóch
 * powodów: moc nie jest stała przez całe ładowanie, a zbiornik pracuje
 * warstwami — górne sondy wchodzą w przemianę wcześniej niż dolne, więc
 * pojedyncza sonda widzi półkę krótszą niż zbiornik jako całość.
 *
 * Pierwsza wersja miała tu 0,42 i sonda spędzała w paśmie 29% ładowania —
 * za mało, żeby półkę było widać, i niezgodnie z fizyką materiału.
 */
const UDZIAL_PRZEMIANY = 0.72;

/** Zakres cieplny nośnika — parafina 57HC albo materiał chłodniczy 8HC. */
export interface ZakresNosnika {
  tDol: number;
  tGora: number;
  pasmoMin: number;
  pasmoMax: number;
}

/** Zakres stanowiska badawczego: parafina 57HC. */
const ZAKRES_57HC: ZakresNosnika = {
  tDol: T_DOL,
  tGora: T_GORA,
  pasmoMin: PASMO_MIN,
  pasmoMax: PASMO_MAX,
};

/**
 * Postęp cyklu → temperatura, z przystankiem w paśmie przemiany.
 *
 * Wydzielone z parametrem zakresu, bo punkty pokazowe na mapie pracują dwoma
 * nośnikami: parafiną 57HC (przemiana 55–58 °C) i materiałem 8HC (7–9 °C).
 * Kształt krzywej jest ten sam, zmieniają się tylko granice.
 */
export function temperaturaZPostepu(postep: number, zakres: ZakresNosnika = ZAKRES_57HC): number {
  const { tDol, tGora, pasmoMin, pasmoMax } = zakres;
  const przedPasmem = (pasmoMin - tDol) / (tGora - tDol - (pasmoMax - pasmoMin));
  const dolnaCzesc = przedPasmem * (1 - UDZIAL_PRZEMIANY);
  const gornaCzesc = dolnaCzesc + UDZIAL_PRZEMIANY;

  if (postep <= dolnaCzesc) {
    return tDol + (postep / dolnaCzesc) * (pasmoMin - tDol);
  }
  if (postep <= gornaCzesc) {
    const t = (postep - dolnaCzesc) / UDZIAL_PRZEMIANY;
    return pasmoMin + t * (pasmoMax - pasmoMin);
  }
  const t = (postep - gornaCzesc) / (1 - gornaCzesc);
  return pasmoMax + t * (tGora - pasmoMax);
}

function zPlateau(postep: number): number {
  return temperaturaZPostepu(postep, ZAKRES_57HC);
}

/** Czy o tej porze przez instalację coś płynie. */
export function fazaPracy(ms: number): 'ladowanie' | 'postoj' | 'rozladowanie' | 'spoczynek' {
  const h = new Date(ms).getHours();
  if (h >= 6 && h < 11) return 'ladowanie';
  if (h >= 11 && h < 17) return 'postoj';
  if (h >= 17 && h < 22) return 'rozladowanie';
  return 'spoczynek';
}

/**
 * Temperatura jednej sondy magazynu.
 *
 * Rozwarstwienie: poziom 3 (góra) jest najcieplejszy, poziom 1 (dół)
 * najzimniejszy, a różnica rośnie w trakcie ładowania i zanika przy postoju —
 * tak zachowuje się zbiornik warstwowy. Przekątna B idzie ułamek stopnia za A,
 * bo sondy nie stoją w tym samym miejscu.
 */
export function temperaturaSondy(id: string, ms: number): number {
  const poziom = Number(id[1]) as 1 | 2 | 3;
  const przekatna = id[0] === 'B' ? 1 : 0;

  const postep = postepDoby(ms);
  const bazowa = zPlateau(postep);

  // Rozwarstwienie jest największe w ruchu, najmniejsze w spoczynku.
  const ruch = fazaPracy(ms) === 'postoj' || fazaPracy(ms) === 'spoczynek' ? 0.35 : 1;
  const rozwarstwienie = (poziom - 2) * 1.9 * ruch;

  return (
    bazowa + rozwarstwienie - przekatna * 0.28 + szum(ms, poziom * 3 + przekatna) * 0.06
  );
}

/** Przepływ w m³/h — zero, gdy pompa stoi. */
export function przeplyw(ms: number): number {
  const faza = fazaPracy(ms);
  if (faza === 'postoj' || faza === 'spoczynek') return 0;
  return 0.55 + szum(ms, 11) * 0.02;
}

/** Zasilanie i powrót ciepłomierza. */
export function temperaturyObiegu(ms: number): { t1: number; t2: number } {
  const faza = fazaPracy(ms);
  const srednia = (temperaturaSondy('A3', ms) + temperaturaSondy('A1', ms)) / 2;

  if (faza === 'ladowanie') return { t1: srednia + 4.2, t2: srednia + 0.5 };
  if (faza === 'rozladowanie') return { t1: srednia - 3.8, t2: srednia - 0.4 };
  // Bez przepływu zasilanie i powrót schodzą się do temperatury zbiornika.
  return { t1: srednia + 0.1, t2: srednia - 0.1 };
}

/**
 * OBIEG ODBIORU — druga para temperatur, lewa strona schematu.
 *
 * To osobny obieg niż źródło i pracuje w PRZECIWNEJ fazie: źródło ładuje
 * magazyn (pompa ciepła grzeje), odbiór go rozładowuje (ktoś ciepło zabiera).
 * Dlatego przy ładowaniu ta para stoi zwarta na temperaturze zbiornika —
 * dokładnie tak, jak wygląda prawdziwe stanowisko, gdy odbioru nie ma
 * (2026-08-04: 24,8 i 24,9 °C, ΔT −0,1 K).
 *
 * Kierunek różnicy wynika ze strzałek na rysunku: przez rurę przy x=694 płyn
 * WYCHODZI ze zbiornika, przez tę przy x=672 WRACA. Wychodzący jest więc
 * cieplejszy (zabiera ciepło), wracający chłodniejszy — o tyle, ile odbiorca
 * zdążył pobrać.
 */
export function temperaturyOdbioru(ms: number): { zasilanie: number; powrot: number } {
  const faza = fazaPracy(ms);
  const srednia = (temperaturaSondy('A3', ms) + temperaturaSondy('A1', ms)) / 2;

  if (faza === 'rozladowanie') {
    // Odbiorca pobiera ciepło: wychodzi ciepłe, wraca o ~3,4 K chłodniejsze.
    return { zasilanie: srednia - 0.3, powrot: srednia - 3.7 };
  }
  if (faza === 'ladowanie') {
    // Obieg odbioru stoi, więc obie sondy widzą to samo — z drobnym dryfem
    // pomiaru, żeby nie wyszły dwie identyczne liczby (te nie zdarzają się
    // na prawdziwych sondach i wyglądają jak wpisana stała).
    return { zasilanie: srednia + 0.15, powrot: srednia + 0.05 };
  }
  return { zasilanie: srednia + 0.05, powrot: srednia - 0.05 };
}

/**
 * Przepływ obiegu odbioru — od 2026-08-04 kanał Modbus tego licznika ISTNIEJE
 * (`ODBIOR_Przeplyw`), więc pokaz może go podawać. Mniejszy niż w źródle, bo
 * odbiór idzie przez wymiennik wody użytkowej, nie przez pompę ciepła.
 */
export function przeplywOdbioru(ms: number): number {
  const faza = fazaPracy(ms);
  if (faza !== 'rozladowanie') return 0;
  return 0.42 + szum(ms, 17) * 0.015;
}

/**
 * Moc cieplna w kW, ze wzoru Q = V · ΔT · 1,163.
 *
 * Znak idzie za kierunkiem: ładowanie dodatnie, rozładowanie ujemne — tak
 * samo jak liczy to ciepłomierz na stanowisku.
 */
export function moc(ms: number): number {
  const { t1, t2 } = temperaturyObiegu(ms);
  return przeplyw(ms) * (t1 - t2) * 1.163;
}

/** Temperatura powietrza na zewnątrz — chłodno nad ranem, ciepło po południu. */
export function temperaturaZewnetrzna(ms: number): number {
  const d = new Date(ms);
  const h = d.getHours() + d.getMinutes() / 60;
  return 9.5 + 6 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + szum(ms, 21) * 0.4;
}

/** Napromienienie słoneczne — zero po zmroku. */
export function napromienienie(ms: number): number {
  const h = new Date(ms).getHours() + new Date(ms).getMinutes() / 60;
  if (h < 5.5 || h > 20) return 0;
  return Math.max(0, Math.round(620 * Math.sin(((h - 5.5) / 14.5) * Math.PI)));
}

/**
 * Licznik energii — całka mocy od początku doby.
 *
 * Liczona prostokątami co kwadrans. Dokładność nie ma tu znaczenia; chodzi
 * o to, żeby licznik rósł monotonicznie i zgadzał się z przebiegiem mocy,
 * bo inaczej wykres i wartość na schemacie przeczyłyby sobie.
 */
export function energia(ms: number, kierunek: 'grzanie' | 'chlodzenie'): number {
  const poczatek = new Date(ms).setHours(0, 0, 0, 0);
  const krok = 15 * 60 * 1000;
  let suma = 0;
  for (let t = poczatek; t < ms; t += krok) {
    const p = moc(t);
    if (kierunek === 'grzanie' ? p > 0 : p < 0) suma += Math.abs(p) * (krok / 3_600_000);
  }
  return suma;
}

export { DOBA_MS };
