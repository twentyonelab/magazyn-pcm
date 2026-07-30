/**
 * WARSTWA WIĄŻĄCA SVG — granica między rysunkiem a danymi.
 *
 * Schemat jest zewnętrznym plikiem SVG. Ta funkcja nie przerysowuje go ani
 * nie generuje: znajduje elementy po atrybutach data-* i aktualizuje im
 * tekst, wypełnienie i klasy. Dzięki temu przebudowa grafiki to podmiana
 * jednego pliku, a nie zmiana w kodzie.
 *
 * Wywoływana przy każdym zdarzeniu SSE. Kosztuje tyle, co kilka
 * querySelectorAll po kilkunastu elementach — żadnego renderowania Reacta
 * wewnątrz rysunku.
 */

import type { MaterialProfile, PointValue, PointValues, PublicPoint } from '@magazyn-pcm/shared';
import { NO_DATA, isStale } from '../format.js';
import { NO_DATA_FILL, inkOn, isInPhaseBand, temperatureFill } from '../scale.js';

export interface BindOptions {
  points: Map<string, PublicPoint>;
  values: PointValues;
  profile: MaterialProfile;
  staleAfterMs: number;
  now: number;
  /**
   * Przepływ, przy którym animacja osiąga pełną prędkość (m³/h).
   * Pochodzi z konfiguracji widoku, nie z rysunku.
   */
  flowFullSpeed: number;
  /** Czy kanał do serwera żyje — decyduje, kto ocenia przestarzałość. */
  channelAlive?: boolean;
}

/** Klasy stanu — dokładnie jedna z nich siedzi na elemencie. */
const STATE_CLASSES = [
  'is-ok',
  'is-stale',
  'is-no-data',
  'is-not-connected',
  'is-active',
  'is-inactive',
  'is-unknown',
  'is-phase',
  'is-flowing',
  'is-still',
];

function setState(element: Element, ...classes: string[]): void {
  for (const name of STATE_CLASSES) element.classList.remove(name);
  for (const name of classes) element.classList.add(name);
}

/** Stan punktu widziany przez rysunek. */
type Status = 'ok' | 'stale' | 'no-data' | 'not-connected';

function statusOf(
  point: PublicPoint | undefined,
  value: PointValue | undefined,
  staleAfterMs: number,
  now: number,
  channelAlive: boolean,
): Status {
  // Punkt nieznany i punkt zadeklarowany-ale-niepodlaczony wygladaja tak samo
  // na rysunku; roznice widac w konsoli (patrz warnUnknownPoint).
  if (!point || !point.available) return 'not-connected';
  if (!value || value.v === null) return 'no-data';
  return isStale(value, staleAfterMs, now, channelAlive) ? 'stale' : 'ok';
}

/**
 * Identyfikatory ze schematu, ktorych nie ma w rejestrze punktow.
 * Ostrzegamy RAZ na identyfikator — bindSchema biegnie co 5 s, wiec
 * ostrzeganie za kazdym razem zasypaloby konsole.
 */
const warnedUnknown = new Set<string>();

function warnUnknownPoint(id: string): void {
  if (warnedUnknown.has(id)) return;
  warnedUnknown.add(id);
  // eslint-disable-next-line no-console
  console.warn(
    `schema.svg odwołuje się do punktu "${id}", którego nie ma w rejestrze ` +
      '(server/src/points.config.ts). Element zostanie pokazany jako niepodłączony. ' +
      'Najczęstsza przyczyna: literówka w atrybucie data-* po przerysowaniu rysunku.',
  );
}

