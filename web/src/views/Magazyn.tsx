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

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MaterialProfile } from '@magazyn-pcm/shared';
import schemaMarkup from '../schema/schema.svg?raw';
import { bindSchema } from '../schema/bindSchema.js';
import { wlaczStrumien, type Strumien } from '../schema/strumien.js';
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
import { sredniaZSond } from '../naladowanie.js';
import { energiaKWh, socZTemperatury, type OdczytSoc } from '../soc.js';
import { KONFIGURACJA } from '../components/belka/konfiguracja.js';
import { setSetting, useSettings } from '../settings.js';
import { PasekPrzemiany } from '../components/PasekPrzemiany.js';
import { PanelElementu } from '../components/PanelElementu.js';
import { PanelSondy } from '../components/PanelSondy.js';
import { PrzelacznikRzutu } from '../components/PrzelacznikRzutu.js';
import { Pogoda } from '../components/Pogoda.js';

const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;

/**
 * Schemat startuje ODDALONY o 20%.
 *
 * Wpisany w pole co do piksela dotykał krawędzi ekranu i sprawiał wrażenie
 * przyciętego, nawet gdy nic nie było ucięte. Dwadzieścia procent zapasu daje
 * rysunkowi oddech i miejsce na kafelek pogody oraz narzędzia w rogach.
 * Przycisk „dopasuj do okna" wraca właśnie do tej wartości, nie do 1.
 */
const ZOOM_STARTOWY = 0.8;

/**
 * Przepływ pokazywany w trybie demo, m³/h.
 *
 * 0,5 m³/h to wartość ROBOCZA tej instalacji — nie maksimum ciepłomierza
 * (qp 2,5 m³/h). Pokaz ma wyglądać jak normalna praca, nie jak stan skrajny.
 */
const PRZEPLYW_DEMO_M3H = 0.5;

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
  /** Rzut: plaski schemat czy scena trojwymiarowa. */
  wymiar: '2d' | '3d';
  /** `null` = scena 3D wylaczona w opcjach, wiec nie ma czego przelaczac. */
  onWymiar: ((wymiar: '2d' | '3d') => void) | null;
  /**
   * Scena 3D wstrzykiwana z powloki, a nie importowana tutaj.
   *
   * Powodem jest leniwe wczytywanie: three.js wisi w osobnej paczce i to
   * powloka trzyma jej `lazy` oraz `Suspense`. Gdyby ten widok importowal
   * scene sam, paczka trafialaby do wspolnego pliku i placilby za nia takze
   * ten, kto nigdy nie klika trojwymiaru.
   */
  scena3d: ReactNode;
}

