/**
 * Tabela temperatur w konsoli — to jest widzialny efekt kroku pierwszego.
 *
 * Uklad odpowiada rzeczywistosci: poziomy od gory zbiornika w dol,
 * dwie przekatne obok siebie. Brak danych to kreska, nigdy zero.
 *
 * Liczby sa wyrownane do prawej i maja stala liczbe miejsc po przecinku —
 * inaczej wartosci drgaja przy kazdym odswiezeniu.
 */

import type { Health, PointDef, PointValue } from '@magazyn-pcm/shared';
import { LEVEL_LABELS, LEVELS_TOP_DOWN } from '@magazyn-pcm/shared';

/** Znak sterujacy ESC (27), zapisany kodem — surowy znak w zrodle jest kruchy. */
const ESC = String.fromCharCode(27);

const ANSI = {
  reset: `${ESC}[0m`,
  dim: `${ESC}[2m`,
  bold: `${ESC}[1m`,
  red: `${ESC}[31m`,
  yellow: `${ESC}[33m`,
  green: `${ESC}[32m`,
  cyan: `${ESC}[36m`,
} as const;

const useColor = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

function paint(text: string, color: keyof typeof ANSI): string {
  if (!useColor) return text;
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

/** Formatuje wartosc: stala szerokosc, kreska dla braku danych. */
function formatValue(value: PointValue, point: PointDef): string {
  if (value.v === null) return paint('   —  ', 'dim');

  const text = value.v.toFixed(point.precision).padStart(6);
  if (value.stale) return paint(text, 'yellow');
  return text;
}

function statusLabel(health: Health): string {
  switch (health.source) {
    case 'ok':
      return paint('ok', 'green');
    case 'starting':
      return paint('start', 'dim');
    case 'degraded':
      return paint('częściowo', 'yellow');
    case 'offline':
      return paint('brak łączności', 'yellow');
    case 'auth_error':
      return paint('logowanie odrzucone', 'red');
    case 'error':
      return paint('błąd', 'red');
  }
}

export interface RenderOptions {
  pcmPoints: readonly PointDef[];
  getValue: (id: string) => PointValue;
  health: Health;
  materialLabel: string;
}

/**
 * Buduje blok tekstu z szescioma temperaturami magazynu.
 */
export function renderPcmTable(opts: RenderOptions): string {
  const { pcmPoints, getValue, health, materialLabel } = opts;

  const time = new Date().toLocaleTimeString('pl-PL', { hour12: false });
  const lines: string[] = [];

  const sourceNote =
    health.sourceKind === 'mock' ? paint(' · DANE SYNTETYCZNE', 'yellow') : '';

  lines.push(
    `${paint('Magazyn PCM', 'bold')}  ${paint(`${materialLabel} · ${time}`, 'dim')}${sourceNote}`,
  );

  // Poziomy od gory w dol — tak, jak wyglada zbiornik.
  for (const level of LEVELS_TOP_DOWN) {
    const cells = pcmPoints
      .filter((p) => p.geometry?.level === level)
      .sort((a, b) => (a.geometry!.diagonal < b.geometry!.diagonal ? -1 : 1))
      .map((point) => {
        const value = getValue(point.id);
        return `${paint(point.id, 'cyan')} ${formatValue(value, point)} ${paint(point.unit, 'dim')}`;
      });

    if (cells.length === 0) continue;

    const label = `poziom ${level} (${LEVEL_LABELS[level]})`.padEnd(18);
    lines.push(`  ${paint(label, 'dim')}${cells.join('   ')}`);
  }

  // Stopka: stan zrodla, opoznienie, punkty przestarzale i oczekujace.
  const footer: string[] = [`źródło ${statusLabel(health)}`];

  if (health.latencyMs !== null) footer.push(`${health.latencyMs} ms`);

  if (health.staleIds.length > 0) {
    footer.push(paint(`przestarzałe: ${health.staleIds.join(', ')}`, 'yellow'));
  }

  if (health.pendingUuidIds.length > 0) {
    footer.push(
      paint(`bez UUID: ${health.pendingUuidIds.length} pkt (npm run uuid)`, 'yellow'),
    );
  }

  if (health.configChanged) {
    footer.push(paint('zmiana konfiguracji w Loxone Config!', 'red'));
  }

  lines.push(`  ${footer.join(paint(' · ', 'dim'))}`);

  return lines.join('\n');
}