export function bindSchema(root: ParentNode, opts: BindOptions): void {
  const { points, values, profile, staleAfterMs, now } = opts;
  const channelAlive = opts.channelAlive ?? false;

  // --- Wartości liczbowe ---------------------------------------------------
  for (const element of root.querySelectorAll<SVGElement>('[data-point]')) {
    const id = element.dataset.point;
    if (!id) continue;

    const point = points.get(id);
    if (!point) warnUnknownPoint(id);
    const value = values[id];
    const status = statusOf(point, value, staleAfterMs, now, channelAlive);

    if (status === 'ok' || status === 'stale') {
      const precision = point?.precision ?? 1;
      const unit = element.dataset.unit ?? point?.unit ?? '';
      const number = value!.v!.toFixed(precision);
      element.textContent = unit ? `${number} ${unit}` : number;
    } else {
      // Brak danych to kreska. Nigdy zero, nigdy puste miejsce.
      element.textContent = NO_DATA;
    }

    setState(element, `is-${status}`);
  }

  // --- Wypełnienia według wartości ----------------------------------------
  for (const element of root.querySelectorAll<SVGElement>('[data-fill-point]')) {
    const id = element.dataset.fillPoint;
    if (!id) continue;

    const point = points.get(id);
    if (!point) warnUnknownPoint(id);
    const value = values[id];
    const status = statusOf(point, value, staleAfterMs, now, channelAlive);
    const usable = status === 'ok' || status === 'stale';
    const numeric = usable ? value!.v : null;

    element.setAttribute('fill', usable ? temperatureFill(numeric, profile) : NO_DATA_FILL);
    setState(element, `is-${status}`);

    // Pasmo przemiany fazowej ma OSOBNE oznaczenie na grupie sondy —
    // punkt w plateau znaczy coś zupełnie innego niż punkt poza nim.
    const group = element.closest<SVGElement>('.sensor') ?? element;
    const inBand = status === 'ok' && isInPhaseBand(numeric, profile);
    group.classList.toggle('is-phase', inBand);
    group.classList.toggle('is-dim', status === 'not-connected');

    // Tekst wartości w tej samej grupie dostaje czytelny kolor na tle skali.
    const text = group.querySelector<SVGElement>(`[data-point="${id}"]`);
    if (text) text.style.fill = usable ? inkOn(numeric, profile) : '';
  }

  // --- Animacja przepływu --------------------------------------------------
  for (const element of root.querySelectorAll<SVGElement>('[data-flow]')) {
    const sourceId = element.dataset.flowSource;
    const value = sourceId ? values[sourceId] : undefined;
    const point = sourceId ? points.get(sourceId) : undefined;
    const status = statusOf(point, value, staleAfterMs, now, channelAlive);

    const flow = status === 'ok' && value?.v !== null ? (value?.v ?? 0) : 0;

    if (flow <= 0) {
      // ZEROWY PRZEPŁYW TO BRAK RUCHU, nie ruch wolny. Wolno sunąca kreska
      // sugerowałaby, że coś płynie — a nic nie płynie.
      element.style.removeProperty('--flow-duration');
      setState(element, 'is-still');
      continue;
    }

    const ratio = Math.min(flow / opts.flowFullSpeed, 1);
    // Od 4 s (ledwo płynie) do 0,6 s (pełny przepływ) na cykl kreski.
    const duration = 4 - ratio * 3.4;
    element.style.setProperty('--flow-duration', `${duration.toFixed(2)}s`);
    setState(element, 'is-flowing');
  }

  // --- Stany binarne -------------------------------------------------------
  for (const element of root.querySelectorAll<SVGElement>('[data-state]')) {
    const id = element.dataset.state;
    if (!id) continue;

    const point = points.get(id);
    const value = values[id];
    const status = statusOf(point, value, staleAfterMs, now, channelAlive);

    if (status === 'ok') {
      setState(element, value!.v === 0 ? 'is-inactive' : 'is-active');
    } else {
      // Nie wiemy, czy pracuje. To NIE to samo co "nie pracuje".
      setState(element, 'is-unknown');
    }
  }

  // --- Elementy chowane przy przestarzałej wartości ------------------------
  for (const element of root.querySelectorAll<SVGElement>('[data-stale-hide]')) {
    const id = element.dataset.staleHide || element.dataset.point;
    if (!id) continue;

    const value = values[id];
    const hide = !value || value.v === null || isStale(value, staleAfterMs, now, channelAlive);
    element.classList.toggle('is-hidden', hide);
  }
}
