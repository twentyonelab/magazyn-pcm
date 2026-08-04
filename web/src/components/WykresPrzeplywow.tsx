/**
 * PRZEGLĄD PRZEPŁYWÓW — obydwa obiegi z tego samego zakresu czasu.
 *
 * Karta bliźniacza dla `WykresMagazynu` i stojąca zaraz pod nią: ta sama
 * szerokość płótna, te same marginesy, ten sam przełącznik zakresu, te same
 * chipy do gaszenia serii (patrz `wykres/os.ts`). Temperatura mówi, CO JEST
 * w zbiorniku; przepływ mówi, CZY W TEJ CHWILI COŚ SIĘ DZIEJE — i te dwa
 * pytania zadaje się jedno po drugim, patrząc na tę samą godzinę.
 *
 * DLACZEGO OSOBNA KARTA, A NIE DRUGA OŚ NA WYKRESIE TEMPERATUR. Metry
 * sześcienne na godzinę i stopnie Celsjusza nie mają wspólnej skali. Cała
 * aplikacja pilnuje jednej osi na wykres (patrz nagłówek widoku Przebiegi:
 * wybór punktu o innej jednostce jest tam wprost zablokowany), bo dwie osie Y
 * pozwalają dowolnie ustawić, która krzywa wygląda na większą. Dwie karty
 * o wspólnej osi czasu dają to samo porównanie i nie kłamią o proporcjach.
 *
 * PRZEPŁYWOMIERZE DAJĄ SIĘ WYGASIĆ, ale nie da się zgasić obu: pusty wykres
 * nie niesie żadnej informacji, a patrzący nie wie, dlaczego wszystko znikło.
 *
 * ZERO JEST ZAWSZE W KADRZE. Przy przepływie ustawionym na 0,000 m³/h (a taki
 * jest na stanowisku przez większość doby) automatyczna skala rozciągnęłaby
 * szum ostatniej cyfry na całą wysokość karty i postój wyglądałby jak praca.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HistorySeries, PublicPoint } from '@magazyn-pcm/shared';
import { fetchHistory } from '../api.js';
import { SERIES_COLORS } from './Wykres.js';
import {
  GODZINA_MS,
  H_NISKI,
  M,
  PLOT_H_NISKI,
  PLOT_W,
  W,
  ZAKRES_DOMYSLNY_H,
  czas,
  etykietaZakresu,
  ticksY,
} from './wykres/os.js';
import { WyborZakresu } from './wykres/WyborZakresu.js';

/**
 * Przepływomierze instalacji — DWA, po jednym na obieg.
 *
 * `ODBIOR_FLOW` był do 2026-08-04 zadeklarowany i niedostępny, bo w Loxone
 * nie było kanału Modbus przepływu drugiego licznika. Dziś jest. Karta i tak
 * nie zakłada, że oba odpowiadają — punkt bez danych mówi o tym wprost,
 * zamiast rysować linię na zerze.
 */
const PRZEPLYWOMIERZE = [
  {
    id: 'METER_FLOW',
    etykieta: 'źródło',
    opis: 'Obieg źródła: pompa ciepła → bufor → magazyn',
    kolor: SERIES_COLORS[0]!,
  },
  {
    id: 'ODBIOR_FLOW',
    etykieta: 'odbiór',
    opis: 'Obieg odbioru: magazyn → podgrzewacz wody wodociągowej',
    kolor: SERIES_COLORS[4]!,
  },
] as const;

type IdPrzeplywu = (typeof PRZEPLYWOMIERZE)[number]['id'];

/**
 * FORMY PREZENTACJI — te same dwie co w karcie temperatur i z tego samego
 * powodu. „linie" przeskakuje przerwy w zapisie i pokazuje kształt doby;
 * „odczyty" rozspaja ścieżkę i pokazuje pojedyncze próbki, czyli ile w tym
 * kształcie jest pomiaru, a ile dopowiedzenia.
 *
 * Rozwarstwienia i mapy cieplnej tu nie ma: obie odpowiadają na pytania
 * o rozkład wewnątrz zbiornika, a przepływ jest jedną liczbą na obieg.
 */