export function Magazyn({ data, onOpenInPrzebiegi, wymiar, onWymiar, scena3d }: MagazynProps) {
  const now = useTicker(1000);
  const settings = useSettings();
  /**
   * Kontener wstrzykniętego SVG — trzymany w STANIE, nie w referencji.
   *
   * Referencja nie powiadamia o zmianie, więc efekty musiałyby zgadywać, kiedy
   * węzeł się pojawił. Stan ustawiany przez `ref={setHost}` zmusza React do
   * przeliczenia efektów dokładnie wtedy, gdy kontener przychodzi albo odchodzi
   * — a odchodzi przy każdym przejściu na widok 3D.
   */
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(ZOOM_STARTOWY);
  /**
   * Tryb pokazowy przepływu. Domyślnie WYŁĄCZONY — ekran ma domyślnie mówić
   * prawdę o instalacji, a udawanie ruchu wymaga świadomego kliknięcia.
   */
  const [demo, setDemo] = useState(false);
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

  // --- Wstrzyknięcie rysunku ------------------------------------------------
  //
  // Zależność to WĘZEŁ, nie pusta tablica. Wcześniej stało tu `[]`, czyli „raz,
  // przy montowaniu widoku" — i przestało wystarczać, gdy schemat dostał
  // przełącznik 2D/3D. Przejście na 3D usuwa kontener rysunku z drzewa, ale nie
  // usuwa całego widoku, więc powrót na 2D tworzył PUSTY kontener i żaden efekt
  // go już nie wypełniał: schemat po prostu nie wracał.
  //
  // Referencja zwrotna (`setHost` w `ref`) rozwiązuje to u źródła. React woła ją
  // za każdym przypięciem i odpięciem węzła, więc efekt uruchamia się dokładnie
  // wtedy, gdy jest co wypełniać — i nie trzeba pamiętać o dopisywaniu `wymiar`
  // do zależności trzech osobnych efektów.
  useEffect(() => {
    if (!host || host.childElementCount > 0) return;
    host.innerHTML = schemaMarkup;
  }, [host]);

  /**
   * STRUMIEŃ — animacja przepływu. JEDNA pętla `requestAnimationFrame` na cały
   * schemat, budowana po wstrzyknięciu rysunku i zatrzymywana przy odejściu
   * z widoku.
   *
   * Wyłączenie animacji w opcjach NIE UKRYWA warstwy stylem, tylko w ogóle jej
   * nie tworzy: ukryta warstwa dalej kosztowałaby pętlę i kilkanaście zapisów
   * atrybutu na klatkę, a ten przełącznik istnieje właśnie dla słabszego
   * sprzętu.
   *
   * Uchwyt trzymamy w referencji, żeby dało się odczytać liczbę klatek
   * z konsoli — pomiar wydajności bez dokładania czegokolwiek do interfejsu:
   *   document.querySelector('.canvas__stage').__fps?.()
   * (patrz efekt niżej, który podwiesza tę funkcję na kontenerze).
   */
  const strumienRef = useRef<Strumien | null>(null);
  useEffect(() => {
    if (!host || !settings.animacjePrzeplywu) return;
    const strumien = wlaczStrumien(host);
    strumienRef.current = strumien;
    // Zejście do konsoli — jedyny sposób zmierzenia fps bez wpychania licznika
    // na ekran badawczy, na którym każdy dodatkowy napis zabiera uwagę.
    (host as unknown as { __fps?: () => number | null }).__fps = () => strumien?.fps() ?? null;
    return () => {
      strumien?.zatrzymaj();
      strumienRef.current = null;
      delete (host as unknown as { __fps?: () => number | null }).__fps;
    };
  }, [host, settings.animacjePrzeplywu]);

  /* --- Stan zbiornika: średnia, rozrzut, naładowanie -----------------------
   *
   * Liczone PRZED efektem rysującym, a nie pod koniec komponentu, i to nie
   * kwestia porządku: od kiedy pasek naładowania stoi na samym schemacie,
   * `soc` wchodzi do zależności tego efektu. Tablica zależności powstaje
   * w trakcie renderowania, więc stała niżej dawałaby `ReferenceError`
   * z martwej strefy `const`. */

  const pcmPoints = points.filter((p) => p.group === 'pcm' && p.geometry);
  const selectedPoint = selected ? (pointMap.get(selected) ?? null) : null;

  // Średnia z sond magazynu — jedna liczba opisująca stan zbiornika,
  // zaznaczana markerem na belce. Definicja siedzi w `naladowanie.ts`,
  // bo tę samą liczbę pokazuje pinezka na mapie.
  const averageC = sredniaZSond(points, values);

  // Skrajne odczyty. Gdy sondy się rozjeżdżają, sama średnia to ukrywa —
  // belka pokazuje wtedy dodatkowo pas od najzimniejszej do najcieplejszej.
  const odczytyPcm = pcmPoints
    .map((p) => values[p.id]?.v)
    .filter((v): v is number => typeof v === 'number');
  const zakresC =
    odczytyPcm.length > 1
      ? { min: Math.min(...odczytyPcm), max: Math.max(...odczytyPcm) }
      : null;

  // TEN SZEW WŁAŚNIE ZADZIAŁAŁ. Naładowanie bierze się z BILANSU ENERGII
  // liczonego na serwerze (health.soc, patrz server/src/soc-bilans.ts) —
  // kotwica z temperatury poza pasmem przemiany plus całka mocy. Szacunek
  // z temperatury zostaje wyłącznie jako tryb awaryjny: bez historii, bez
  // kotwicy albo z dziurami w danych serwer sam wraca do temperatury
  // i mówi to w polu `zrodlo`.
  //
  // Powód zmiany (2026-08-05): po nocy ładowania bilans dawał ~90 %
  // naładowania, a termometr 60 % — w plateau temperatura stoi, więc
  // interpolacja po niej zaniża dokładnie wtedy, gdy magazyn pracuje.
  const socSerwera = health?.soc ?? null;
  const soc: OdczytSoc | null =
    socSerwera && socSerwera.soc !== null
      ? { soc: socSerwera.soc, entalpiaKJkg: null, zrodlo: socSerwera.zrodlo }
      : profile && averageC !== null
        ? socZTemperatury(
            averageC,
            {
              tMin: profile.scaleMin,
              tMax: profile.scaleMax,
              solidus: KONFIGURACJA[profile.id].solidus,
              liquidus: KONFIGURACJA[profile.id].liquidus,
              // Z PROFILU, nie z configu belki — patrz komentarz
              // w `belka/konfiguracja.ts`: dwa zapisy tej samej wielkości
              // dawały dwa różne procenty naładowania na jednym ekranie.
              cieploPrzemiany: profile.latentHeat,
              cp: profile.cp,
            },
            KONFIGURACJA[profile.id].kierunek,
          )
        : null;

  // --- Aktualizacja rysunku przy każdej zmianie danych ---------------------
  useEffect(() => {
    if (!host || !profile || host.childElementCount === 0) return;

    bindSchema(host, {
      points: pointMap,
      values,
      profile,
      staleAfterMs,
      now,
      flowFullSpeed: materials?.flowFullSpeed ?? 0.8,
      channelAlive,
      przeplywDemo: demo ? PRZEPLYW_DEMO_M3H : null,
      // Pasek pod zbiornikiem bierze TEN SAM odczyt co belka nad schematem.
      // Dwie liczby naładowania na jednym ekranie unieważniałyby obie.
      naladowanie: soc?.soc ?? null,
      // Energia z bilansu serwera; awaryjnie z procentu i pojemności configu
      // belki — tak samo liczy ją linia „Energia: x / y kWh" po rozwinięciu.
      energiaKWh:
        socSerwera?.energiaKWh ??
        (soc?.soc != null && profile ? energiaKWh(soc.soc, KONFIGURACJA[profile.id].pojemnoscKWh) : null),
      pojemnoscKWh:
        socSerwera?.pojemnoscKWh ??
        (profile ? KONFIGURACJA[profile.id].pojemnoscKWh : null),
    });
  }, [host, pointMap, values, profile, staleAfterMs, now, materials, channelAlive, demo, soc?.soc, socSerwera]);

  // --- Najechanie i klikanie sond na schemacie ------------------------------
  useEffect(() => {
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
  }, [host]);

  // Kierunek zmiany do chipu stanu.
  //
  // Pierwszeństwo ma znak mocy z ciepłomierza, bo to pomiar, a nie wnioskowanie.
  // Moc dokładnie 0 kW znaczy „nic nie płynie" — wtedy świadomie NIE pokazujemy
  // strzałki, choćby średnia właśnie drgnęła o dziesiątą stopnia. Dopiero gdy
  // ciepłomierz milczy, sięgamy po trend temperatury.
  const mocKW = values.METER_POWER?.v ?? null;
  const poprzedniaSredniaRef = useRef<number | null>(null);
  const [trend, setTrend] = useState<'ladowanie' | 'rozladowanie' | null>(null);

  // Trend liczony w efekcie, nie podczas renderowania. React w trybie ścisłym
  // renderuje dwa razy, więc porównywanie z poprzednią wartością wewnątrz
  // renderu zjadałoby co drugą zmianę i pokazywało strzałkę w losowych chwilach.
  //
  // Progu 0,05 K nie da się obniżyć: sondy DS18B20 mają rozdzielczość 0,0625 K,
  // więc mniejsze „zmiany" to szum ostatniego bitu, nie ruch temperatury.
  useEffect(() => {
    if (averageC === null) return;
    const poprzednia = poprzedniaSredniaRef.current;
    if (poprzednia === null) {
      poprzedniaSredniaRef.current = averageC;
      return;
    }
    if (Math.abs(averageC - poprzednia) >= 0.05) {
      setTrend(averageC > poprzednia ? 'ladowanie' : 'rozladowanie');
      poprzedniaSredniaRef.current = averageC;
    }
  }, [averageC]);

  const kierunekZmiany =
    mocKW === null ? trend : mocKW === 0 ? null : mocKW > 0 ? 'ladowanie' : 'rozladowanie';

  return (
    <div className="stack magazyn-widok">
      {/* Belka stanu naładowania — centralnie pod menu, rozwijana. */}
      <PasekPrzemiany
        profile={profile}
        materials={materials}
        fromSession={session?.material ?? null}
        detected={detectedBank}
        preview={settings.parafinaPodgladu}
        /* Dopóki serwer nie podał stanu, NIE WIEMY, jaka parafina jest
           w zbiorniku — a belka pokazywała wtedy materiał podglądu (57HC)
           z odblokowanym przełącznikiem. Na stanowisku, gdzie zbiornik jest
           rozpoznawany automatycznie, wyglądało to jak zła wartość do
           poprawienia ręcznie. */
        nierozpoznany={!session && !detectedBank && !health}
        onPreviewChange={(material) => setSetting('parafinaPodgladu', material)}
        volumesL={materials?.volumesL}
        averageC={averageC}
        zakresC={zakresC}
        soc={soc}
        bilans={socSerwera}
        kierunekZmiany={kierunekZmiany}
      />

      {wymiar === '3d' ? (
        scena3d
      ) : (
        <>
      {/* ------------------------- Schemat ------------------------- */}
      {/* Wylaczenie animacji w opcjach zatrzymuje ruch kreski na rurach —
          niezaleznie od tego zerowy przeplyw i tak nigdy sie nie animuje. */}
      <section className={`canvas${settings.animacjePrzeplywu ? '' : ' no-flow-anim'}`}>
        {/* Pogoda dla stanowiska — lewy górny róg rysunku. */}
        <Pogoda />

        {/* Tryb pokazowy przepływu — lewy dolny róg, nad zegarem na pasku
            stanu. Gdy włączony, mówi o sobie wprost: rury animują się nie
            dlatego, że coś płynie, tylko dlatego, że tak ustawiliśmy. */}
        <div className="demo-przeplyw">
          <button
            type="button"
            className={`demo-przeplyw__przycisk${demo ? ' is-on' : ''}`}
            onClick={() => setDemo((v) => !v)}
            aria-pressed={demo}
            title={
              demo
                ? 'Wyłącz pokaz — wróć do prawdziwego przepływu z ciepłomierza'
                : 'Pokaż, jak wygląda działający obieg. Ciepłomierz mierzy teraz 0,000 m³/h, więc rury stoją.'
            }
          >
            <span className="demo-przeplyw__dioda" aria-hidden="true" />
            demo przepływu
            <span className="demo-przeplyw__stan mono">{demo ? 'on' : 'off'}</span>
          </button>
          {demo ? (
            <p className="demo-przeplyw__uwaga">
              Przepływ udawany ({PRZEPLYW_DEMO_M3H.toFixed(1).replace('.', ',')} m³/h). Temperatury
              są prawdziwe.
            </p>
          ) : null}
        </div>

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
            onClick={() => setZoom(ZOOM_STARTOWY)}
            aria-label="Dopasuj do okna"
          >
            ⤢
          </button>

          {/* Przełącznik rzutu POD narzędziami rysunku: wszystko, co
              przestawia sam rysunek, stoi w jednej kolumnie. */}
          <PrzelacznikRzutu wymiar={wymiar} onWymiar={onWymiar} />
        </div>

        <div className="canvas__scroll">
          {/* Powiększenie skaluje rysunek, a NIE zmienia jego szerokości.
              Szerokość procentowa kłóciłaby się z dopasowaniem do wysokości
              ekranu: rysunek ma się mieścić w polu w całości, a dopiero
              powiększony wychodzić poza nie i dawać się przesuwać. */}
          <div
            className="canvas__stage"
            style={{ transform: `scale(${zoom})` }}
            ref={setHost}
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
        </>
      )}
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

