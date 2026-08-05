/**
 * Widok Przebiegi — odczyt historii pomiarow.
 *
 * Sciezka jest kompletna: wybor punktow, zakres czasu, rozdzielczosc,
 * pobranie, wykres, tabela wartosci i eksport CSV. Gdy serwer zapisuje
 * historie do pliku tekstowego zamiast bazy, odpowiada kontraktem
 * `available: false` — i ten stan tez jest tu obsluzony czytelnie.
 *
 * JEDNA OS: wykres pokazuje serie w JEDNYCH jednostkach. Wybor punktu
 * o innej jednostce niz juz zaznaczone jest zablokowany — dwie osie Y
 * na jednym wykresie to klamstwo wizualne, ktorego ten interfejs nie
 * dopuszcza. Dwa przebiegi w roznych jednostkach = dwa pobrania.
 */

import { useEffect, useMemo, useState } from 'react';
import type { HistoryAvailable, PublicPoint, SessionEvent } from '@magazyn-pcm/shared';
import { fetchHistory, fetchSessions, historyCsvUrl, type HistoryParams } from '../api.js';
import { SERIES_COLORS, Wykres, type ChartSeries } from '../components/Wykres.js';
import { WykresMagazynu } from '../components/WykresMagazynu.js';
import { WykresPrzeplywow } from '../components/WykresPrzeplywow.js';
import { AkcjeWykresu } from '../components/AkcjeWykresu.js';
import type { LiveData } from '../useLiveData.js';
import { GROUP_LABEL, NO_DATA } from '../format.js';
import { useSettings } from '../settings.js';

/** Gotowe zakresy — badacz najczesciej patrzy wstecz od teraz. */
const PRESETS: Array<{ label: string; hours: number }> = [
  { label: 'ostatnia godzina', hours: 1 },
  { label: '6 godzin', hours: 6 },
  { label: '24 godziny', hours: 24 },
  { label: '7 dni', hours: 168 },
];

const RESOLUTIONS: Array<{ value: string; label: string }> = [
  { value: 'auto', label: 'automatyczna' },
  { value: 'raw', label: 'surowe próbki' },
  { value: '30s', label: '30 s' },
  { value: '1m', label: '1 min' },
  { value: '5m', label: '5 min' },
  { value: '15m', label: '15 min' },
  { value: '1h', label: '1 h' },
];

/** Maks. liczba serii = dlugosc walidowanej palety. */
const MAX_SERIES = SERIES_COLORS.length;

function toLocalInput(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: HistoryAvailable; params: HistoryParams };

interface PrzebiegiProps {
  data: LiveData;
  /**
   * Punkty zaznaczone przy wejsciu — ustawiane, gdy widok otwarto
   * klikniecien sondy na schemacie. Pusta lista = domyslne szesc sond.
   */
  initialIds?: string[];
}

