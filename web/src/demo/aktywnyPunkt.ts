/**
 * KTÓRY PUNKT Z MAPY JEST WŁAŚNIE OGLĄDANY.
 *
 * Wartości bieżące płyną przez `useDanePunktu` i tam podmiana źródła jest
 * czysta. Historia idzie inaczej: wykresy wołają `fetchHistory` wprost
 * z warstwy API, bez przechodzenia przez stan Reacta. Gdyby ta funkcja nie
 * wiedziała o wybranym punkcie, pod znacznikiem pokazowym rysowałby się
 * przebieg STANOWISKA BADAWCZEGO — czyli prawdziwe pomiary podpisane cudzą
 * nazwą. To najgorszy możliwy błąd w tej aplikacji.
 *
 * Stąd ta jedna zmienna poza Reactem. Świadomie mała i tylko do odczytu
 * z zewnątrz: ustawia ją wyłącznie `App`, przy zmianie oglądanego punktu.
 * Alternatywą byłby kontekst przewleczony przez wszystkie wykresy, co przy
 * jednej wartości kosztowałoby więcej, niż daje.
 */

import type { Lokalizacja } from '../map/lokalizacje.js';

let wybrany: Lokalizacja | null = null;

export function ustawAktywnyPunkt(punkt: Lokalizacja | null): void {
  wybrany = punkt;
}

/** `null` = oglądamy stanowisko badawcze i dane są prawdziwe. */
export function aktywnyPunkt(): Lokalizacja | null {
  return wybrany;
}
