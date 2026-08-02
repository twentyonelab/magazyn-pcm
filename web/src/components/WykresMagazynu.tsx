/**
 * PRZEGLĄD DOBY — wszystkie sondy magazynu z ostatnich 24 godzin.
 *
 * Wykres pod spodem (komponent `Wykres`) jest narzędziem analitycznym: sam
 * wybierasz punkty, zakres i rozdzielczość. Ten jest czymś innym — stałym
 * obrazem stanu zbiornika, który ma odpowiadać na pytanie „co się działo od
 * wczoraj" bez ani jednego kliknięcia. Dlatego pobiera się sam przy wejściu
 * i ma na sztywno dobę oraz komplet sześciu sond.
 *
 * TRZY FORMY, BO KAŻDA ODPOWIADA NA INNE PYTANIE:
 *
 *   linie          Co robiła każda sonda z osobna. Forma domyślna, najbliższa
 *                  surowym danym — z niej odczytasz konkretną wartość.
 *
 *   rozwarstwienie Jak bardzo zbiornik jest niejednorodny. Zamiast sześciu
 *                  krzywych rysuje pasmo od najzimniejszej do najcieplejszej
 *                  sondy i średnią w środku. Wąskie pasmo = zbiornik wymieszany,
 *                  szerokie = warstwy. Przy sześciu liniach ta informacja ginie
 *                  w plątaninie, a jest kluczowa dla oceny ładowania.
 *
 *   mapa cieplna   Gdzie w zbiorniku jest front przemiany i jak wędruje.
 *                  Wiersz = sonda (od góry zbiornika w dół), oś pozioma = czas,
 *                  barwa = temperatura. Materiał w przemianie dostaje WŁASNĄ
 *                  rodzinę barw, więc pasmo przemiany widać jako spójny obszar
 *                  przesuwający się przez zbiornik — tego nie da się zobaczyć
 *                  na liniach.
 *
 * PRÓG PRZEMIANY jest zaznaczony we wszystkich trzech formach, bo to jedyna
 * wielkość na tym wykresie, która ma sens fizyczny niezależny od odczytu.
 * Granice biorą się z profilu materiału (`/api/materials`), nigdy z kodu.
 *
 * ZAKRES CZASU przełącza się na miejscu, od godziny do miesiąca. Doba została
 * wartością startową, bo to na nią patrzy się najczęściej, ale zamrożenie jej
 * na sztywno zmuszało do schodzenia do formularza niżej za każdym razem, gdy
 * ktoś chciał tylko zerknąć bliżej albo dalej.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HistorySeries, MaterialProfile } from '@magazyn-pcm/shared';
import { fetchHistory } from '../api.js';
import { SERIES_COLORS } from './Wykres.js';

/** Sondy magazynu w kolejności OD GÓRY ZBIORNIKA W DÓŁ — tak leżą naprawdę. */
const SONDY_OD_GORY = ['A3', 'B3', 'A2', 'B2', 'A1', 'B1'] as const;
type IdSondy = (typeof SONDY_OD_GORY)[number];

const OPIS_SONDY: Record<IdSondy, string> = {
  A3: 'góra · A',
  B3: 'góra · B',
  A2: 'środek · A',
  B2: 'środek · B',
  A1: 'dół · A',
  B1: 'dół · B',
};

/** Kolor sondy — stały, niezależny od tego, ile serii jest włączonych. */
const KOLOR: Record<IdSondy, string> = {
  A3: SERIES_COLORS[1]!,
  B3: SERIES_COLORS[3]!,
  A2: SERIES_COLORS[2]!,
  B2: SERIES_COLORS[5]!,
  A1: SERIES_COLORS[0]!,
  B1: SERIES_COLORS[6]!,
};

type Forma = 'linie' | 'rozwarstwienie' | 'mapa';

