/**
 * Skala barwna temperatury.
 *
 * DLACZEGO ZAKRES NIE MOŻE BYĆ ZAPISANY W KODZIE WIDOKU:
 * plateau przemiany RT8HC ma szerokość 2 K. Przy skali 0-100 stopni cała
 * przemiana fazowa byłaby jednym odcieniem — a to jest jedyna rzecz, którą
 * ten ekran ma pokazywać. Zakres pochodzi więc z profilu materiału
 * (server/src/materials.config.ts), przez /api/materials.
 *
 * Paleta jest ODDZIELNYM systemem od palety interfejsu. Interfejs jest
 * jasny i wycofany, a skala ma być jedyną rzeczą, która na tym ekranie
 * naprawdę krzyczy.
 */

import type { MaterialProfile, PointValue } from '@magazyn-pcm/shared';

/** Przystanki rampy: chłód -> neutralnie -> ciepło. */
const RAMP: Array<{ at: number; rgb: [number, number, number] }> = [
  { at: 0.0, rgb: [176, 205, 224] }, // wychłodzony
  { at: 0.28, rgb: [214, 228, 232] },
  { at: 0.5, rgb: [240, 238, 226] }, // środek zakresu
  { at: 0.72, rgb: [244, 205, 138] },
  { at: 1.0, rgb: [222, 120, 84] }, // naładowany
];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Kolor dla pozycji 0..1 na rampie. */
export function rampColor(position: number): string {
  const t = clamp01(position);

  for (let i = 0; i < RAMP.length - 1; i += 1) {
    const from = RAMP[i]!;
    const to = RAMP[i + 1]!;
    if (t > to.at) continue;

    const span = to.at - from.at;
    const local = span === 0 ? 0 : (t - from.at) / span;

    return `rgb(${mix(from.rgb[0], to.rgb[0], local)} ${mix(from.rgb[1], to.rgb[1], local)} ${mix(
      from.rgb[2],
      to.rgb[2],
      local,
    )})`;
  }

  const last = RAMP[RAMP.length - 1]!;
  return `rgb(${last.rgb[0]} ${last.rgb[1]} ${last.rgb[2]})`;
}

/** Pozycja temperatury na skali materiału (0..1). */
export function scalePosition(value: number, profile: MaterialProfile): number {
  const span = profile.scaleMax - profile.scaleMin;
  if (span <= 0) return 0;
  return clamp01((value - profile.scaleMin) / span);
}

/** Kolor wypełnienia dla wartości punktu. Brak danych ma własny, martwy odcień. */
export const NO_DATA_FILL = '#eceee9';

export function temperatureFill(value: number | null, profile: MaterialProfile): string {
  if (value === null) return NO_DATA_FILL;
  return rampColor(scalePosition(value, profile));
}

/**
 * Czy temperatura mieści się w pasmie przemiany fazowej.
 *
 * To NAJWAŻNIEJSZA informacja na tym ekranie: punkt wewnątrz plateau znaczy
 * coś zupełnie innego niż punkt poza nim — materiał oddaje albo pobiera
 * ciepło utajone, a temperatura prawie nie drgnie.
 */
export function isInPhaseBand(value: number | null, profile: MaterialProfile): boolean {
  if (value === null) return false;
  return value >= profile.phaseBandMin && value <= profile.phaseBandMax;
}

/** Kolor tekstu czytelny na danym tle skali. */
export function inkOn(value: number | null, profile: MaterialProfile): string {
  if (value === null) return '#a3a3a0';
  // Skrajne odcienie rampy są ciemniejsze — tam rozjaśniamy tekst.
  const position = scalePosition(value, profile);
  return position > 0.86 ? '#3a1d12' : '#0d1f14';
}

/** Pozycja pasma przemiany na legendzie, w procentach szerokości. */
export function phaseBandBounds(profile: MaterialProfile): { left: number; width: number } {
  const min = scalePosition(profile.phaseBandMin, profile) * 100;
  const max = scalePosition(profile.phaseBandMax, profile) * 100;
  return { left: min, width: Math.max(max - min, 0.6) };
}

/** Czy wartość punktu jest przydatna do barwienia (temperatura z danymi). */
export function isColorable(value: PointValue | undefined): boolean {
  return Boolean(value && value.v !== null);
}
