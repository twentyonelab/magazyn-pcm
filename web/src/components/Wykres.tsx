/**
 * Wykres liniowy szeregow czasowych — bez biblioteki, czysty SVG.
 *
 * Zasady (z metody wizualizacji danych):
 *   - jedna os Y — wszystkie serie w tych samych jednostkach; mieszanie
 *     jednostek na dwoch osiach to najczestszy blad wykresow i UI go nie
 *     dopuszcza (wybor punktow filtruje sie po jednostce),
 *   - kolory serii w STALEJ kolejnosci z walidowanej palety — filtr, ktory
 *     zmienia liczbe serii, nie przemalowuje pozostalych,
 *   - cienkie linie (2 px), wycofana siatka, etykiety w kolorze tekstu,
 *   - dziura w danych to dziura na wykresie — zadnej interpolacji,
 *   - najechanie pokazuje pionowa linie i wartosci wszystkich serii,
 *   - pasmo przemiany fazowej jako spokojne tlo, nie kolejny kolor serii.
 */

import { useMemo, useRef, useState } from 'react';
import type { SessionEvent } from '@magazyn-pcm/shared';

/** Walidowana paleta kategoryczna (kolejnosc STALA, nigdy cyklicznie). */
export const SERIES_COLORS = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
] as const;

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  unit: string;
  precision: number;
  points: Array<{ ts: string; v: number | null }>;
}

export interface ChartBand {
  min: number;
  max: number;
  label: string;
}

interface WykresProps {
  series: ChartSeries[];
  /** Pasmo przemiany fazowej — rysowane, gdy przecina zakres danych. */
  band: ChartBand | null;
  /** Znaczniki zdarzen sesji w zakresie wykresu. */
  events: SessionEvent[];
  fromMs: number;
  toMs: number;
}

const W = 920;
const H = 380;
const M = { top: 18, right: 84, bottom: 34, left: 52 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const step0 = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => span / s <= count) ?? magnitude * 10;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

function formatTime(ms: number, rangeMs: number): string {
  const date = new Date(ms);
  const clock = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  if (rangeMs <= 48 * 3600 * 1000) return clock;
  const day = date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  return `${day} ${clock}`;
}