export function Przebiegi({ data, initialIds }: PrzebiegiProps) {
  const settings = useSettings();
  const [selected, setSelected] = useState<string[]>(
    initialIds && initialIds.length > 0 ? initialIds : ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'],
  );
  const [from, setFrom] = useState(() => toLocalInput(new Date(Date.now() - 3600_000)));
  const [to, setTo] = useState(() => toLocalInput(new Date()));
  const [resolution, setResolution] = useState('auto');
  const [state, setState] = useState<FetchState>({ kind: 'idle' });
  const [events, setEvents] = useState<SessionEvent[]>([]);

  const byId = useMemo(() => new Map(data.points.map((p) => [p.id, p])), [data.points]);

  // Jednostka pierwszego zaznaczonego punktu wyznacza os — patrz naglowek.
  const activeUnit = selected.length > 0 ? (byId.get(selected[0]!)?.unit ?? null) : null;

  const grouped = useMemo(() => {
    const groups = new Map<string, PublicPoint[]>();
    for (const point of data.points) {
      const bucket = groups.get(point.group);
      if (bucket) bucket.push(point);
      else groups.set(point.group, [point]);
    }
    return [...groups.entries()];
  }, [data.points]);

  const toggle = (id: string): void => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length >= MAX_SERIES
          ? current
          : [...current, id],
    );
  };

  const applyPreset = (hours: number): void => {
    setFrom(toLocalInput(new Date(Date.now() - hours * 3600_000)));
    setTo(toLocalInput(new Date()));
  };

  const params: HistoryParams | null = useMemo(() => {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs || selected.length === 0) {
      return null;
    }
    return {
      ids: selected,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      resolution,
    };
  }, [from, to, selected, resolution]);

  const load = async (): Promise<void> => {
    if (!params) return;
    setState({ kind: 'loading' });
    try {
      const response = await fetchHistory(params);
      if (!response.available) {
        setState({ kind: 'unavailable', message: response.message });
        return;
      }
      setState({ kind: 'ready', data: response, params });
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  // Znaczniki zdarzen sesji — nakladane na wykres, o ile wlaczone w opcjach.
  useEffect(() => {
    if (!settings.zdarzeniaNaWykresie) {
      setEvents([]);
      return;
    }
    fetchSessions()
      .then((sessions) => setEvents(sessions.flatMap((s) => s.events)))
      .catch(() => setEvents([]));
  }, [settings.zdarzeniaNaWykresie, state.kind]);

  const chart = useMemo(() => {
    if (state.kind !== 'ready') return null;

    const series: ChartSeries[] = state.data.series.map((entry, index) => {
      const point = byId.get(entry.id);
      return {
        id: entry.id,
        label: point?.label ?? entry.id,
        // Kolor po pozycji ZAZNACZENIA, stały dla calego pobrania.
        color: SERIES_COLORS[index % SERIES_COLORS.length]!,
        unit: point?.unit ?? '',
        precision: point?.precision ?? 1,
        points: entry.points,
      };
    });

    const anyTemperature = series.some((s) => s.unit === '°C');
    const profile = data.materials
      ? data.materials.profiles[data.session?.material ?? data.materials.defaultMaterial]
      : null;

    return {
      series,
      band:
        anyTemperature && profile
          ? {
              min: profile.phaseBandMin,
              max: profile.phaseBandMax,
              label: `przemiana ${profile.phaseBandMin}–${profile.phaseBandMax} °C`,
            }
          : null,
      fromMs: Date.parse(state.data.from),
      toMs: Date.parse(state.data.to),
    };
  }, [state, byId, data.materials, data.session]);

  /** Statystyki serii — tabela wartosci pod wykresem. */
  const stats = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return state.data.series.map((entry, index) => {
      const values = entry.points.map((p) => p.v).filter((v): v is number => v !== null);
      const point = byId.get(entry.id);
      const precision = point?.precision ?? 1;
      const fmt = (v: number): string => `${v.toFixed(precision)} ${point?.unit ?? ''}`.trim();
      return {
        id: entry.id,
        color: SERIES_COLORS[index % SERIES_COLORS.length]!,
        label: point?.label ?? entry.id,
        count: entry.points.length,
        min: values.length ? fmt(Math.min(...values)) : NO_DATA,
        max: values.length ? fmt(Math.max(...values)) : NO_DATA,
        avg: values.length ? fmt(values.reduce((a, b) => a + b, 0) / values.length) : NO_DATA,
      };
    });
  }, [state, byId]);

  // Profil materialu biezacej sesji — z niego biora sie granice przemiany.
  const profil = data.materials
    ? data.materials.profiles[data.session?.material ?? data.materials.defaultMaterial]
    : null;

  return (
    <div className="stack">
      {/*
        Przeglad doby stoi PRZED formularzem: odpowiada na pytanie zadawane
        najczesciej („co sie dzialo od wczoraj") i nie wymaga zadnego wyboru.
        Formularz nizej sluzy juz do pracy z konkretnym zakresem.
      */}
      <WykresMagazynu profil={profil} />

      {/*
        Przepływy ZARAZ POD temperaturami, w tej samej formie i na tej samej
        osi czasu. Temperatura mówi, co jest w zbiorniku; przepływ mówi, czy
        w tej chwili coś się dzieje — i jedno bez drugiego nie odpowiada na
        pytanie „dlaczego wykres stoi". Osobna karta, a nie druga oś Y:
        metry sześcienne na godzinę i stopnie nie mają wspólnej skali.
      */}
      <WykresPrzeplywow points={data.points} />

      {/* ------------------------- Formularz ------------------------- */}
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">wybór danych</h2>
          <p className="card__meta">
            {selected.length}/{MAX_SERIES} punktów · jedna jednostka na wykres
          </p>
        </div>

        <div className="picker">
          {grouped.map(([group, points]) => (
            <div key={group} className="picker__group">
              <p className="picker__label">{GROUP_LABEL[group] ?? group}</p>
              <div className="picker__chips">
                {points.map((point) => {
                  const active = selected.includes(point.id);
                  const unitBlocked = activeUnit !== null && point.unit !== activeUnit && !active;
                  const full = !active && selected.length >= MAX_SERIES;
                  return (
                    <button
                      key={point.id}
                      type="button"
                      className={`chip${active ? ' is-active' : ''}`}
                      disabled={unitBlocked || full}
                      title={
                        unitBlocked
                          ? `Inna jednostka (${point.unit || 'brak'}) — wykres ma jedną oś`
                          : full
                            ? `Maksymalnie ${MAX_SERIES} serii na wykresie`
                            : point.label
                      }
                      onClick={() => toggle(point.id)}
                    >
                      {point.id}
                      <span className="chip__unit">{point.unit || '—'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="rangebar">
          <div className="rangebar__presets">
            {PRESETS.map((preset) => (
              <button
                key={preset.hours}
                type="button"
                className="chip"
                onClick={() => applyPreset(preset.hours)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <label className="field">
            <span>od</span>
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>do</span>
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="field">
            <span>rozdzielczość</span>
            <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
              {RESOLUTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="button-primary"
            disabled={!params || state.kind === 'loading'}
            onClick={() => void load()}
          >
            {state.kind === 'loading' ? 'Pobieram…' : 'Pobierz dane historyczne'}
          </button>
        </div>

        {/*
          EKSPORT WSZYSTKIEGO — obok wykresu, nie zamiast niego.

          Wykres ma dwa świadome ograniczenia: jedną jednostkę na oś (dwie osie
          Y to kłamstwo wizualne) i osiem serii (tyle barw ma walidowana
          paleta). Oba dotyczą CZYTANIA, nie danych — a eksport do analizy był
          nimi ograniczony przypadkiem: nie dało się z aplikacji wyjąć
          kompletu pomiarów jednym ruchem (zgłoszone 2026-08-05, gdy do
          policzenia energii zabrakło w CSV przepływu i drugiej temperatury).

          Ten odnośnik bierze WSZYSTKIE punkty rejestru w zakresie z formularza,
          surowymi próbkami — niezależnie od tego, co jest zaznaczone wyżej.
        */}
        {params ? (
          <p className="przebiegi__eksport">
            <a
              className="link"
              href={historyCsvUrl({ ...params, ids: data.points.map((p) => p.id), resolution: 'raw' })}
              download
              title="Surowe próbki wszystkich punktów w wybranym zakresie — do analizy poza aplikacją"
            >
              pobierz CSV wszystkich punktów ({data.points.length}) w tym zakresie
            </a>
          </p>
        ) : null}
      </section>

      {/* ------------------------- Wynik ------------------------- */}
      {/* Stan „nic jeszcze nie pobrano" nie ma tu żadnego napisu — usunięte
          2026-08-04. Formularz wyżej sam mówi, co zrobić, a dwa wykresy nad nim
          są już wypełnione danymi, więc pusty ekran i tak nie występuje. */}

      {state.kind === 'unavailable' ? (
        <div className="note">
          <strong>Odczyt historii jest niedostępny.</strong> {state.message}
        </div>
      ) : null}

      {state.kind === 'error' ? <div className="note is-bad">{state.message}</div> : null}

      {state.kind === 'ready' && chart ? (
        <section className="card">
          <div className="card__head">
            <h2 className="card__title">przebieg</h2>
            <p className="card__meta">rozdzielczość {state.data.resolution}</p>
          </div>

          {chart.series.every((s) => s.points.length === 0) ? (
            <div className="note">
              W tym zakresie nie ma żadnych pomiarów. Serwer zbiera dane tylko wtedy, gdy działa —
              sprawdź zakres albo widok Diagnostyka.
            </div>
          ) : (
            <>
              <Wykres
                series={chart.series}
                band={chart.band}
                events={settings.zdarzeniaNaWykresie ? events : []}
                fromMs={chart.fromMs}
                toMs={chart.toMs}
              />

              {/* Pobieranie stoi POD wykresem, nie w nagłówku karty: dotyczy
                  tego, co właśnie widać, a nie całego widoku. */}
              <AkcjeWykresu
                params={state.params}
                nazwa={`przebiegi-${state.params.ids.join('-')}`}
                wariant="link"
              />

              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>punkt</th>
                      <th>opis</th>
                      <th className="num">próbek</th>
                      <th className="num">min</th>
                      <th className="num">średnia</th>
                      <th className="num">max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((row) => (
                      <tr key={row.id}>
                        <td className="mono">
                          <span className="chart__swatch" style={{ background: row.color }} /> {row.id}
                        </td>
                        <td className="muted">{row.label}</td>
                        <td className="num mono">{row.count}</td>
                        <td className="num mono">{row.min}</td>
                        <td className="num mono">{row.avg}</td>
                        <td className="num mono">{row.max}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
