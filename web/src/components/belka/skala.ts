/**
 * JEDNA funkcja mapowania temperatury na piksele.
 *
 * To jest warunek krytyczny całej belki: pasek strefowy i oś X wykresu muszą
 * pokrywać się w pionie co do piksela. Osiągamy to nie przez staranne
 * przeliczanie w dwóch miejscach, ale przez to, że drugiego miejsca NIE MA.
 * Segmenty paska, marker, wartość nad markerem, podpisy stref, krzywa,
 * prowadnice, prostokąt strefy przemiany, ticki osi i punkt pracy — wszystko
 * pyta tę samą `xOf`.
 *
 * Szerokość przychodzi z pomiaru elementu (ResizeObserver), a nie z procentów,
 * bo wykres jest rysowany w SVG w pikselach. Gdyby pasek liczył się
 * w procentach, a wykres w pikselach, oba byłyby „prawie" zgodne — i to
 * „prawie" widać na ekranie jako rozjazd rzędu jednego stopnia.
 */

export interface Skala {
  /** Szerokość pola rysowania w pikselach. */
  szerokosc: number;
  min: number;
  max: number;
  /** Pozycja temperatury w pikselach, przycięta do krańców skali. */
  xOf: (tempC: number) => number;
  /** Czy temperatura wypada poza skalą — i z której strony. */
  pozaSkala: (tempC: number) => 'ponizej' | 'powyzej' | null;
}

export function utworzSkale(szerokosc: number, min: number, max: number): Skala {
  const rozpietosc = max - min;

  const xOf = (tempC: number): number => {
    if (rozpietosc <= 0) return 0;
    const udzial = (tempC - min) / rozpietosc;
    return Math.min(1, Math.max(0, udzial)) * szerokosc;
  };

  const pozaSkala = (tempC: number): 'ponizej' | 'powyzej' | null => {
    if (tempC < min) return 'ponizej';
    if (tempC > max) return 'powyzej';
    return null;
  };

  return { szerokosc, min, max, xOf, pozaSkala };
}

/**
 * Ticki osi X co 5 °C, zawsze zawierające oba krańce skali.
 *
 * Kraniec bywa niepodzielny przez 5 (np. skala do 75 jest, ale gdyby była do
 * 73 — nie), a oś bez podpisanego końca kłamie o zakresie.
 */
export function tickiCo5(min: number, max: number): number[] {
  const ticki: number[] = [];
  const pierwszy = Math.ceil(min / 5) * 5;
  for (let t = pierwszy; t <= max; t += 5) ticki.push(t);
  if (ticki[0] !== min) ticki.unshift(min);
  if (ticki[ticki.length - 1] !== max) ticki.push(max);
  return ticki;
}

/** Liczba po polsku: przecinek dziesiętny, stała liczba miejsc. */
export function liczba(wartosc: number, miejsca = 1): string {
  return wartosc.toFixed(miejsca).replace('.', ',');
}
