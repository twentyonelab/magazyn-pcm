/**
 * Widok Magazyn PCM — główny ekran aplikacji.
 *
 * Centralny obiekt to przekrój zbiornika z sześcioma sondami w układzie
 * odpowiadającym rzeczywistości: dwa pręty po przekątnych, na każdym trzy
 * poziomy. Po lewej droga ciepła: pompa ciepła → bufor → magazyn.
 *
 * Schemat jest ZEWNĘTRZNYM PLIKIEM SVG. Ten komponent go wstrzykuje i przy
 * każdej zmianie danych woła warstwę wiążącą, która aktualizuje elementy po
 * atrybutach data-*. Rysunku nie przerysowujemy — React nie zagląda do jego
 * wnętrza.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MaterialProfile, PublicPoint } from '@magazyn-pcm/shared';
import { LEVELS_TOP_DOWN, LEVEL_LABELS } from '@magazyn-pcm/shared';
import schemaMarkup from '../schema/schema.svg?raw';
import { bindSchema } from '../schema/bindSchema.js';
import type { LiveData } from '../useLiveData.js';
import {
  FALLBACK_STALE_AFTER_MS,
  NO_DATA,
  POINT_STATE_LABEL,
  formatAge,
  formatValue,
  pointState,
} from '../format.js';
import { isInPhaseBand, phaseBandBounds, rampColor, temperatureFill } from '../scale.js';
import { useSettings } from '../settings.js';

const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;

/** Odlicza sekundy, żeby wiek wartości i przestarzałość żyły bez zdarzeń SSE. */
function useTicker(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function Magazyn({ data }: { data: LiveData }) {
  const now = useTicker(1000);
  const settings = useSettings();
  const hostRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);

  const { points, values, health, materials, session } = data;

  const pointMap = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const staleAfterMs = health?.staleAfterMs ?? FALLBACK_STALE_AFTER_MS;

  // Materiał należy do SESJI. Gdy żadna nie trwa, bierzemy domyślny
  // z konfiguracji serwera — nigdy nie zgadujemy zakresu skali w kodzie widoku.
  const profile: MaterialProfile | null = materials
    ? materials.profiles[session?.material ?? materials.defaultMaterial]
    : null;

  // --- Wstrzyknięcie rysunku, raz ------------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host || host.childElementCount > 0) return;
    host.innerHTML = schemaMarkup;
  }, []);

  // --- Aktualizacja rysunku przy każdej zmianie danych ---------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !profile || host.childElementCount === 0) return;

    bindSchema(host, {
      points: pointMap,
      values,
      profile,
      staleAfterMs,
      now,
      flowFullSpeed: materials?.flowFullSpeed ?? 0.8,
    });
  }, [pointMap, values, profile, staleAfterMs, now, materials]);

  // --- Podpowiedź po najechaniu na sondę -----------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onOver = (event: Event): void => {
      const target = event.target as Element | null;
      const sensor = target?.closest?.('[data-sensor]');
      setHovered(sensor instanceof SVGElement ? (sensor.dataset.sensor ?? null) : null);
    };
    const onLeave = (): void => setHovered(null);

    host.addEventListener('mouseover', onOver);
    host.addEventListener('mouseleave', onLeave);
    return () => {
      host.removeEventListener('mouseover', onOver);
      host.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  const pcmPoints = points.filter((p) => p.group === 'pcm' && p.geometry);

  return (
    <div className="magazyn">
      {/* ------------------------- Panel sond ------------------------- */}
      <aside className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Sondy w magazynie</h2>
          <span className="panel__count">{pcmPoints.length}</span>
        </div>

        {profile ? <PhaseLegend profile={profile} /> : null}

        <div className="probes">
          {LEVELS_TOP_DOWN.map((level) => (
            <div className="probes__level" key={level}>
              <p className="probes__label">
                poziom {level} · {LEVEL_LABELS[level]}
              </p>
              <div className="probes__row">
                {pcmPoints
                  .filter((p) => p.geometry?.level === level)
                  .sort((a, b) => (a.geometry!.diagonal < b.geometry!.diagonal ? -1 : 1))
                  .map((point) => (
                    <ProbeCard
                      key={point.id}
                      point={point}
                      data={data}
                      profile={profile}
                      staleAfterMs={staleAfterMs}
                      now={now}
                      active={hovered === point.id}
                      onHover={setHovered}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>

        {profile ? (
          <div className="panel__foot">
            <p className="panel__footline">
              <span>materiał</span>
              <strong>{profile.label}</strong>
            </p>
            <p className="panel__footline">
              <span>przemiana</span>
              <strong>
                {profile.phaseBandMin}–{profile.phaseBandMax} °C
              </strong>
            </p>
            <p className="panel__footline">
              <span>ciepło utajone</span>
              <strong>{profile.latentHeat} kJ/kg</strong>
            </p>
            {materials ? (
              <p className="panel__footline">
                <span>magazyn / bufor</span>
                <strong>
                  {materials.volumesL.storage} / {materials.volumesL.buffer} l
                </strong>
              </p>
            ) : null}
          </div>
        ) : null}
      </aside>

      {/* ------------------------- Schemat ------------------------- */}
      {/* Wylaczenie animacji w opcjach zatrzymuje ruch kreski na rurach —
          niezaleznie od tego zerowy przeplyw i tak nigdy sie nie animuje. */}
      <section className={`canvas${settings.animacjePrzeplywu ? '' : ' no-flow-anim'}`}>
        <div className="canvas__tools">
          <button
            type="button"
            className="tool"
            onClick={() => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX))}
            aria-label="Powiększ"
          >
            +
          </button>
          <button
            type="button"
            className="tool"
            onClick={() => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN))}
            aria-label="Pomniejsz"
          >
            −
          </button>
          <button
            type="button"
            className="tool"
            onClick={() => setZoom(1)}
            aria-label="Dopasuj do okna"
          >
            ⤢
          </button>
        </div>

        <div className="canvas__scroll">
          <div
            className="canvas__stage"
            style={{ width: `${zoom * 100}%` }}
            ref={hostRef}
            aria-label="Schemat instalacji"
          />
        </div>

        {hovered ? (
          <SensorTooltip
            id={hovered}
            data={data}
            profile={profile}
            staleAfterMs={staleAfterMs}
            now={now}
          />
        ) : null}

        <FlowNote data={data} staleAfterMs={staleAfterMs} now={now} />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Legenda skali z ZAZNACZONYM PASMEM PRZEMIANY.
 *
 * To najważniejszy element opisowy na ekranie. Bez niego kolor sondy jest
 * tylko ładnym odcieniem; z nim widać, czy materiał właśnie się przemienia.
 */
function PhaseLegend({ profile }: { profile: MaterialProfile }) {
  const band = phaseBandBounds(profile);
  const gradient = `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1]
    .map((stop) => `${rampColor(stop)} ${stop * 100}%`)
    .join(', ')})`;

  return (
    <div className="legend">
      <div className="legend__bar" style={{ background: gradient }}>
        <div
          className="legend__band"
          style={{ left: `${band.left}%`, width: `${band.width}%` }}
          title={`Pasmo przemiany ${profile.phaseBandMin}–${profile.phaseBandMax} °C`}
        />
      </div>
      <div className="legend__scale">
        <span>{profile.scaleMin} °C</span>
        <span className="legend__band-label">
          przemiana {profile.phaseBandMin}–{profile.phaseBandMax} °C
        </span>
        <span>{profile.scaleMax} °C</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function ProbeCard(props: {
  point: PublicPoint;
  data: LiveData;
  profile: MaterialProfile | null;
  staleAfterMs: number;
  now: number;
  active: boolean;
  onHover: (id: string | null) => void;
}) {
  const { point, data, profile, staleAfterMs, now, active, onHover } = props;
  const value = data.values[point.id];
  const state = pointState(point, value, staleAfterMs, now);
  const inBand = profile ? isInPhaseBand(value?.v ?? null, profile) : false;

  const swatch =
    profile && (state === 'ok' || state === 'stale')
      ? temperatureFill(value?.v ?? null, profile)
      : undefined;

  return (
    <div
      className={`probe is-${state}${active ? ' is-hovered' : ''}${inBand ? ' is-phase' : ''}`}
      onMouseEnter={() => onHover(point.id)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="probe__swatch" style={swatch ? { background: swatch } : undefined} />
      <span className="probe__id mono">{point.id}</span>
      <span className="probe__value mono">{value ? formatValue(value, point) : NO_DATA}</span>
      {inBand ? <span className="probe__phase">przemiana</span> : null}
      {state === 'stale' ? <span className="probe__warn">przestarzałe</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function SensorTooltip(props: {
  id: string;
  data: LiveData;
  profile: MaterialProfile | null;
  staleAfterMs: number;
  now: number;
}) {
  const { id, data, profile, staleAfterMs, now } = props;
  const point = data.points.find((p) => p.id === id);
  if (!point) return null;

  const value = data.values[id];
  const state = pointState(point, value, staleAfterMs, now);
  const inBand = profile ? isInPhaseBand(value?.v ?? null, profile) : false;

  return (
    <div className="tooltip">
      <p className="tooltip__title">{point.label}</p>
      <p className="tooltip__value mono">{value ? formatValue(value, point) : NO_DATA}</p>
      <dl className="tooltip__rows">
        <div>
          <dt>stan</dt>
          <dd>{POINT_STATE_LABEL[state]}</dd>
        </div>
        <div>
          <dt>ostatni odczyt</dt>
          <dd className="mono">{value ? formatAge(value, now) : NO_DATA}</dd>
        </div>
        {point.geometry ? (
          <div>
            <dt>położenie</dt>
            <dd>
              przekątna {point.geometry.diagonal}, poziom {point.geometry.level}
            </dd>
          </div>
        ) : null}
      </dl>
      {inBand ? <p className="tooltip__phase">w pasmie przemiany fazowej</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * Wyjaśnienie, dlaczego rury się nie animują.
 *
 * Zerowy przepływ to brak ruchu, nie ruch wolny — ale nieruchoma linia bez
 * wyjaśnienia wygląda jak zepsuta aplikacja. Skoro nie mamy jeszcze danych
 * z ciepłomierza, mówimy to wprost.
 */
function FlowNote({
  data,
  staleAfterMs,
  now,
}: {
  data: LiveData;
  staleAfterMs: number;
  now: number;
}) {
  const point = data.points.find((p) => p.id === 'METER_FLOW');
  if (!point) return null;

  const value = data.values.METER_FLOW;
  const state = pointState(point, value, staleAfterMs, now);

  if (state === 'ok' && (value?.v ?? 0) > 0) {
    return (
      <p className="flow-note">
        przepływ <strong className="mono">{formatValue(value!, point)}</strong> — animacja
        proporcjonalna do wartości
      </p>
    );
  }

  return (
    <p className="flow-note is-quiet">
      {state === 'not-connected'
        ? 'Ciepłomierz nie jest jeszcze podłączony — brak danych o przepływie, więc rury pozostają nieruchome.'
        : 'Zerowy przepływ — rury nieruchome.'}
    </p>
  );
}
