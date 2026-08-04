/**
 * Panel jednej sondy — wykres jej historii bez opuszczania widoku magazynu.
 *
 * Otwiera sie klikniecien sondy na schemacie albo karty w panelu bocznym.
 * Sluzy do szybkiego spojrzenia "co ta sonda robila", a nie do analizy —
 * do tego jest widok Przebiegi, do ktorego prowadzi stad przycisk.
 *
 * Dlaczego osobny komponent, a nie rozbudowa Przebiegow: badacz stojacy przy
 * stanowisku patrzy na schemat i chce sprawdzic JEDNA sonde. Przenoszenie go
 * za kazdym razem do formularza z wyborem punktow i zakresow gubi kontekst,
 * w ktorym jest.
 */

import { useEffect, useMemo, useState } from 'react';
import type { HistoryAvailable, MaterialProfile, PublicPoint } from '@magazyn-pcm/shared';
import { fetchHistory, type HistoryParams } from '../api.js';
import { SERIES_COLORS, Wykres, type ChartSeries } from '../components/Wykres.js';
import { AkcjeWykresu } from './AkcjeWykresu.js';
import type { LiveData } from '../useLiveData.js';
import { FALLBACK_STALE_AFTER_MS, NO_DATA, POINT_STATE_LABEL, formatAge, formatValue, pointState } from '../format.js';
import { isInPhaseBand } from '../scale.js';
import { useSettings } from '../settings.js';

/** Zakresy do szybkiego spojrzenia. Pelna kontrola jest w Przebiegach. */
const RANGES: Array<{ label: string; hours: number }> = [
  { label: '1 h', hours: 1 },
  { label: '6 h', hours: 6 },
  { label: '24 h', hours: 24 },
  { label: '7 dni', hours: 168 },
];

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: HistoryAvailable; params: HistoryParams };

interface Props {
  point: PublicPoint;
  data: LiveData;
  profile: MaterialProfile | null;
  onClose: () => void;
  /** Przejscie do widoku Przebiegi z ta sonda zaznaczona. */
  onOpenInPrzebiegi: (pointId: string) => void;
}