const FORMY: Array<{ id: Forma; etykieta: string; opis: string }> = [
  { id: 'linie', etykieta: 'linie', opis: 'Każda sonda osobno — do odczytu konkretnej wartości.' },
  {
    id: 'rozwarstwienie',
    etykieta: 'rozwarstwienie',
    opis: 'Pasmo od najzimniejszej do najcieplejszej sondy ze średnią — pokazuje, czy zbiornik jest wymieszany.',
  },
  {
    id: 'mapa',
    etykieta: 'mapa cieplna',
    opis: 'Wiersz to sonda od góry zbiornika w dół, barwa to temperatura — widać wędrujący front przemiany.',
  },
];

const GODZINA_MS = 3600 * 1000;

/**
 * Zakresy do wyboru.
 *
 * Skok jest mniej więcej czterokrotny — przy gęstszej drabince sąsiednie
 * zakresy wyglądałyby tak samo i przełącznik nic by nie dawał. Doba jest
 * wartością startową i stąd `domyslny`.
 */
const ZAKRESY: Array<{ id: string; etykieta: string; godzin: number; domyslny?: boolean }> = [
  { id: '1h', etykieta: 'godzina', godzin: 1 },
  { id: '6h', etykieta: '6 godzin', godzin: 6 },
  { id: '24h', etykieta: 'doba', godzin: 24, domyslny: true },
  { id: '7d', etykieta: 'tydzień', godzin: 24 * 7 },
  { id: '30d', etykieta: 'miesiąc', godzin: 24 * 30 },
];

const ZAKRES_DOMYSLNY = ZAKRESY.find((z) => z.domyslny) ?? ZAKRESY[1]!;

// Płótno jest szerokie i niskie: doba danych czyta się wzdłuż, nie w pionie.
const W = 1400;
const H = 520;
const M = { top: 26, right: 96, bottom: 40, left: 62 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

/** Maksymalna liczba kolumn mapy cieplnej — wyżej rysowanie zaczyna zamulać. */
const MAKS_KOLUMN = 260;

type Stan =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'ready'; serie: HistorySeries[]; odMs: number; doMs: number; rozdzielczosc: string };

interface Props {
  profil: MaterialProfile | null;
}

/**
 * Podpis chwili na osi.
 *
 * Przy zakresach dłuższych niż dwie doby sama godzina przestaje cokolwiek
 * znaczyć — osiem podpisów „14:20" jeden za drugim nie mówi, o który dzień
 * chodzi. Powyżej tej granicy pokazujemy datę.
 */
function czas(ms: number, zakresMs: number): string {
  const d = new Date(ms);
  if (zakresMs > 48 * 3600 * 1000) {
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  }
  return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function ticksY(min: number, max: number, ile = 6): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const surowy = span / ile;
  const rzad = 10 ** Math.floor(Math.log10(surowy));
  const krok = [1, 2, 2.5, 5, 10].map((m) => m * rzad).find((s) => span / s <= ile) ?? rzad * 10;
  // Zabezpieczenie przed pętlą bez końca: przy zerowym albo nieliczbowym kroku
  // \`v += krok\` nigdy nie przekroczy granicy i przeglądarka zamarza. Dziś nie
  // powinno się zdarzyć (zakres dostaje minimalny oddech wyżej), ale koszt tej
  // linijki jest żaden, a koszt zawieszonej karty duży.
  if (!Number.isFinite(krok) || krok <= 0) return [min];
  const start = Math.ceil(min / krok) * krok;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += krok) out.push(Number(v.toFixed(6)));
  return out;
}

/**
 * Barwa temperatury w mapie cieplnej — TRZY REŻIMY, nie jedna tęcza.
 *
 * Zwykły gradient od zimnego do ciepłego rozmyłby przemianę fazową w środku
 * skali. Tutaj materiał stały idzie w błękitach, ciekły w pomarańczach,
 * a przemiana dostaje osobną, piaskową rodzinę — dzięki temu obszar przemiany
 * rysuje się jako zwarta plama, a nie jako kolejny odcień po drodze.
 */
