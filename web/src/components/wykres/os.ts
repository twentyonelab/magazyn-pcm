/**
 * OSIE I GEOMETRIA WYKRESÓW PRZEGLĄDOWYCH — jedno źródło dla obu kart.
 *
 * Przegląd doby ma dwie karty: temperatury magazynu (`WykresMagazynu`)
 * i przepływy obiegów (`WykresPrzeplywow`). Leżą jedna pod drugą i muszą
 * wyglądać jak jedna rzecz: ta sama szerokość płótna, te same marginesy,
 * te same podpisy czasu i ta sama drabinka osi Y.
 *
 * Gdyby każda karta trzymała własne kopie tych stałych, pierwsza poprawka
 * w jednej rozjechałaby je względem siebie — a dwa wykresy jeden nad drugim,
 * z osiami czasu przesuniętymi o kilka pikseli, czyta się jako błąd
 * renderowania.
 */

/* --- Płótno --------------------------------------------------------------- */

/** Szerokie i niskie: doba danych czyta się wzdłuż, nie w pionie. */
export const W = 1400;

/**
 * Wysokość PODSTAWOWA — karta temperatur. Przepływy dostają niższe płótno
 * (patrz `H_NISKI`): dwie serie nie potrzebują tyle miejsca co sześć, a razem
 * i tak muszą się zmieścić na jednym ekranie.
 */
export const H = 520;
export const H_NISKI = 300;

export const M = { top: 26, right: 96, bottom: 40, left: 62 };
export const PLOT_W = W - M.left - M.right;
export const PLOT_H = H - M.top - M.bottom;
export const PLOT_H_NISKI = H_NISKI - M.top - M.bottom;

/* --- Podpisy i drabinki --------------------------------------------------- */

/**
 * Podpis chwili na osi.
 *
 * Przy zakresach dłuższych niż dwie doby sama godzina przestaje cokolwiek
 * znaczyć — osiem podpisów „14:20" jeden za drugim nie mówi, o który dzień
 * chodzi. Powyżej tej granicy pokazujemy datę.
 */
export function czas(ms: number, zakresMs: number): string {
  const d = new Date(ms);
  if (zakresMs > 48 * 3600 * 1000) {
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  }
  return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Wartości podziałki osi Y — okrągłe liczby, nie równe podziały zakresu.
 *
 * Zabezpieczenie przed pętlą bez końca (`krok <= 0`) nie jest teoretyczne:
 * przy zerowym kroku `v += krok` nigdy nie przekroczy granicy i karta zamarza.
 * Koszt tej linijki jest żaden, koszt zawieszonej przeglądarki duży.
 */
export function ticksY(min: number, max: number, ile = 6): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const surowy = span / ile;
  const rzad = 10 ** Math.floor(Math.log10(surowy));
  const krok = [1, 2, 2.5, 5, 10].map((m) => m * rzad).find((s) => span / s <= ile) ?? rzad * 10;
  if (!Number.isFinite(krok) || krok <= 0) return [min];
  const start = Math.ceil(min / krok) * krok;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += krok) out.push(Number(v.toFixed(6)));
  return out;
}

/* --- Zakresy czasu -------------------------------------------------------- */

export const GODZINA_MS = 3600 * 1000;

/**
 * Zakres wybiera SUWAK godzinowy (1–24 h) plus dwa przyciski: tydzień
 * i miesiąc — patrz `WyborZakresu.tsx`. Wcześniej stało tu pięć sztywnych
 * zakresów, a najczęstsze pytanie badacza brzmi „pokaż ostatnie N godzin",
 * gdzie N zależy od tego, kiedy zaczął się dzisiejszy test. Suwak odpowiada
 * na nie wprost; powyżej doby precyzja godzinowa przestaje mieć sens, więc
 * tydzień i miesiąc zostają skokami.
 */
export const SUWAK_MIN_H = 1;
export const SUWAK_MAX_H = 24;
export const TYDZIEN_H = 24 * 7;
export const MIESIAC_H = 24 * 30;
export const ZAKRES_DOMYSLNY_H = 24;

/** Podpis zakresu — do nagłówka karty i etykiet dostępności. */
export function etykietaZakresu(godzin: number): string {
  if (godzin === MIESIAC_H) return 'miesiąc';
  if (godzin === TYDZIEN_H) return 'tydzień';
  if (godzin === 24) return 'doba';
  if (godzin === 1) return 'godzina';
  return `${godzin} h`;
}
