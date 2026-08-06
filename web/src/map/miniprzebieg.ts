/**
 * Mini-przebieg 24 h do karty stanowiska na mapie.
 *
 * Karta po najechaniu na znacznik ma odpowiadać na pytanie „co się tu działo
 * przez ostatnią dobę" ZANIM ktoś wejdzie do magazynu — jedna linia średniej
 * z sond, bez osi i legendy. To podgląd, nie wykres do czytania wartości;
 * pełne przebiegi są w widoku Przebiegi.
 *
 * TYLKO DLA STANOWISK LIVE. Punkt pokazowy nie ma historii pomiarów, a mini
 * wykres z wymyślonych liczb wyglądałby jak zapis z czujnika — dokładnie to
 * kłamstwo, którego ta aplikacja unika.
 */

import { fetchHistory } from '../api.js';

/** Sondy zbiornika — te same identyfikatory co w widoku Przebiegi. */
const SONDY = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];

export interface MiniPrzebieg {
  /** Średnia z sond na wspólnej osi czasu. */
  punkty: Array<{ ts: number; v: number }>;
  min: number;
  max: number;
}

/**
 * Pobiera dobę historii i składa JEDNĄ linię średniej.
 *
 * `/api/history` zwraca serie RZADKIE — każda sonda ma kubełki tylko tam,
 * gdzie wartość się zmieniła, więc serie mają różne długości. Łączenie po
 * indeksie tablicy przesuwa czas między sondami (ten błąd raz zepsuł widok
 * rozwarstwienia — patrz WykresMagazynu). Dlatego: wspólna oś ze WSZYSTKICH
 * znaczników czasu, każda sonda niesie ostatnią znaną wartość, a do średniej
 * wchodzą tylko chwile, w których niosą ją WSZYSTKIE sondy z danymi.
 */
export async function pobierzMiniPrzebieg(): Promise<MiniPrzebieg | null> {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 3600_000);

  let odpowiedz;
  try {
    odpowiedz = await fetchHistory({
      ids: SONDY,
      from: from.toISOString(),
      to: to.toISOString(),
      // 15 minut daje ~96 punktów — dość na kształt doby, za mało, żeby
      // odpytywanie mapy obciążało bazę.
      resolution: '15m',
    });
  } catch {
    return null;
  }
  if (!odpowiedz.available) return null;

  // Sondy bez ani jednego odczytu w dobie odpadają (świeżo przepięty zestaw
  // może mieć krótszą historię); bez żadnej serii nie ma czego rysować.
  const serie = odpowiedz.series
    .map((s) =>
      s.points
        .filter((p): p is { ts: string; v: number } => p.v !== null)
        .map((p) => ({ ts: Date.parse(p.ts), v: p.v })),
    )
    .filter((s) => s.length > 0);
  if (serie.length === 0) return null;

  const os = [...new Set(serie.flatMap((s) => s.map((p) => p.ts)))].sort((a, b) => a - b);

  const wskazniki = serie.map(() => 0);
  const niesione: Array<number | null> = serie.map(() => null);
  const punkty: Array<{ ts: number; v: number }> = [];

  for (const ts of os) {
    for (let i = 0; i < serie.length; i += 1) {
      const s = serie[i]!;
      while (wskazniki[i]! < s.length && s[wskazniki[i]!]!.ts <= ts) {
        niesione[i] = s[wskazniki[i]!]!.v;
        wskazniki[i] = wskazniki[i]! + 1;
      }
    }
    if (niesione.every((v) => v !== null)) {
      const suma = (niesione as number[]).reduce((a, b) => a + b, 0);
      punkty.push({ ts, v: suma / niesione.length });
    }
  }

  if (punkty.length < 2) return null;

  let min = Infinity;
  let max = -Infinity;
  for (const p of punkty) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  return { punkty, min, max };
}

/**
 * Rysunek linii jako tekst SVG — dymek Mapboxa przyjmuje HTML przez
 * `setHTML`, więc i wykres musi być tekstem. Wchodzą tu wyłącznie liczby
 * z naszego serwera i kolor z naszej palety, żadnych danych z zewnątrz.
 */
export function svgMiniPrzebiegu(mp: MiniPrzebieg, kolor: string): string {
  const W = 248;
  const H = 56;
  const PAD = 4;

  const t0 = mp.punkty[0]!.ts;
  const t1 = mp.punkty[mp.punkty.length - 1]!.ts;
  // Płaska doba (temperatura w plateau stoi godzinami) nie może dzielić
  // przez zero — wtedy linia idzie środkiem.
  const rozpietosc = mp.max - mp.min || 1;

  const xy = (p: { ts: number; v: number }): string => {
    const x = PAD + ((p.ts - t0) / (t1 - t0 || 1)) * (W - 2 * PAD);
    const y = H - PAD - ((p.v - mp.min) / rozpietosc) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  const linia = mp.punkty.map(xy).join(' ');
  // Wypełnienie pod linią — domknięte do dołu, ledwo widoczne, żeby linia
  // miała ciężar bez drugiego koloru.
  const obszar = `${PAD},${H - PAD} ${linia} ${W - PAD},${H - PAD}`;

  return (
    `<svg class="dymek__mini" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
    `<polygon points="${obszar}" fill="${kolor}" opacity="0.12"/>` +
    `<polyline points="${linia}" fill="none" stroke="${kolor}" stroke-width="1.8" ` +
    `stroke-linejoin="round" stroke-linecap="round"/>` +
    `</svg>`
  );
}

/** Format `12,3` — przecinek dziesiętny jak w całym interfejsie. */
function liczba(v: number): string {
  return v.toFixed(1).replace('.', ',');
}

/** Cały blok mini-przebiegu do wstawienia w treść dymka. */
export function blokMiniPrzebiegu(mp: MiniPrzebieg, kolor: string): string {
  return (
    '<div class="dymek__przebieg">' +
    '<div class="dymek__przebieg-naglowek">' +
    '<span>ostatnie 24 h · średnia z sond</span>' +
    `<span class="mono">${liczba(mp.min)}–${liczba(mp.max)} °C</span>` +
    '</div>' +
    svgMiniPrzebiegu(mp, kolor) +
    '</div>'
  );
}
