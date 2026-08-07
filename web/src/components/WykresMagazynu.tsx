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
import {
  GODZINA_MS,
  H,
  M,
  PLOT_H,
  PLOT_W,
  W,
  ZAKRES_DOMYSLNY_H,
  czas,
  etykietaZakresu,
  ticksY,
} from './wykres/os.js';
import { WyborZakresu } from './wykres/WyborZakresu.js';

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

/**
 * FORMY PREZENTACJI.
 *
 * „linie" i „odczyty" rysują te same dane i różnią się jedną rzeczą: co robią
 * z PRZERWĄ w pomiarach.
 *
 *   linie    Ciągły przebieg. Przerwy są przeskakiwane, więc kreska idzie od
 *            początku do końca zakresu bez rozspajania. Do patrzenia na
 *            kształt: gdzie zaczęło rosnąć, gdzie przystanęło, jak wygląda
 *            półka przemiany. Serwer zapisuje tylko wtedy, gdy działa, więc
 *            każdy restart robił dziurę — a przy sześciu seriach naraz
 *            posiekana kreska przestawała się czytać jako przebieg.
 *
 *   odczyty  Te same serie, ale widać POJEDYNCZE PRÓBKI i przerwy między nimi.
 *            Do pytania „czy naprawdę to zmierzyliśmy", a nie „jaki to kształt".
 *            Ciągła kreska w poprzedniej formie łączy punkty przez przerwę, co
 *            jest wygodne i jest domysłem — ta forma pokazuje, ile w niej
 *            domysłu.
 */
type Forma = 'linie' | 'odczyty' | 'rozwarstwienie' | 'mapa';

/**
 * FILTR ANTYPIKOWY (Hampel) — DOTYCZY WYŚWIETLANIA, NIE DANYCH.
 *
 * Sonda DS18B20 potrafi oddać pojedynczy fałszywy odczyt (zakłócenie na
 * magistrali 1-Wire, dotknięcie przewodu przy pracy na stanowisku) — na
 * wykresie wychodzi z tego pik o kilka stopni, którego fizyka nie umie
 * wyprodukować: parafina ma stałe czasowe w minutach, nie w sekundach.
 * Zgłoszone 2026-08-06 (pik B3 do ~62 °C w widoku godziny).
 *
 * Zasada: wartość porównuje się z medianą sąsiadów w oknie czasowym; jeśli
 * odstaje o więcej niż PROG, na rysunku staje mediana. Prawdziwe zmiany
 * przeżywają filtr: stromy, MONOTONICZNY wzrost ma medianę blisko środka
 * (nic nie odstaje), a utrzymany skok poziomu po połowie okna staje się
 * nową medianą. Ginie tylko to, co wyskoczyło i wróciło.
 *
 * SUROWE DANE ZOSTAJĄ SUROWE: baza, eksport CSV i forma „odczyty" (która
 * z definicji pokazuje, co naprawdę zmierzono) nie przechodzą przez filtr.
 */
function bezPikow(
  punkty: Array<{ ms: number; v: number | null }>,
): Array<{ ms: number; v: number | null }> {
  const proba: Array<{ i: number; ms: number; v: number }> = [];
  punkty.forEach((p, i) => {
    if (p.v !== null) proba.push({ i, ms: p.ms, v: p.v });
  });
  const n = proba.length;
  if (n < 5) return punkty;

  // Okno: co najmniej ±90 s i co najmniej cztery typowe odstępy próbek —
  // przy rzadkich kubełkach (doba, miesiąc) okno rośnie razem z nimi,
  // inaczej mediana z jednej próbki niczego by nie filtrowała.
  const typowyOdstep = (proba[n - 1]!.ms - proba[0]!.ms) / (n - 1);
  const OKNO_MS = Math.max(90_000, 4 * typowyOdstep);
  const PROG_K = 2;

  const wynik = punkty.slice();
  let lo = 0;
  let hi = 0;
  for (let k = 0; k < n; k += 1) {
    while (proba[lo]!.ms < proba[k]!.ms - OKNO_MS) lo += 1;
    while (hi < n && proba[hi]!.ms <= proba[k]!.ms + OKNO_MS) hi += 1;
    if (hi - lo < 3) continue;
    const okno: number[] = [];
    for (let j = lo; j < hi; j += 1) okno.push(proba[j]!.v);
    okno.sort((a, b) => a - b);
    const mediana = okno[okno.length >> 1]!;
    if (Math.abs(proba[k]!.v - mediana) > PROG_K) {
      wynik[proba[k]!.i] = { ms: proba[k]!.ms, v: mediana };
    }
  }
  return wynik;
}