type Forma = 'linie' | 'odczyty';

const FORMY: Array<{ id: Forma; etykieta: string; opis: string }> = [
  {
    id: 'linie',
    etykieta: 'linie',
    opis: 'Ciągły przebieg przepływu — do czytania kształtu: kiedy pompa wstała, jak długo pracowała, kiedy stanęła.',
  },
  {
    id: 'odczyty',
    etykieta: 'odczyty',
    opis: 'Pojedyncze próbki z widocznymi przerwami — pokazuje, co zostało zmierzone, a co dopowiada linia.',
  },
];

type Stan =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'ready'; serie: HistorySeries[]; odMs: number; doMs: number; rozdzielczosc: string };

interface Props {
  /** Rejestr punktów — z niego bierze się jednostka i dostępność licznika. */
  points: PublicPoint[];
}

export function WykresPrzeplywow({ points }: Props) {
  const [stan, setStan] = useState<Stan>({ kind: 'loading' });
  const [godzin, setGodzin] = useState(ZAKRES_DOMYSLNY_H);
  const [forma, setForma] = useState<Forma>('linie');
  const [ukryte, setUkryte] = useState<Set<string>>(new Set());
  const [hoverX, setHoverX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  /** Jednostka z rejestru, nie wpisana na stałe — licznik ją deklaruje. */
  const jednostka = byId.get('METER_FLOW')?.unit ?? 'm³/h';

  useEffect(() => {
    let porzucone = false;
    setStan({ kind: 'loading' });
    const doMs = Date.now();
    const odMs = doMs - godzin * GODZINA_MS;

    fetchHistory({
      ids: PRZEPLYWOMIERZE.map((p) => p.id),
      from: new Date(odMs).toISOString(),
      to: new Date(doMs).toISOString(),
      resolution: 'auto',
    })
      .then((odpowiedz) => {
        if (porzucone) return;
        if (!odpowiedz.available) {
          setStan({ kind: 'unavailable', message: odpowiedz.message });
          return;
        }
        setStan({
          kind: 'ready',
          serie: odpowiedz.series,
          odMs: Date.parse(odpowiedz.from),
          doMs: Date.parse(odpowiedz.to),
          rozdzielczosc: odpowiedz.resolution,
        });
      })
      .catch((blad: unknown) => {
        if (!porzucone) {
          setStan({ kind: 'error', message: blad instanceof Error ? blad.message : String(blad) });
        }
      });

    return () => {
      porzucone = true;
    };
  }, [godzin]);

  const przelacz = (id: IdPrzeplywu): void => {
    setUkryte((biezace) => {
      const nowe = new Set(biezace);
      if (nowe.has(id)) nowe.delete(id);
      // Ostatniej widocznej serii nie da się zgasić — patrz nagłówek.
      else if (nowe.size < PRZEPLYWOMIERZE.length - 1) nowe.add(id);
      return nowe;
    });
  };

  const gotowe = stan.kind === 'ready' ? stan : null;

  const serie = useMemo(() => {
    if (!gotowe) return [];
    const mapa = new Map(gotowe.serie.map((s) => [s.id, s]));
    return PRZEPLYWOMIERZE.filter((p) => !ukryte.has(p.id)).map((p) => ({
      id: p.id,
      kolor: p.kolor,
      opis: p.opis,
      etykieta: p.etykieta,
      punkty: (mapa.get(p.id)?.points ?? []).map((x) => ({ ms: Date.parse(x.ts), v: x.v })),
    }));
  }, [gotowe, ukryte]);

  const maProbki = serie.some((s) => s.punkty.some((p) => p.v !== null));

  /**
   * Zakres osi Y. Dół zawsze na zerze, góra z zapasem nad największym
   * odczytem — i z minimum 0,1 m³/h, żeby przy samych zerach oś nie zapadła
   * się do jednej wartości.
   */
  const yMax = useMemo(() => {
    const wartosci = serie
      .flatMap((s) => s.punkty.map((p) => p.v))
      .filter((v): v is number => v !== null);
    const max = wartosci.length > 0 ? Math.max(...wartosci) : 0;
    return Math.max(max * 1.15, 0.1);
  }, [serie]);
  const yMin = 0;

  const odMs = gotowe?.odMs ?? 0;
  const zakresMs = (gotowe?.doMs ?? 1) - odMs;
  const xOf = (ms: number): number => M.left + ((ms - odMs) / zakresMs) * PLOT_W;
  const yOf = (v: number): number =>
    M.top + PLOT_H_NISKI - ((v - yMin) / (yMax - yMin)) * PLOT_H_NISKI;

  /** Największy dopuszczalny odstęp próbek; wyżej rysujemy przerwę. */
  const limitDziury = useMemo(() => {
    const odstepy: number[] = [];
    for (const s of serie) {
      for (let i = 1; i < s.punkty.length; i += 1) {
        odstepy.push(s.punkty[i]!.ms - s.punkty[i - 1]!.ms);
      }
    }
    odstepy.sort((a, b) => a - b);
    return (odstepy[Math.floor(odstepy.length / 2)] ?? 60_000) * 2.5;
  }, [serie]);

  /**
   * Ścieżki. `ciagle` decyduje o losie przerwy w zapisie — dokładnie ta sama
   * zasada co w karcie temperatur.
   */
  const zbudujSciezki = (ciagle: boolean) =>
    serie.map((s) => {
      let d = '';
      let poprzedni: number | null = null;
      let pisze = false;
      for (const p of s.punkty) {
        if (p.v === null) {
          poprzedni = p.ms;
          if (!ciagle) pisze = false;
          continue;
        }
        if (!ciagle && poprzedni !== null && p.ms - poprzedni > limitDziury) pisze = false;
        d += `${pisze ? ' L' : ' M'}${xOf(p.ms).toFixed(1)} ${yOf(p.v).toFixed(1)}`;
        pisze = true;
        poprzedni = p.ms;
      }
      return { id: s.id, kolor: s.kolor, d: d.trim() };
    });

  const sciezkiCiagle = useMemo(
    () => zbudujSciezki(true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serie, yMax, odMs, zakresMs],
  );

  const sciezkiPrzerywane = useMemo(
    () => zbudujSciezki(false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serie, limitDziury, yMax, odMs, zakresMs],
  );

  /** Znaczniki próbek — przerzedzane, żeby zostały kropkami, a nie paskiem. */
  const znaczniki = useMemo(() => {
    const ILE_MAKS = 220;
    return serie.map((s) => {
      const istotne = s.punkty.filter((p) => p.v !== null);
      const skok = Math.max(1, Math.ceil(istotne.length / ILE_MAKS));
      return {
        id: s.id,
        kolor: s.kolor,
        punkty: istotne
          .filter((_, i) => i % skok === 0)
          .map((p) => ({ x: xOf(p.ms), y: yOf(p.v as number) })),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, yMax, odMs, zakresMs]);

  const podpowiedz = useMemo(() => {
    if (hoverX === null || !gotowe) return null;
    const ms = odMs + ((hoverX - M.left) / PLOT_W) * zakresMs;

    const wiersze: Array<{ id: string; kolor: string; etykieta: string; ms: number; v: number | null }> =
      [];
    for (const s of serie) {
      let najblizsza: { ms: number; v: number | null } | null = null;
      for (const p of s.punkty) {
        if (!najblizsza || Math.abs(p.ms - ms) < Math.abs(najblizsza.ms - ms)) najblizsza = p;
      }
      if (najblizsza && Math.abs(najblizsza.ms - ms) <= limitDziury) {
        wiersze.push({
          id: s.id,
          kolor: s.kolor,
          etykieta: s.etykieta,
          ms: najblizsza.ms,
          v: najblizsza.v,
        });
      }
    }

    return wiersze.length > 0 ? { ms: wiersze[0]!.ms, wiersze } : null;
  }, [hoverX, serie, gotowe, odMs, zakresMs, limitDziury]);

  const ruch = (e: React.MouseEvent<SVGSVGElement>): void => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * W;
    setHoverX(x >= M.left && x <= M.left + PLOT_W ? x : null);
  };

  const tickiX = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i <= 8; i += 1) out.push(odMs + (zakresMs * i) / 8);
    return out;
  }, [odMs, zakresMs]);

  const tickiY = useMemo(() => ticksY(yMin, yMax), [yMax]);

  /** Liczniki bez ani jednej próbki — mówimy o nich wprost, nie po cichu. */
  const milczace = useMemo(() => {
    if (!gotowe) return [];
    const mapa = new Map(gotowe.serie.map((s) => [s.id, s]));
    return PRZEPLYWOMIERZE.filter((p) => {
      if (ukryte.has(p.id)) return false;
      const seria = mapa.get(p.id);
      return !seria || seria.points.every((x) => x.v === null);
    });
  }, [gotowe, ukryte]);

  return (
    <section className="card card--szeroka">
      <div className="card__head">
        <h2 className="card__title">przepływy · {etykietaZakresu(godzin)}</h2>
        <p className="card__meta">
          {gotowe
            ? `dwa obiegi · rozdzielczość ${gotowe.rozdzielczosc}`
            : 'przepływomierze źródła i odbioru'}
        </p>
      </div>

      {/* Sterowanie w tym samym układzie co w karcie temperatur: zakres, forma,
          włączanie serii. Powtórzenie jest zamierzone — dwie karty jedna pod
          drugą, obsługiwane inaczej, wymagałyby uczenia się dwóch rzeczy. */}
      <div className="przeglad__sterowanie">
        <WyborZakresu godzin={godzin} onGodzin={setGodzin} idSufiks="przeplywy" />

        <div className="segment" role="group" aria-label="Forma wykresu przepływów">
          {FORMY.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`segment__item${forma === f.id ? ' is-active' : ''}`}
              onClick={() => setForma(f.id)}
              title={f.opis}
            >
              {f.etykieta}
            </button>
          ))}
        </div>

        {/* PRZEŁĄCZNIKI PRZEPŁYWOMIERZY — pokazać albo nie pokazywać danego
            obiegu. Stoją tam, gdzie w karcie wyżej stoją chipy sond, i działają
            tak samo. */}
        <div className="przeglad__sondy">
          {PRZEPLYWOMIERZE.map((p) => {
            const wlaczony = !ukryte.has(p.id);
            const punkt = byId.get(p.id);
            const podlaczony = punkt?.available ?? false;
            return (
              <button
                key={p.id}
                type="button"
                className={`chip chip--seria${wlaczony ? ' is-active' : ''}`}
                onClick={() => przelacz(p.id)}
                aria-pressed={wlaczony}
                title={
                  podlaczony
                    ? `${p.opis} — kliknij, żeby ${wlaczony ? 'ukryć' : 'pokazać'}`
                    : `${p.opis} · przepływomierz nie jest podłączony do Miniservera`
                }
              >
                <span
                  className="chart__swatch"
                  style={{ background: wlaczony ? p.kolor : 'transparent', borderColor: p.kolor }}
                />
                {p.etykieta}
                {podlaczony ? null : <span className="chip__unit">brak</span>}
              </button>
            );
          })}
        </div>
      </div>

      <p className="przeglad__opis">{FORMY.find((f) => f.id === forma)!.opis}</p>

      {stan.kind === 'loading' ? <div className="note">Pobieram przepływy…</div> : null}
      {stan.kind === 'error' ? <div className="note is-bad">{stan.message}</div> : null}
      {stan.kind === 'unavailable' ? (
        <div className="note">
          <strong>Odczyt historii jest niedostępny.</strong> {stan.message}
        </div>
      ) : null}

      {gotowe && !maProbki ? (
        <div className="note">
          W tym zakresie nie ma ani jednego odczytu przepływu. Historia zapisuje się tylko wtedy, gdy
          serwer działa — zajrzyj do widoku Diagnostyka.
        </div>
      ) : null}

      {gotowe && maProbki ? (
        <div className="chart chart--pelna">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H_NISKI}`}
            className="chart__svg"
            onMouseMove={ruch}
            onMouseLeave={() => setHoverX(null)}
            role="img"
            aria-label={`Przepływy obiegów, zakres: ${etykietaZakresu(godzin)}, forma: ${forma}`}
          >
            {tickiY.map((t) => (
              <g key={t}>
                <line
                  x1={M.left}
                  x2={M.left + PLOT_W}
                  y1={yOf(t)}
                  y2={yOf(t)}
                  className="chart__grid"
                />
                <text x={M.left - 10} y={yOf(t) + 4} className="chart__tick chart__tick--y">
                  {t}
                </text>
              </g>
            ))}

            {/* Jednostka podpisana raz, przy górnym końcu osi — inaczej trzeba
                by ją powtarzać przy każdej wartości podziałki. */}
            <text x={M.left - 10} y={M.top - 10} className="chart__tick chart__tick--y">
              {jednostka}
            </text>

            {tickiX.map((t) => (
              <text key={t} x={xOf(t)} y={H_NISKI - 12} className="chart__tick chart__tick--x">
                {czas(t, zakresMs)}
              </text>
            ))}

            {forma === 'linie'
              ? sciezkiCiagle.map((s) =>
                  s.d ? (
                    <path
                      key={s.id}
                      d={s.d}
                      fill="none"
                      stroke={s.kolor}
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                  ) : null,
                )
              : null}

            {forma === 'odczyty' ? (
              <g>
                {sciezkiPrzerywane.map((s) =>
                  s.d ? (
                    <path
                      key={s.id}
                      d={s.d}
                      fill="none"
                      stroke={s.kolor}
                      strokeWidth={1}
                      strokeOpacity={0.45}
                      strokeLinejoin="round"
                    />
                  ) : null,
                )}
                {znaczniki.map((s) => (
                  <g key={`pkt-${s.id}`} fill={s.kolor}>
                    {s.punkty.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={1.9} />
                    ))}
                  </g>
                ))}
              </g>
            ) : null}

            {podpowiedz ? (
              <g>
                <line
                  x1={xOf(podpowiedz.ms)}
                  x2={xOf(podpowiedz.ms)}
                  y1={M.top}
                  y2={M.top + PLOT_H_NISKI}
                  className="chart__crosshair"
                />
                {podpowiedz.wiersze.map((w) =>
                  w.v !== null ? (
                    <circle key={w.id} cx={xOf(w.ms)} cy={yOf(w.v)} r={4} fill={w.kolor} />
                  ) : null,
                )}
              </g>
            ) : null}
          </svg>

          {podpowiedz ? (
            <div
              className="chart__tooltip"
              style={{ left: `${(xOf(podpowiedz.ms) / W) * 100}%` }}
              role="status"
            >
              <p className="chart__tooltip-time">{czas(podpowiedz.ms, zakresMs)}</p>
              {podpowiedz.wiersze.map((w) => (
                <p key={w.id} className="chart__tooltip-row">
                  <span className="chart__swatch" style={{ background: w.kolor }} />
                  <span className="chart__tooltip-id">{w.etykieta}</span>
                  <span className="mono">
                    {w.v === null ? '—' : `${w.v.toFixed(3)} ${jednostka}`}
                  </span>
                </p>
              ))}
            </div>
          ) : null}

          {milczace.length > 0 ? (
            <p className="przeglad__wniosek">
              {milczace.map((p) => p.etykieta).join(' i ')}
              {milczace.length > 1 ? ' nie mają ' : ' nie ma '}w tym zakresie ani jednego odczytu.
              Linia na zerze byłaby tu domysłem — brak pomiaru nie znaczy, że przepływ wynosił zero.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
