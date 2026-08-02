/**
 * WYSOKOŚCI BELEK JAKO ZMIENNE CSS.
 *
 * Widok przewija się POD górną i dolną belką — dopiero wtedy ich miękkie
 * wygaszanie ma nad czym pracować. Wcześniej wszystkie trzy elementy leżały
 * w osobnych wierszach siatki, więc treść zaczynała się dokładnie tam, gdzie
 * kończył się pasek: gradient wygaszał się w pustkę, a granica i tak była
 * widoczna jako miejsce, w którym coś się zaczyna.
 *
 * Skoro treść wchodzi pod paski, musi dostać odsunięcie równe ich wysokości —
 * inaczej pierwszy wiersz tekstu chowałby się pod nagłówkiem. Wysokość zmienia
 * się z rozmiarem okna (nagłówek zawija się na wąskich ekranach), więc mierzy
 * ją obserwator rozmiaru, a nie wartość wpisana na stałe.
 */

import { useEffect } from 'react';

/**
 * Utrzymuje `--pas-gora` i `--pas-dol` w zgodzie z rzeczywistymi belkami.
 *
 * Zmienne siedzą na elemencie `.app`, nie na `:root` — dzięki temu widać
 * w narzędziach przeglądarki, do czego należą, i nie mieszają się z paletą.
 */
export function useWysokosciBelek(
  ramaRef: React.RefObject<HTMLDivElement | null>,
  gornaRef: React.RefObject<HTMLElement | null>,
  dolnaRef: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const rama = ramaRef.current;
    const gorna = gornaRef.current;
    const dolna = dolnaRef.current;
    if (!rama || !gorna || !dolna) return;

    const zmierz = (): void => {
      rama.style.setProperty('--pas-gora', `${Math.round(gorna.offsetHeight)}px`);
      rama.style.setProperty('--pas-dol', `${Math.round(dolna.offsetHeight)}px`);
    };

    zmierz();

    // Obserwator łapie zawijanie nagłówka i zmianę wysokości stopki. Zwykłe
    // nasłuchiwanie `resize` by nie wystarczyło: belka potrafi zmienić
    // wysokość bez zmiany rozmiaru okna, na przykład gdy dojdzie plakietka.
    const obserwator = new ResizeObserver(zmierz);
    obserwator.observe(gorna);
    obserwator.observe(dolna);
    return () => obserwator.disconnect();
  }, [ramaRef, gornaRef, dolnaRef]);
}
