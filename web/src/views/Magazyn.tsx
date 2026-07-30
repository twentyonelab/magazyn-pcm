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
import type { MaterialProfile } from '@magazyn-pcm/shared';
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
import { isInPhaseBand } from '../scale.js';
import { setSetting, useSettings } from '../settings.js';
import { PasekPrzemiany } from '../components/PasekPrzemiany.js';
import { PanelElementu } from '../components/PanelElementu.js';
import { PanelSondy } from '../components/PanelSondy.js';

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

interface MagazynProps {
  data: LiveData;
  /** Przejscie do widoku Przebiegi z wskazana sonda zaznaczona. */
  onOpenInPrzebiegi: (pointId: string) => void;
}

export function Magazyn({ data, onOpenInPrzebiegi }: MagazynProps) {
  const now = useTicker(1000);
  const settings = useSettings();
  const hostRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  /** Sonda, dla której otwarty jest panel z wykresem historii. */
  const [selected, setSelected] = useState<string | null>(null);
  /** Element instalacji (ciepłomierz, bufor…), dla którego otwarty jest panel. */
  const [selectedElement, setSelectedElement] = useState<string | null>(null);

  const { points, values, health, materials, session } = data;

  const pointMap = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const staleAfterMs = health?.staleAfterMs ?? FALLBACK_STALE_AFTER_MS;
  // Gdy kanał żyje, o przestarzałości decyduje serwer — patrz isStale().
  const channelAlive = data.link === 'live';

  // Hierarchia: sesja (deklaracja badacza) > rozpoznany zbiornik > podgląd.
  // Nigdy nie zgadujemy zakresu skali w kodzie widoku.
  //
  // `detection === 'unknown'` znaczy, że serwer NIE rozpoznał zbiornika i tylko
  // coś założył (tryb syntetyczny, brak UUID-ów). Nie wolno tego traktować jak
  // pewnika — inaczej przełącznik parafiny zablokowałby się na zgadniętej
  // wartości i nie dałoby się go ruszyć.
  const detectedBank =
    health && health.bank.detection !== 'unknown' ? health.bank.active : null;
  const activeMaterial = session?.material ?? detectedBank ?? settings.parafinaPodgladu;
  const profile: MaterialProfile | null = materials
    ? (materials.profiles[activeMaterial] ?? materials.profiles[materials.defaultMaterial])
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
      channelAlive,
    });
  }, [pointMap, values, profile, staleAfterMs, now, materials, channelAlive]);

  // --- Najechanie i klikanie sond na schemacie ------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    /** Identyfikator sondy pod kursorem albo null. */
    const sensorIdFrom = (event: Event): string | null => {
      const target = event.target as Element | null;
      const sensor = target?.closest?.('[data-sensor]');
      return sensor instanceof SVGElement ? (sensor.dataset.sensor ?? null) : null;
    };

    const onOver = (event: Event): void => setHovered(sensorIdFrom(event));
    const onLeave = (): void => setHovered(null);

    // Klik otwiera panel: sondy albo elementu instalacji. Zdarzenie łapiemy
    // na kontenerze, a nie na elementach — SVG jest wstrzykiwany jako tekst,
    // więc nie ma do czego przypiąć handlerów po stronie Reacta.
    //
    // Sonda ma pierwszeństwo przed urządzeniem, bo leży w jego wnętrzu —
    // inaczej klik w sondę magazynu otwierałby panel całego zbiornika.
    const onClick = (event: Event): void => {
      const sensorId = sensorIdFrom(event);
      if (sensorId) {
        setSelectedElement(null);
        setSelected((current) => (current === sensorId ? null : sensorId));
        return;
      }

      const target = event.target as Element | null;
      const element = target?.closest?.('[data-element]');
      const elementId =
        element instanceof SVGElement ? (element.dataset.element ?? null) : null;

      if (elementId) {
        setSelected(null);
        setSelectedElement((current) => (current === elementId ? null : elementId));
      }
    };

    host.addEventListener('mouseover', onOver);
    host.addEventListener('mouseleave', onLeave);
    host.addEventListener('click', onClick);
    return () => {
      host.removeEventListener('mouseover', onOver);
      host.removeEventListener('mouseleave', onLeave);
      host.removeEventListener('click', onClick);
    };
  }, []);

  const pcmPoints = points.filter((p) => p.group === 'pcm' && p.geometry);
  const selectedPoint = selected ? (pointMap.get(selected) ?? null) : null;

  // Średnia z sond magazynu — jedna liczba opisująca stan zbiornika,
  // zaznaczana kreską na pasku przemiany. Liczymy tylko z sond, które
  // NAPRAWDĘ mają odczyt: brak danych to null, nie zero, więc wliczenie
  // takiej sondy ściągnęłoby średnią w stronę zera i skłamało o zbiorniku.
  const pcmValues = pcmPoints
    .map((p) => values[p.id]?.v)
    .filter((v): v is number => typeof v === 'number');
  const averageC =
    pcmValues.length > 0 ? pcmValues.reduce((sum, v) => sum + v, 0) / pcmValues.length : null;

  return (
    <div className="stack magazyn-widok">
      {/* Pasek skali z pasmem przemiany — centralnie pod menu, rozwijany. */}
      <PasekPrzemiany
        profile={profile}
        materials={materials}
        fromSession={session?.material ?? null}
        detected={detectedBank}
        preview={settings.parafinaPodgladu}
        onPreviewChange={(material) => setSetting('parafinaPodgladu', material)}
        volumesL={materials?.volumesL}
        averageC={averageC}
      />

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

        {/* Podpowiedź ustępuje panelowi — dwie karty naraz zasłaniałyby schemat. */}
        {hovered && !selected ? (
          <SensorTooltip
            id={hovered}
            data={data}
            profile={profile}
            staleAfterMs={staleAfterMs}
            now={now}
          />
        ) : null}

        {selectedPoint ? (
          <PanelSondy
            point={selectedPoint}
            data={data}
            profile={profile}
            onClose={() => setSelected(null)}
            onOpenInPrzebiegi={onOpenInPrzebiegi}
          />
        ) : null}

        {selectedElement ? (
          <PanelElementu
            elementId={selectedElement}
            data={data}
            onClose={() => setSelectedElement(null)}
            onOpenInPrzebiegi={onOpenInPrzebiegi}
          />
        ) : null}
      </section>
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
  const state = pointState(point, value, staleAfterMs, now, data.link === 'live');
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