const FORMY: Array<{ id: Forma; etykieta: string; opis: string }> = [
  {
    id: 'linie',
    etykieta: 'linie',
    opis: 'Ciągły przebieg każdej sondy — do czytania kształtu: wzrostu, półki przemiany, spadku.',
  },
  {
    id: 'odczyty',
    etykieta: 'odczyty',
    opis: 'Pojedyncze próbki z widocznymi przerwami — pokazuje, co zostało zmierzone, a co dopowiada linia.',
  },
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

/*
 * ZAKRESY CZASU, PŁÓTNO I OSIE STOJĄ W `wykres/os.ts`.
 *
 * Karta przepływów niżej rysuje się na tych samych stałych — inaczej dwa
 * wykresy jeden nad drugim miałyby osie czasu przesunięte względem siebie
 * o kilka pikseli i czytałoby się to jako błąd rysowania, nie jako dwie
 * niezależne karty.
 */

/** Maks. liczba przystanków gradientu na wiersz mapy — wyżej DOM zaczyna
 *  puchnąć bez widocznego zysku (przystanki i tak leżą gęściej niż piksele). */
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
 * SKALA BARWNA MAPY CIEPLNEJ — kalibracja projektanta z 2026-08-04.
 *
 * Wymaganie brzmiało dosłownie: „dla chłodu niebieski 6, a potem 15 już
 * pomarańcz, płynnie gradientem". Rampa robi dokładnie to: pełny błękit
 * na 6 °C, neutralna przerwa w połowie drogi, pełny pomarańcz na 15 °C.
 * Powyżej pomarańcz pogłębia się aż do bordo, żeby zakres pracy 57HC
 * (40–75 °C) nie zlał się w jedną plamę; poniżej 6 °C błękit ciemnieje.
 *
 * TO JEST TRZECIE PODEJŚCIE i warto wiedzieć, czemu dwa poprzednie odpadły.
 * Pierwsza rampa miała biel na 0 °C i szarość na 10 °C — cała doba chłodu
 * wychodziła szaro-piaskowo. Druga brała skalę globalną palety A2 — 9 °C
 * zrobiło się niebieskawe, ale przejście błękit→pomarańcz rozciągało się
 * na 30 K i w oknie pracy chłodu (6–19 °C) prawie nic się nie działo.
 * Ta rampa jest skrojona pod PYTANIE mapy: „gdzie w zbiorniku jest chłód,
 * a gdzie już go nie ma" — i dlatego jest WŁASNOŚCIĄ mapy cieplnej, a nie
 * palety A2. Kropki sond na schemacie i podziałka belki zostają przy A2.
 *
 * Barwy przystanków pochodzą z rodzin A2 (błękity ze skali lokalnej chłodu,
 * pomarańcze ze skali lokalnej ciepła), więc mapa nie wprowadza nowych
 * kolorów — tylko inne rozmieszczenie tych samych.
 */
const RAMPA: ReadonlyArray<{ t: number; rgb: [number, number, number] }> = [
  { t: -20, rgb: [22, 42, 74] }, // głęboki granat — mróz
  { t: 0, rgb: [22, 64, 110] }, // ciemny błękit
  { t: 6, rgb: [46, 107, 168] }, // pełny błękit — tu zaczyna się żądanie
  { t: 10.5, rgb: [233, 228, 220] }, // neutralna przerwa (środek 6–15)
  { t: 15, rgb: [226, 138, 69] }, // pełny pomarańcz — tu się kończy
  { t: 30, rgb: [196, 101, 42] }, // pomarańcz pogłębiony
  { t: 45, rgb: [154, 69, 23] }, // rdza — okno pracy 57HC
  { t: 70, rgb: [92, 12, 14] }, // bordo — koniec skali
];

function barwa(t: number): string {
  const pierwszy = RAMPA[0]!;
  const ostatni = RAMPA[RAMPA.length - 1]!;
  const zapis = (c: readonly [number, number, number]): string => `rgb(${c[0]} ${c[1]} ${c[2]})`;

  if (t <= pierwszy.t) return zapis(pierwszy.rgb);
  if (t >= ostatni.t) return zapis(ostatni.rgb);

  for (let i = 1; i < RAMPA.length; i += 1) {
    const b = RAMPA[i]!;
    if (t > b.t) continue;
    const a = RAMPA[i - 1]!;
    const u = (t - a.t) / (b.t - a.t);
    return zapis([
      Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * u),
      Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * u),
      Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * u),
    ]);
  }

  return zapis(ostatni.rgb);
}