export function Wykres({ series, band, events, fromMs, toMs }: WykresProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const rangeMs = toMs - fromMs;
  const xOf = (ms: number): number => M.left + ((ms - fromMs) / rangeMs) * PLOT_W;

  // --- Dziedzina Y: dane + pasmo przemiany, z oddechem ----------------------
  const { yMin, yMax } = useMemo(() => {
    const values = series.flatMap((s) => s.points.map((p) => p.v)).filter((v): v is number => v !== null);
    if (values.length === 0) return { yMin: 0, yMax: 1 };
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (band && band.min < max + 2 && band.max > min - 2) {
      min = Math.min(min, band.min);
      max = Math.max(max, band.max);
    }
    const pad = Math.max((max - min) * 0.08, 0.5);
    return { yMin: min - pad, yMax: max + pad };
  }, [series, band]);

  const yOf = (v: number): number => M.top + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;
  const yTicks = useMemo(() => niceTicks(yMin, yMax), [yMin, yMax]);
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i <= 6; i += 1) ticks.push(fromMs + (rangeMs * i) / 6);
    return ticks;
  }, [fromMs, rangeMs]);

  // Mediana odstepu probek — do wykrywania dziur w danych.
  const gapLimitMs = useMemo(() => {
    const deltas: number[] = [];
    for (const s of series) {
      for (let i = 1; i < s.points.length; i += 1) {
        deltas.push(Date.parse(s.points[i]!.ts) - Date.parse(s.points[i - 1]!.ts));
      }
    }
    deltas.sort((a, b) => a - b);
    const median = deltas[Math.floor(deltas.length / 2)] ?? 60_000;
    return median * 2.5;
  }, [series]);

  // --- Sciezki: przerwane na null i na dziurze czasowej ----------------------
  const paths = useMemo(
    () =>
      series.map((s) => {
        let d = '';
        let previousMs: number | null = null;
        let pen = false;
        for (const point of s.points) {
          const ms = Date.parse(point.ts);
          if (point.v === null || (previousMs !== null && ms - previousMs > gapLimitMs && pen)) {
            pen = point.v !== null ? false : pen;
            if (point.v === null) {
              previousMs = ms;
              pen = false;
              continue;
            }
          }
          const x = xOf(ms).toFixed(1);
          const y = yOf(point.v).toFixed(1);
          d += pen ? ` L${x} ${y}` : ` M${x} ${y}`;
          pen = true;
          previousMs = ms;
        }
        return { id: s.id, color: s.color, d: d.trim() };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, gapLimitMs, yMin, yMax, fromMs, rangeMs],
  );

  // --- Najechanie: najblizsza probka kazdej serii ---------------------------
  const hover = useMemo(() => {
    if (hoverX === null) return null;
    const ms = fromMs + ((hoverX - M.left) / PLOT_W) * rangeMs;
    const rows = series
      .map((s) => {
        let best: { ts: number; v: number | null } | null = null;
        for (const point of s.points) {
          const pms = Date.parse(point.ts);
          if (best === null || Math.abs(pms - ms) < Math.abs(best.ts - ms)) {
            best = { ts: pms, v: point.v };
          }
        }
        return best && Math.abs(best.ts - ms) <= gapLimitMs
          ? { id: s.id, color: s.color, unit: s.unit, precision: s.precision, ...best }
          : null;
      })
      .filter(Boolean) as Array<{
      id: string;
      color: string;
      unit: string;
      precision: number;
      ts: number;
      v: number | null;
    }>;
    if (rows.length === 0) return null;
    return { ms: rows[0]!.ts, rows };
  }, [hoverX, series, fromMs, rangeMs, gapLimitMs]);

  const onMove = (event: React.MouseEvent<SVGSVGElement>): void => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * W;
    setHoverX(x >= M.left && x <= M.left + PLOT_W ? x : null);
  };

  // Bezposrednie etykiety przy koncach linii — tylko do 4 serii, wyzej robi
  // sie z tego kolaz; identyfikacje przejmuje wtedy legenda + tabela.
  const directLabels = series.length <= 4;

  const visibleEvents = events.filter((e) => {
    const ms = Date.parse(e.ts);
    return ms >= fromMs && ms <= toMs;
  });

  return (
    <div className="chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="chart__svg"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverX(null)}
        role="img"
        aria-label="Wykres przebiegu wartości w czasie"
      >
        {/* Pasmo przemiany fazowej — spokojne tlo. */}
        {band && band.max > yMin && band.min < yMax ? (
          <g>
            <rect
              x={M.left}
              width={PLOT_W}
              y={yOf(Math.min(band.max, yMax))}
              height={Math.max(yOf(Math.max(band.min, yMin)) - yOf(Math.min(band.max, yMax)), 1)}
              className="chart__band"
            />
            <text x={M.left + 6} y={yOf(band.max) - 5} className="chart__band-label">
              {band.label}
            </text>
          </g>
        ) : null}

        {/* Siatka i osie — wycofane. */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={M.left} x2={M.left + PLOT_W} y1={yOf(tick)} y2={yOf(tick)} className="chart__grid" />
            <text x={M.left - 8} y={yOf(tick) + 4} className="chart__tick chart__tick--y">
              {tick}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={tick} x={xOf(tick)} y={H - 10} className="chart__tick chart__tick--x">
            {formatTime(tick, rangeMs)}
          </text>
        ))}

        {/* Znaczniki zdarzen sesji. */}
        {visibleEvents.map((event, index) => (
          <g key={`${event.ts}-${index}`}>
            <line
              x1={xOf(Date.parse(event.ts))}
              x2={xOf(Date.parse(event.ts))}
              y1={M.top}
              y2={M.top + PLOT_H}
              className="chart__event"
            />
            <text
              x={xOf(Date.parse(event.ts)) + 4}
              y={M.top + 12 + (index % 3) * 13}
              className="chart__event-label"
            >
              {event.label}
            </text>
          </g>
        ))}

        {/* Serie. */}
        {paths.map((path) =>
          path.d ? (
            <path key={path.id} d={path.d} fill="none" stroke={path.color} strokeWidth={2} strokeLinejoin="round" />
          ) : null,
        )}

        {/* Bezposrednie etykiety przy koncu linii. */}
        {directLabels
          ? series.map((s) => {
              const last = [...s.points].reverse().find((p) => p.v !== null);
              if (!last) return null;
              return (
                <text
                  key={s.id}
                  x={xOf(Date.parse(last.ts)) + 6}
                  y={yOf(last.v!) + 4}
                  className="chart__direct-label"
                >
                  {s.id}
                </text>
              );
            })
          : null}

        {/* Krzyz najechania. */}
        {hover ? (
          <g>
            <line x1={xOf(hover.ms)} x2={xOf(hover.ms)} y1={M.top} y2={M.top + PLOT_H} className="chart__crosshair" />
            {hover.rows.map((row) =>
              row.v !== null ? (
                <circle key={row.id} cx={xOf(row.ts)} cy={yOf(row.v)} r={4} fill={row.color} className="chart__dot" />
              ) : null,
            )}
          </g>
        ) : null}
      </svg>

      {hover ? (
        <div
          className="chart__tooltip"
          style={{ left: `${(xOf(hover.ms) / W) * 100}%` }}
          role="status"
        >
          <p className="chart__tooltip-time">{formatTime(hover.ms, rangeMs)}</p>
          {hover.rows.map((row) => (
            <p key={row.id} className="chart__tooltip-row">
              <span className="chart__swatch" style={{ background: row.color }} />
              <span className="chart__tooltip-id">{row.id}</span>
              <span className="mono">
                {row.v === null ? '—' : `${row.v.toFixed(row.precision)} ${row.unit}`}
              </span>
            </p>
          ))}
        </div>
      ) : null}

      {/* Legenda — zawsze przy >= 2 seriach; kolor niesie znacznik, nie tekst. */}
      {series.length >= 2 ? (
        <div className="chart__legend">
          {series.map((s) => (
            <span key={s.id} className="chart__legend-item">
              <span className="chart__swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
