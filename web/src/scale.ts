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

/**
 * MAPA CIEPLNA W STOPNIACH, NIE W PROCENTACH ZAKRESU.
 *
 * Rampa wyżej opisuje POŁOŻENIE W ZAKRESIE MATERIAŁU (0..1) i to ma sens na
 * legendzie: pokazuje, jak daleko do pełnego naładowania. Na sondach mówiła
 * jednak nieprawdę o temperaturze — 9 °C w zbiorniku chłodu (zakres 0–20)
 * wypadało w połowie rampy, czyli na neutralnej kości słoniowej, choć to
 * woda o temperaturze lodówki. Ta sama liczba w zbiorniku ciepła (zakres
 * 40–75) byłaby poza skalą. Jedna barwa znaczyła więc dwie różne rzeczy.
 *
 * Przystanki są w STOPNIACH CELSJUSZA i są wspólne dla obu zbiorników:
 *   0–10 °C   odcienie niebieskiego (zimno)
 *   10–20 °C  przejście niebieski → pomarańcz
 *   20–75 °C  pomarańcz → czerwień (gorąco)
 * Poza zakresem barwa się zatrzymuje — 90 °C nie musi być czerwieńsze
 * od 75 °C, a rozjaśnianie w nieskończoność tylko myli.
 */
const MAPA_CIEPLNA: Array<{ st: number; rgb: [number, number, number] }> = [
  { st: 0, rgb: [58, 110, 176] }, // głęboki niebieski
  { st: 5, rgb: [122, 168, 208] },
  { st: 10, rgb: [186, 212, 228] }, // jasny niebieski — koniec strefy zimnej
  { st: 15, rgb: [238, 224, 196] }, // przejście przez neutralne
  { st: 20, rgb: [244, 178, 96] }, // pomarańcz
  { st: 45, rgb: [230, 122, 62] },
  { st: 75, rgb: [198, 52, 40] }, // czerwień
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

/** Kolor mapy cieplnej dla temperatury w stopniach Celsjusza. */
export function kolorTemperatury(stopnie: number): string {
  const pierwszy = MAPA_CIEPLNA[0]!;
  const ostatni = MAPA_CIEPLNA[MAPA_CIEPLNA.length - 1]!;
  if (stopnie <= pierwszy.st) return `rgb(${pierwszy.rgb.join(' ')})`;
  if (stopnie >= ostatni.st) return `rgb(${ostatni.rgb.join(' ')})`;

  for (let i = 0; i < MAPA_CIEPLNA.length - 1; i += 1) {
    const od = MAPA_CIEPLNA[i]!;
    const do_ = MAPA_CIEPLNA[i + 1]!;
    if (stopnie > do_.st) continue;

    const t = (stopnie - od.st) / (do_.st - od.st);
    return `rgb(${mix(od.rgb[0], do_.rgb[0], t)} ${mix(od.rgb[1], do_.rgb[1], t)} ${mix(
      od.rgb[2],
      do_.rgb[2],
      t,
    )})`;
  }

  return `rgb(${ostatni.rgb.join(' ')})`;
}

/** Kolor wypełnienia dla wartości punktu. Brak danych ma własny, martwy odcień. */
export const NO_DATA_FILL = '#eceee9';

/**
 * Wypełnienie sondy. Bierze SAMĄ TEMPERATURĘ — profil materiału nie jest tu
 * potrzebny i celowo go nie ma: ta sama liczba stopni ma na obu zbiornikach
 * wyglądać tak samo. Profil dalej decyduje o pasmie przemiany (isInPhaseBand)
 * i o legendzie, bo to są pytania o materiał, a nie o temperaturę.
 */
export function temperatureFill(value: number | null): string {
  if (value === null) return NO_DATA_FILL;
  return kolorTemperatury(value);
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

/** Kolor tekstu czytelny na danym tle mapy cieplnej. */
export function inkOn(value: number | null): string {
  if (value === null) return '#a3a3a0';
  // Oba końce mapy cieplnej są ciemne (głęboki niebieski i czerwień) —
  // tam tekst musi być jaśniejszy niż na neutralnym środku.
  return value <= 4 || value >= 40 ? '#f4f4ee' : '#0d1f14';
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