export function WykresMagazynu({ profil }: Props) {
  const [stan, setStan] = useState<Stan>({ kind: 'loading' });
  const [godzin, setGodzin] = useState(ZAKRES_DOMYSLNY_H);
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
    const odMs = doMs - godzin * GODZINA_MS;

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
  }, [godzin]);

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

  /**
   * Serie w kolejności od góry zbiornika, tylko widoczne — WSZYSTKIE ZŁOŻONE
   * NA JEDNEJ, WSPÓLNEJ OSI CZASU.
   *
   * ============================================================================
   * SERIE Z SERWERA NIE MAJĄ TYCH SAMYCH ZNACZNIKÓW CZASU. Stało tu wcześniej
   * proste przepisanie punktów każdej sondy z osobna, a `rozwarstwienie`
   * i `mapa cieplna` zestawiały je POTEM PO INDEKSIE — z komentarzem, że
   * „próbki różnych serii mają te same znaczniki czasu". To nieprawda i dało się
   * to zmierzyć: `/api/history` zwraca tylko te kubełki, w których dana sonda
   * coś zmierzyła, więc dla doby wychodzi 154–158 próbek zależnie od sondy
   * (sprawdzone 2026-08-04). Cztery kubełki różnicy to przy rozdzielczości 5 min
   * DWADZIEŚCIA MINUT przesunięcia między wierszami mapy cieplnej.
   *
   * Skutek był dokładnie taki, jakiego ten projekt najbardziej nie chce: mapa
   * pokazywała front przemiany wędrujący przez zbiornik, a część tego wędrowania
   * była artefaktem rozjechanych osi. Wykres wyglądał poprawnie i kłamał.
   *
   * Teraz osią jest SUMA wszystkich znaczników czasu, a każda sonda dostaje
   * wartość albo `null` w każdym kubełku tej osi. Dzięki temu indeks `i` znaczy
   * tę samą chwilę w każdej serii — i dopiero wtedy zestawianie po indeksie,
   * z którego korzystają rozwarstwienie i mapa, jest w ogóle uprawnione.
   */
  const serie = useMemo(() => {
    if (!gotowe) return [];
    const mapa = new Map(gotowe.serie.map((s) => [s.id, s]));

    // Wspólna oś: wszystkie chwile, w których KTÓRAKOLWIEK widoczna sonda
    // ma próbkę. Sortowana, bo kolejność serii nie gwarantuje kolejności czasu.
    const chwile = new Set<number>();
    for (const id of widoczne) {
      for (const p of mapa.get(id)?.points ?? []) chwile.add(Date.parse(p.ts));
    }
    const os = [...chwile].sort((a, b) => a - b);

    return widoczne.map((id) => {
      const wg = new Map<number, number | null>();
      for (const p of mapa.get(id)?.points ?? []) wg.set(Date.parse(p.ts), p.v);
      // `null` znaczy „w tej chwili ta sonda nie ma pomiaru" — i tak samo
      // traktuje to reszta pliku, więc brak próbki nie udaje wartości.
      const punkty = os.map((ms) => ({ ms, v: wg.get(ms) ?? null }));
      return {
        id,
        kolor: KOLOR[id],
        opis: OPIS_SONDY[id],
        // Formy „kształtu" (linie, rozwarstwienie, mapa) dostają przebieg
        // bez pików pojedynczych odczytów; „odczyty" pokazują surowość —
        // patrz komentarz przy `bezPikow`.
        punkty: forma === 'odczyty' ? punkty : bezPikow(punkty),
      };
    });
  }, [gotowe, widoczne, forma]);

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

  /**
   * Ścieżki linii.
   *
   * `ciagle` decyduje o losie przerwy w pomiarach. Forma „linie" przeskakuje ją
   * i prowadzi kreskę dalej; forma „odczyty" rozspaja ścieżkę, więc przerwa
   * zostaje przerwą. Jedna funkcja, bo geometria jest identyczna — różni się
   * tylko to jedno rozstrzygnięcie, a dwie kopie tego kodu rozeszłyby się przy
   * pierwszej poprawce.
   */
  const zbudujSciezki = (ciagle: boolean) =>
    serie.map((s) => {
      let d = '';
      let poprzedni: number | null = null;
      let pisze = false;
      for (const p of s.punkty) {
        if (p.v === null) {
          // Brak wartości to brak wartości także w formie ciągłej: kubełek bez
          // pomiaru nie ma współrzędnej Y, więc nie da się przez niego
          // przeprowadzić kreski. Ciągłość dotyczy DZIURY CZASOWEJ — kubełków,
          // których serwer w ogóle nie zwrócił.
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
    [serie, yMin, yMax, odMs, zakresMs],
  );

  const sciezkiPrzerywane = useMemo(
    () => zbudujSciezki(false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serie, limitDziury, yMin, yMax, odMs, zakresMs],
  );

  /**
   * Znaczniki pojedynczych próbek dla formy „odczyty".
   *
   * Przy dobie surowych danych punktów jest kilka tysięcy na serię i kropka
   * przy każdym zlewa się w pasek — wtedy przerzedzamy, żeby zostały kropkami.
   * Sama LINIA pozostaje pełna: przerzedzenie dotyczy tylko znaczników, więc
   * przebieg nie gubi kształtu.
   */
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
  }, [serie, yMin, yMax, odMs, zakresMs]);

  /**
   * Rozwarstwienie: dla każdej chwili min, max i średnia po WIDOCZNYCH sondach.
   *
   * KAŻDA SONDA JEST NAJPIERW DOGĘSZCZANA NA CAŁĄ OŚ interpolacją liniową
   * między jej własnymi próbkami — i to jest poprawka usterki zgłoszonej
   * 2026-08-04 („coś nie tak z rozwarstwieniem, przedtem było lepiej").
   *
   * Serwer zapisuje punkt tylko wtedy, gdy wartość się ZMIENIŁA, więc każda
   * sonda ma próbki w innych kubełkach. Po przejściu na wspólną oś czasu
   * kolumna brała to, co akurat w niej było — zmierzone na godzinie danych
   * przy rozdzielczości 6 s: ze 166 kolumn aż 111 miało JEDNĄ sondę, a komplet
   * sześciu tylko 2. Min i max z jednej sondy to ta sama liczba, więc pasmo
   * zwężało się do zera i zębkowało, a średnia skakała między pojedynczymi
   * sondami — na ekranie wyglądało to jak gruba, poszarpana kreska.
   *
   * Interpolacja między własnymi próbkami sondy to dokładnie ten sam domysł,
   * który robi forma „linie", przeskakując przerwę — wartość między dwoma
   * zapisami naprawdę leżała między nimi, bo zapis dzieje się przy zmianie.
   * Poza pierwszą i ostatnią próbką sondy nie zmyślamy nic: kolumna wchodzi
   * do wyniku TYLKO Z PEŁNYM KOMPLETEM sond, inaczej pasmo „od najzimniejszej
   * do najcieplejszej" liczyłoby się z różnych podzbiorów w różnych chwilach
   * i znów kłamało o szerokości rozrzutu.
   */
  const rozwarstwienie = useMemo(() => {
    if (serie.length === 0) return null;
    const os = serie[0]!.punkty;

    const naOsi = serie.map((s) => {
      const wartosci: Array<number | null> = new Array<number | null>(os.length).fill(null);
      let poprzedni = -1;
      for (let i = 0; i < os.length; i += 1) {
        const v = s.punkty[i]!.v;
        if (v === null) continue;
        wartosci[i] = v;
        if (poprzedni >= 0 && poprzedni < i - 1) {
          const a = s.punkty[poprzedni]!;
          const b = s.punkty[i]!;
          for (let k = poprzedni + 1; k < i; k += 1) {
            const u = (os[k]!.ms - a.ms) / (b.ms - a.ms);
            wartosci[k] = (a.v as number) + ((b.v as number) - (a.v as number)) * u;
          }
        }
        poprzedni = i;
      }
      return wartosci;
    });

    const kolumny: Array<{ ms: number; min: number; max: number; sr: number }> = [];
    for (let i = 0; i < os.length; i += 1) {
      const wartosci: number[] = [];
      for (const sonda of naOsi) {
        const v = sonda[i];
        if (v !== null && v !== undefined) wartosci.push(v);
      }
      if (wartosci.length !== serie.length) continue;
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
   * Mapa cieplna: wiersz na sondę, a wzdłuż czasu JEDEN CIĄGŁY GRADIENT.
   *
   * Wcześniej każdy wiersz był łańcuchem osobnych prostokątów — po jednym na
   * kubełek — i każdy kubełek bez pomiaru zostawał przezroczystą szparą.
   * Przy sondach różniących się o kilka kubełków na dobę mapa wyglądała jak
   * podziurkowana taśma (zgłoszone 2026-08-04: „połącz te dziury, żeby była
   * ciągłość"). Teraz wiersz to jeden prostokąt wypełniony `linearGradient`,
   * którego przystanki stoją DOKŁADNIE w chwilach pomiarów — a między
   * przystankami przeglądarka interpoluje barwę sama. Płynne przejścia
   * i mostkowanie przerw w jednym mechanizmie, bez tysiąca węzłów DOM.
   *
   * ILE W TYM DOMYSŁU — tyle samo, co w formie „linie". Gradient przez
   * przerwę w zapisie to ta sama interpolacja, którą linia robi przeskakując
   * dziurę; kto chce zobaczyć, co NAPRAWDĘ zmierzono, ma formę „odczyty".
   * Za to poza skrajne pomiary wiersz NIE wychodzi: prostokąt zaczyna się na
   * pierwszej próbce sondy i kończy na ostatniej, więc początek i koniec
   * zakresu bez danych zostają puste, a nie rozciągnięte pierwszym kolorem.
   *
   * PRZYSTANKI SĄ PRZERZEDZANE do MAKS_KOLUMN próbkowaniem, nie uśrednianiem
   * — uśrednianie zjadłoby krótkie skoki temperatury, a to one są ciekawe.
   * Ostatnia próbka wchodzi zawsze, żeby wiersz kończył się prawdziwym
   * pomiarem, nie wynikiem kroku przerzedzania.
   */
  const mapa = useMemo(() => {
    if (serie.length === 0) return null;
    const wysokosc = PLOT_H / serie.length;

    const wiersze = serie.map((s, i) => {
      const probki = s.punkty.filter((p): p is { ms: number; v: number } => p.v !== null);
      if (probki.length < 2) {
        return { id: s.id, y: M.top + i * wysokosc, x0: 0, x1: 0, stops: null };
      }

      const skok = Math.max(1, Math.ceil(probki.length / MAKS_KOLUMN));
      const wybrane = probki.filter((_, k) => k % skok === 0);
      if (wybrane[wybrane.length - 1] !== probki[probki.length - 1]) {
        wybrane.push(probki[probki.length - 1]!);
      }

      const x0 = xOf(wybrane[0]!.ms);
      const x1 = xOf(wybrane[wybrane.length - 1]!.ms);
      const szer = Math.max(x1 - x0, 1);
      const stops = wybrane.map((p) => ({
        off: ((xOf(p.ms) - x0) / szer) * 100,
        kolor: barwa(p.v),
      }));

      return { id: s.id, y: M.top + i * wysokosc, x0, x1, stops };
    });

    return { wiersze, wysokoscWiersza: wysokosc };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, odMs, zakresMs]);

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
        <h2 className="card__title">magazyn · {etykietaZakresu(godzin)}</h2>
        <p className="card__meta">
          {gotowe ? `sześć sond · rozdzielczość ${gotowe.rozdzielczosc}` : 'wszystkie sondy magazynu'}
        </p>
      </div>

      {/* --- Sterowanie: zakres, forma prezentacji, włączanie sond -------- */}
      <div className="przeglad__sterowanie">
        <WyborZakresu godzin={godzin} onGodzin={setGodzin} idSufiks="magazyn" />

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

      {/* Akapit z opisem formy zdjęty 2026-08-05 na prośbę — opisy zostają
          w podpowiedziach przycisków (`title`), gdzie nie zabierają wiersza. */}

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
            aria-label={`Temperatury magazynu, zakres: ${etykietaZakresu(godzin)}, forma: ${forma}`}
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

            {/* --- Forma: linie (ciągłe, przerwy przeskakiwane) --- */}
            {forma === 'linie'
              ? sciezkiCiagle.map((s) =>
                  s.d ? <path key={s.id} d={s.d} fill="none" stroke={s.kolor} strokeWidth={2} strokeLinejoin="round" /> : null,
                )
              : null}

            {/* --- Forma: odczyty (cieńsza linia + kropki próbek) ---
                Linia zostaje, bo bez niej sześć serii kropek nie da się od
                siebie odróżnić — ale jest cieńsza i przygaszona, żeby wzrok
                szedł na próbki, a przerwy były widoczne jako przerwy. */}
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
                <defs>
                  {mapa.wiersze.map((w) =>
                    w.stops ? (
                      <linearGradient key={w.id} id={`wm-mapa-${w.id}`} x1="0" y1="0" x2="1" y2="0">
                        {w.stops.map((st, k) => (
                          <stop key={k} offset={`${st.off.toFixed(3)}%`} stopColor={st.kolor} />
                        ))}
                      </linearGradient>
                    ) : null,
                  )}
                </defs>
                {mapa.wiersze.map((w) =>
                  w.stops ? (
                    <rect
                      key={w.id}
                      x={w.x0}
                      y={w.y}
                      width={Math.max(w.x1 - w.x0, 1)}
                      height={mapa.wysokoscWiersza}
                      fill={`url(#wm-mapa-${w.id})`}
                    />
                  ) : null,
                )}
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
                {forma === 'linie' || forma === 'odczyty'
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

          {/*
            Skala barwna — tylko przy mapie, bo tylko tam barwa niesie wartość.

            Zakres skali idzie za DANYMI (ta sama dziedzina co oś Y), nie za
            profilem materiału. Rampa jest bezwzględna i sięga od −20 do 70 °C,
            a pokazanie całej sprowadziłoby dwustopniowe pasmo przemiany 8HC do
            paska szerokości włosa. Podpisy końców mówią, jaki wycinek widać.

            Pasmo przemiany dostaje OBRYS na skali, nie własną barwę — barwa
            znaczy teraz wyłącznie liczbę stopni.
          */}
          {forma === 'mapa' && profil ? (
            (() => {
              const rozpietosc = Math.max(yMax - yMin, 0.001);
              const udzial = (t: number): number => ((t - yMin) / rozpietosc) * 100;
              const odBandu = Math.max(0, udzial(profil.phaseBandMin));
              const doBandu = Math.min(100, udzial(profil.phaseBandMax));
              const pasmoWidac = doBandu > 0 && odBandu < 100 && doBandu > odBandu;

              return (
                <div className="przeglad__skala">
                  <span className="mono">{yMin.toFixed(0)} °C</span>
                  <span className="przeglad__skala-pasek" aria-hidden="true">
                    {Array.from({ length: 60 }, (_, i) => {
                      const t = yMin + (rozpietosc * i) / 59;
                      return <i key={i} style={{ background: barwa(t) }} />;
                    })}
                    {pasmoWidac ? (
                      <span
                        className="przeglad__skala-pasmo"
                        style={{ left: `${odBandu}%`, width: `${doBandu - odBandu}%` }}
                      />
                    ) : null}
                  </span>
                  <span className="mono">{yMax.toFixed(0)} °C</span>
                  <span className="przeglad__skala-opis">
                    {pasmoWidac ? 'obrys' : 'poza zakresem'} = przemiana {profil.phaseBandMin}–
                    {profil.phaseBandMax} °C
                  </span>
                </div>
              );
            })()
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