function barwa(t: number, profil: MaterialProfile): string {
  const mieszaj = (a: number[], b: number[], u: number): string => {
    const k = Math.max(0, Math.min(1, u));
    const c = a.map((v, i) => Math.round(v + (b[i]! - v) * k));
    return `rgb(${c[0]} ${c[1]} ${c[2]})`;
  };

  if (t < profil.phaseBandMin) {
    const u = (t - profil.scaleMin) / Math.max(profil.phaseBandMin - profil.scaleMin, 0.001);
    return mieszaj([176, 205, 224], [232, 238, 244], u);
  }
  if (t <= profil.phaseBandMax) {
    const u = (t - profil.phaseBandMin) / Math.max(profil.phaseBandMax - profil.phaseBandMin, 0.001);
    return mieszaj([247, 217, 160], [237, 160, 74], u);
  }
  const u = (t - profil.phaseBandMax) / Math.max(profil.scaleMax - profil.phaseBandMax, 0.001);
  return mieszaj([235, 104, 52], [166, 40, 16], u);
}

export function WykresMagazynu({ profil }: Props) {
  const [stan, setStan] = useState<Stan>({ kind: 'loading' });
  const [zakres, setZakres] = useState(ZAKRES_DOMYSLNY);
  const [forma, setForma] = useState<Forma>('linie');
  const [ukryte, setUkryte] = useState<Set<string>>(new Set());
  const [hoverX, setHoverX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Wybrany zakres wstecz od chwili pobrania. Granice zamrażamy w stanie,
  // żeby wykres nie przesuwał się pod kursorem przy każdym renderze.
  useEffect(() => {
    let porzucone = false;
    setStan({ kind: 'loading' });
    const doMs = Date.now();
    const odMs = doMs - zakres.godzin * GODZINA_MS;

    fetchHistory({
      ids: [...SONDY_OD_GORY],
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
  }, [zakres]);

  const widoczne = useMemo(
    () => SONDY_OD_GORY.filter((id) => !ukryte.has(id)),
    [ukryte],
  );

  const przelacz = (id: string): void => {
    setUkryte((biezace) => {
      const nowe = new Set(biezace);
      if (nowe.has(id)) nowe.delete(id);
      // Ostatniej widocznej sondy nie da się zgasić — pusty wykres nie niesie
      // żadnej informacji, a użytkownik nie wie, czemu wszystko zniknęło.
      else if (nowe.size < SONDY_OD_GORY.length - 1) nowe.add(id);
      return nowe;
    });
  };

  const gotowe = stan.kind === 'ready' ? stan : null;

  /** Serie w kolejności od góry zbiornika, tylko widoczne, z próbkami. */
  const serie = useMemo(() => {
    if (!gotowe) return [];
    const mapa = new Map(gotowe.serie.map((s) => [s.id, s]));
    return widoczne.map((id) => ({
      id,
      kolor: KOLOR[id],
      opis: OPIS_SONDY[id],
      punkty: (mapa.get(id)?.points ?? []).map((p) => ({ ms: Date.parse(p.ts), v: p.v })),
    }));
  }, [gotowe, widoczne]);

  const maProbki = serie.some((s) => s.punkty.some((p) => p.v !== null));

  const { yMin, yMax } = useMemo(() => {
    const wartosci = serie.flatMap((s) => s.punkty.map((p) => p.v)).filter((v): v is number => v !== null);
    if (wartosci.length === 0) return { yMin: 0, yMax: 1 };
    let min = Math.min(...wartosci);
    let max = Math.max(...wartosci);
    // Pasmo przemiany wciągamy w kadr tylko wtedy, gdy leży blisko danych —
    // inaczej wykres z zimnego zbiornika rozciągałby się na pół skali po nic.
    if (profil && profil.phaseBandMin < max + 3 && profil.phaseBandMax > min - 3) {
      min = Math.min(min, profil.phaseBandMin);
      max = Math.max(max, profil.phaseBandMax);
    }
    const oddech = Math.max((max - min) * 0.08, 0.4);
    return { yMin: min - oddech, yMax: max + oddech };
  }, [serie, profil]);

  const odMs = gotowe?.odMs ?? 0;
  const zakresMs = (gotowe?.doMs ?? 1) - odMs;
  const xOf = (ms: number): number => M.left + ((ms - odMs) / zakresMs) * PLOT_W;
  const yOf = (v: number): number => M.top + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

  /** Największy dopuszczalny odstęp próbek; wyżej rysujemy przerwę. */
  const limitDziury = useMemo(() => {
    const odstepy: number[] = [];
    for (const s of serie) {
      for (let i = 1; i < s.punkty.length; i += 1) odstepy.push(s.punkty[i]!.ms - s.punkty[i - 1]!.ms);
    }
    odstepy.sort((a, b) => a - b);
    return (odstepy[Math.floor(odstepy.length / 2)] ?? 60_000) * 2.5;
  }, [serie]);

  /** Ścieżki linii — przerywane na braku danych i na dziurze czasowej. */
  const sciezki = useMemo(
    () =>
      serie.map((s) => {
        let d = '';
        let poprzedni: number | null = null;
        let pisze = false;
        for (const p of s.punkty) {
          if (p.v === null) {
            poprzedni = p.ms;
            pisze = false;
            continue;
          }
          if (poprzedni !== null && p.ms - poprzedni > limitDziury) pisze = false;
          d += `${pisze ? ' L' : ' M'}${xOf(p.ms).toFixed(1)} ${yOf(p.v).toFixed(1)}`;
          pisze = true;
          poprzedni = p.ms;
        }
        return { id: s.id, kolor: s.kolor, d: d.trim() };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serie, limitDziury, yMin, yMax, odMs, zakresMs],
  );

  /**
   * Rozwarstwienie: dla każdej chwili min, max i średnia po WIDOCZNYCH sondach.
   *
   * Próbki różnych serii mają te same znaczniki czasu (serwer zwraca kubełki),
   * więc zestawiamy je po indeksie osi czasu pierwszej serii.
   */
  const rozwarstwienie = useMemo(() => {
    if (serie.length === 0) return null;
    const os = serie[0]!.punkty;
    const kolumny: Array<{ ms: number; min: number; max: number; sr: number }> = [];
    for (let i = 0; i < os.length; i += 1) {
      const wartosci = serie
        .map((s) => s.punkty[i]?.v)
        .filter((v): v is number => v !== null && v !== undefined);
      if (wartosci.length === 0) continue;
      kolumny.push({
        ms: os[i]!.ms,
        min: Math.min(...wartosci),
        max: Math.max(...wartosci),
        sr: wartosci.reduce((a, b) => a + b, 0) / wartosci.length,
      });
    }
    if (kolumny.length === 0) return null;

    const gora = kolumny.map((k) => `${xOf(k.ms).toFixed(1)} ${yOf(k.max).toFixed(1)}`);
    const dol = [...kolumny].reverse().map((k) => `${xOf(k.ms).toFixed(1)} ${yOf(k.min).toFixed(1)}`);
    const srednia = kolumny
      .map((k, i) => `${i === 0 ? 'M' : 'L'}${xOf(k.ms).toFixed(1)} ${yOf(k.sr).toFixed(1)}`)
      .join('');

    return {
      pasmo: `M${gora.join(' L')} L${dol.join(' L')} Z`,
      srednia,
      maksRozstep: Math.max(...kolumny.map((k) => k.max - k.min)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, yMin, yMax, odMs, zakresMs]);

  /**
   * Mapa cieplna: siatka wiersz-sonda × kolumna-czas.
   *
   * Kolumny są przerzedzane do `MAKS_KOLUMN`, bo doba surowych próbek dałaby
   * kilka tysięcy prostokątów na wiersz i przeglądarka zaczęłaby się zacinać.
   * Przerzedzamy PRÓBKOWANIEM, nie uśrednianiem — uśrednianie zjadłoby
   * krótkie skoki temperatury, a to one są ciekawe.
   *
   * POŁOŻENIE KOLUMNY BIERZE SIĘ ZE ZNACZNIKA CZASU, nie z numeru próbki.
   * Rozstawienie po numerze jest kuszące i błędne: serwer zwraca tylko te
   * kubełki, w których coś zmierzono, więc półtorej godziny danych z doby
   * rozciągnęłoby się na całą szerokość i przeczyłoby osi czasu narysowanej
   * pod spodem. Przerwa w pomiarach ma zostać przerwą także tutaj.
   */
  const mapa = useMemo(() => {
    if (serie.length === 0 || !profil) return null;
    const os = serie[0]!.punkty;
    if (os.length === 0) return null;

    const skok = Math.max(1, Math.ceil(os.length / MAKS_KOLUMN));
    const indeksy: number[] = [];
    for (let i = 0; i < os.length; i += skok) indeksy.push(i);

    const wysokosc = PLOT_H / serie.length;

    // Szerokość pola = odstęp do następnej próbki. Ostatnie pole dostaje
    // odstęp poprzedniego, żeby nie zwężało się do zera.
    const szerokosci = indeksy.map((indeks, k) => {
      const nastepny = indeksy[k + 1];
      const doMs = nastepny !== undefined ? os[nastepny]!.ms : os[os.length - 1]!.ms;
      const odMsPola = os[indeks]!.ms;
      const szer = xOf(doMs) - xOf(odMsPola);
      return szer > 0.2 ? szer : null;
    });
    const domyslna = szerokosci.find((s) => s !== null) ?? 2;

    const komorki = serie.flatMap((s, wiersz) =>
      indeksy.map((indeks, k) => {
        const p = s.punkty[indeks];
        const szer = szerokosci[k] ?? domyslna;
        return {
          klucz: `${s.id}-${indeks}`,
          x: xOf(os[indeks]!.ms),
          y: M.top + wiersz * wysokosc,
          // Zakładka 0,6 px kasuje włoskowe szpary między sąsiednimi polami,
          // które inaczej rysują się jako biała krateczka.
          w: szer + 0.6,
          h: wysokosc,
          fill: p && p.v !== null ? barwa(p.v, profil) : 'transparent',
        };
      }),
    );

    return { komorki, wysokoscWiersza: wysokosc };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, profil, odMs, zakresMs]);

  /** Najechanie — wspólne dla linii i rozwarstwienia. */
  const podpowiedz = useMemo(() => {
    if (hoverX === null || !gotowe || forma === 'mapa') return null;
    const ms = odMs + ((hoverX - M.left) / PLOT_W) * zakresMs;

    // Zwykła pętla zamiast map+filter: przy `map` typ elementu niósłby `null`
    // aż do rysowania i każde użycie wymagałoby wykrzyknika.
    const wiersze: Array<{ id: string; kolor: string; opis: string; ms: number; v: number | null }> = [];
    for (const s of serie) {
      let najblizsza: { ms: number; v: number | null } | null = null;
      for (const p of s.punkty) {
        if (!najblizsza || Math.abs(p.ms - ms) < Math.abs(najblizsza.ms - ms)) najblizsza = p;
      }
      if (najblizsza && Math.abs(najblizsza.ms - ms) <= limitDziury) {
        wiersze.push({ id: s.id, kolor: s.kolor, opis: s.opis, ms: najblizsza.ms, v: najblizsza.v });
      }
    }

    return wiersze.length > 0 ? { ms: wiersze[0]!.ms, wiersze } : null;
  }, [hoverX, serie, gotowe, odMs, zakresMs, limitDziury, forma]);

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

  const tickiY = useMemo(() => ticksY(yMin, yMax), [yMin, yMax]);
  const pasmoWidoczne = profil && profil.phaseBandMax > yMin && profil.phaseBandMin < yMax;

  return (
    <section className="card card--szeroka">
      <div className="card__head">
        <h2 className="card__title">magazyn · {zakres.etykieta}</h2>
        <p className="card__meta">
          {gotowe ? `sześć sond · rozdzielczość ${gotowe.rozdzielczosc}` : 'wszystkie sondy magazynu'}
        </p>
      </div>

      {/* --- Sterowanie: zakres, forma prezentacji, włączanie sond -------- */}
      <div className="przeglad__sterowanie">
        <div className="segment" role="group" aria-label="Zakres czasu">
          {ZAKRESY.map((z) => (
            <button
              key={z.id}
              type="button"
              className={`segment__item${zakres.id === z.id ? ' is-active' : ''}`}
              onClick={() => setZakres(z)}
              title={`Pokaż ostatnie: ${z.etykieta}`}
            >
              {z.etykieta}
            </button>
          ))}
        </div>

        <div className="segment" role="group" aria-label="Forma wykresu">
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

        <div className="przeglad__sondy">
          {SONDY_OD_GORY.map((id) => {
            const wlaczona = !ukryte.has(id);
            return (
              <button
                key={id}
                type="button"
                className={`chip chip--seria${wlaczona ? ' is-active' : ''}`}
                onClick={() => przelacz(id)}
                aria-pressed={wlaczona}
                title={`${OPIS_SONDY[id]} — kliknij, żeby ${wlaczona ? 'ukryć' : 'pokazać'}`}
              >
                <span className="chart__swatch" style={{ background: wlaczona ? KOLOR[id] : 'transparent', borderColor: KOLOR[id] }} />
                {id}
              </button>
            );
          })}
        </div>
      </div>

      <p className="przeglad__opis">{FORMY.find((f) => f.id === forma)!.opis}</p>

      {stan.kind === 'loading' ? <div className="note">Pobieram dobę pomiarów…</div> : null}
      {stan.kind === 'error' ? <div className="note is-bad">{stan.message}</div> : null}
      {stan.kind === 'unavailable' ? (
        <div className="note">
          <strong>Odczyt historii jest niedostępny.</strong> {stan.message}
        </div>
      ) : null}

      {gotowe && !maProbki ? (
        <div className="note">
          Z ostatniej doby nie ma ani jednego pomiaru. Serwer zapisuje historię tylko wtedy, gdy
          działa — zajrzyj do widoku Diagnostyka.
        </div>
      ) : null}

      {gotowe && maProbki ? (
        <div className="chart chart--pelna">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="chart__svg"
            onMouseMove={ruch}
            onMouseLeave={() => setHoverX(null)}
            role="img"
            aria-label={`Temperatury magazynu z ostatniej doby, forma: ${forma}`}
          >
            {/* Pasmo przemiany — w liniach i rozwarstwieniu jako tło osi Y.
                W mapie cieplnej niesie je sama barwa, więc tu go nie ma. */}
            {forma !== 'mapa' && pasmoWidoczne ? (
              <g>
                <rect
                  x={M.left}
                  width={PLOT_W}
                  y={yOf(Math.min(profil.phaseBandMax, yMax))}
                  height={Math.max(
                    yOf(Math.max(profil.phaseBandMin, yMin)) - yOf(Math.min(profil.phaseBandMax, yMax)),
                    1,
                  )}
                  className="chart__band"
                />
                <line
                  x1={M.left}
                  x2={M.left + PLOT_W}
                  y1={yOf(profil.phaseBandMin)}
                  y2={yOf(profil.phaseBandMin)}
                  className="chart__band-edge"
                />
                <line
                  x1={M.left}
                  x2={M.left + PLOT_W}
                  y1={yOf(profil.phaseBandMax)}
                  y2={yOf(profil.phaseBandMax)}
                  className="chart__band-edge"
                />
                <text x={M.left + 8} y={yOf(profil.phaseBandMax) - 6} className="chart__band-label">
                  przemiana fazowa {profil.phaseBandMin}–{profil.phaseBandMax} °C
                </text>
              </g>
            ) : null}

            {/* Oś Y — w mapie cieplnej zastąpiona podpisami sond. */}
            {forma !== 'mapa'
              ? tickiY.map((t) => (
                  <g key={t}>
                    <line x1={M.left} x2={M.left + PLOT_W} y1={yOf(t)} y2={yOf(t)} className="chart__grid" />
                    <text x={M.left - 10} y={yOf(t) + 4} className="chart__tick chart__tick--y">
                      {t}
                    </text>
                  </g>
                ))
              : null}

            {tickiX.map((t) => (
              <text key={t} x={xOf(t)} y={H - 12} className="chart__tick chart__tick--x">
                {czas(t, zakresMs)}
              </text>
            ))}

            {/* --- Forma: linie --- */}
            {forma === 'linie'
              ? sciezki.map((s) =>
                  s.d ? <path key={s.id} d={s.d} fill="none" stroke={s.kolor} strokeWidth={2} strokeLinejoin="round" /> : null,
                )
              : null}

            {/* --- Forma: rozwarstwienie --- */}
            {forma === 'rozwarstwienie' && rozwarstwienie ? (
              <g>
                <path d={rozwarstwienie.pasmo} className="przeglad__rozrzut" />
                <path d={rozwarstwienie.srednia} fill="none" className="przeglad__srednia" />
              </g>
            ) : null}

            {/* --- Forma: mapa cieplna --- */}
            {forma === 'mapa' && mapa ? (
              <g>
                {mapa.komorki.map((k) => (
                  <rect key={k.klucz} x={k.x} y={k.y} width={k.w} height={k.h} fill={k.fill} shapeRendering="crispEdges" />
                ))}
                {serie.map((s, i) => (
                  <text
                    key={s.id}
                    x={M.left - 10}
                    y={M.top + i * mapa.wysokoscWiersza + mapa.wysokoscWiersza / 2 + 4}
                    className="chart__tick chart__tick--y"
                  >
                    {s.id}
                  </text>
                ))}
                {serie.map((s, i) =>
                  i === 0 ? null : (
                    <line
                      key={`kreska-${s.id}`}
                      x1={M.left}
                      x2={M.left + PLOT_W}
                      y1={M.top + i * mapa.wysokoscWiersza}
                      y2={M.top + i * mapa.wysokoscWiersza}
                      className="przeglad__mapa-kreska"
                    />
                  ),
                )}
              </g>
            ) : null}

            {/* Krzyż najechania. */}
            {podpowiedz ? (
              <g>
                <line
                  x1={xOf(podpowiedz.ms)}
                  x2={xOf(podpowiedz.ms)}
                  y1={M.top}
                  y2={M.top + PLOT_H}
                  className="chart__crosshair"
                />
                {forma === 'linie'
                  ? podpowiedz.wiersze.map((w) =>
                      w.v !== null ? <circle key={w.id} cx={xOf(w.ms)} cy={yOf(w.v)} r={4} fill={w.kolor} /> : null,
                    )
                  : null}
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
                  <span className="chart__tooltip-id">{w.id}</span>
                  <span className="mono">{w.v === null ? '—' : `${w.v.toFixed(1)} °C`}</span>
                </p>
              ))}
            </div>
          ) : null}

          {/* Skala barwna — tylko przy mapie, bo tylko tam barwa niesie wartość. */}
          {forma === 'mapa' && profil ? (
            <div className="przeglad__skala">
              <span className="mono">{profil.scaleMin} °C</span>
              <span className="przeglad__skala-pasek" aria-hidden="true">
                {Array.from({ length: 60 }, (_, i) => {
                  const t = profil.scaleMin + ((profil.scaleMax - profil.scaleMin) * i) / 59;
                  return <i key={i} style={{ background: barwa(t, profil) }} />;
                })}
              </span>
              <span className="mono">{profil.scaleMax} °C</span>
              <span className="przeglad__skala-opis">
                pole piaskowe = przemiana {profil.phaseBandMin}–{profil.phaseBandMax} °C
              </span>
            </div>
          ) : null}

          {forma === 'rozwarstwienie' && rozwarstwienie ? (
            <p className="przeglad__wniosek">
              Największy rozstęp między sondami w tej dobie:{' '}
              <strong className="mono">{rozwarstwienie.maksRozstep.toFixed(1)} K</strong>. Szerokie
              pasmo znaczy, że zbiornik pracuje warstwami; wąskie — że jest wymieszany.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