export function PanelSondy({ point, data, profile, onClose, onOpenInPrzebiegi }: Props) {
  const settings = useSettings();
  const [hours, setHours] = useState(1);
  const [state, setState] = useState<State>({ kind: 'loading' });

  const value = data.values[point.id];
  const staleAfterMs = data.health?.staleAfterMs ?? FALLBACK_STALE_AFTER_MS;
  const currentState = pointState(point, value, staleAfterMs, Date.now(), data.link === 'live');
  const inBand = profile ? isInPhaseBand(value?.v ?? null, profile) : false;

  // Zamykanie klawiszem Escape — panel przykrywa czesc schematu.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });

    const toMs = Date.now();
    const fromMs = toMs - hours * 3600_000;
    const params: HistoryParams = {
      ids: [point.id],
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      resolution: 'auto',
    };

    fetchHistory(params)
      .then((response) => {
        if (!alive) return;
        if (!response.available) {
          setState({ kind: 'unavailable', message: response.message });
          return;
        }
        setState({ kind: 'ready', data: response, params });
      })
      .catch((error) => {
        if (!alive) return;
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      alive = false;
    };
    // Przy zmianie sondy albo zakresu pobieramy od nowa. `data.values` celowo
    // NIE jest zaleznoscia — inaczej wykres przerysowywalby sie co 5 sekund.
  }, [point.id, hours]);

  const chart = useMemo(() => {
    if (state.kind !== 'ready') return null;
    const entry = state.data.series[0];
    if (!entry) return null;

    const series: ChartSeries[] = [
      {
        id: entry.id,
        label: point.label,
        color: SERIES_COLORS[0]!,
        unit: point.unit,
        precision: point.precision,
        points: entry.points,
      },
    ];

    return {
      series,
      band:
        point.unit === '°C' && profile
          ? {
              min: profile.phaseBandMin,
              max: profile.phaseBandMax,
              label: `przemiana ${profile.phaseBandMin}–${profile.phaseBandMax} °C`,
            }
          : null,
      fromMs: Date.parse(state.data.from),
      toMs: Date.parse(state.data.to),
    };
  }, [state, point, profile]);

  const stats = useMemo(() => {
    if (state.kind !== 'ready') return null;
    const values = (state.data.series[0]?.points ?? [])
      .map((p) => p.v)
      .filter((v): v is number => v !== null);
    if (values.length === 0) return null;

    const fmt = (v: number): string => `${v.toFixed(point.precision)} ${point.unit}`.trim();
    return {
      count: values.length,
      min: fmt(Math.min(...values)),
      max: fmt(Math.max(...values)),
      avg: fmt(values.reduce((a, b) => a + b, 0) / values.length),
      // Zmiana od pierwszej do ostatniej probki — mowi, czy sonda rosla czy spadala.
      delta: `${(values[values.length - 1]! - values[0]!).toFixed(point.precision)} ${point.unit}`.trim(),
    };
  }, [state, point]);

  return (
    <aside className="probe-panel" role="dialog" aria-label={`Historia sondy ${point.id}`}>
      <header className="probe-panel__head">
        <div>
          <p className="probe-panel__id mono">{point.id}</p>
          <p className="probe-panel__label">{point.label}</p>
        </div>
        <button type="button" className="probe-panel__close" onClick={onClose} aria-label="Zamknij">
          ×
        </button>
      </header>

      <div className="probe-panel__now">
        <span className="probe-panel__value mono">
          {value ? formatValue(value, point) : NO_DATA}
        </span>
        <span className={`badge is-${currentState}`}>{POINT_STATE_LABEL[currentState]}</span>
        {inBand ? <span className="probe-panel__phase">w pasmie przemiany</span> : null}
        <span className="probe-panel__age mono">
          {value ? `odczyt ${formatAge(value, Date.now())} temu` : ''}
        </span>
      </div>

      <div className="probe-panel__ranges">
        {RANGES.map((range) => (
          <button
            key={range.hours}
            type="button"
            className={`chip${hours === range.hours ? ' is-active' : ''}`}
            onClick={() => setHours(range.hours)}
          >
            {range.label}
          </button>
        ))}
      </div>

      {state.kind === 'loading' ? <div className="note">Pobieram historię…</div> : null}

      {state.kind === 'unavailable' ? (
        <div className="note">
          <strong>Historia niedostępna.</strong> {state.message}
        </div>
      ) : null}

      {state.kind === 'error' ? <div className="note is-bad">{state.message}</div> : null}

      {state.kind === 'ready' && chart ? (
        chart.series[0]!.points.length === 0 ? (
          <div className="note">
            W tym zakresie nie ma pomiarów tej sondy. Serwer zbiera dane tylko wtedy, gdy działa.
          </div>
        ) : (
          <>
            <Wykres
              series={chart.series}
              band={chart.band}
              events={settings.zdarzeniaNaWykresie ? [] : []}
              fromMs={chart.fromMs}
              toMs={chart.toMs}
            />

            {stats ? (
              <dl className="probe-panel__stats">
                <div>
                  <dt>min</dt>
                  <dd className="mono">{stats.min}</dd>
                </div>
                <div>
                  <dt>średnia</dt>
                  <dd className="mono">{stats.avg}</dd>
                </div>
                <div>
                  <dt>max</dt>
                  <dd className="mono">{stats.max}</dd>
                </div>
                <div>
                  <dt>zmiana</dt>
                  <dd className="mono">{stats.delta}</dd>
                </div>
                <div>
                  <dt>próbek</dt>
                  <dd className="mono">{stats.count}</dd>
                </div>
              </dl>
            ) : null}

            <div className="probe-panel__actions">
              <button
                type="button"
                className="chip"
                onClick={() => onOpenInPrzebiegi(point.id)}
              >
                otwórz w Przebiegach
              </button>
              <AkcjeWykresu params={state.params} nazwa={point.id} />
            </div>
          </>
        )
      ) : null}
    </aside>
  );
}
