/**
 * WARSTWA WIĄŻĄCA SVG — granica między rysunkiem a danymi.
 *
 * Schemat jest zewnętrznym plikiem SVG. Ta funkcja nie przerysowuje go ani
 * nie generuje: znajduje elementy po atrybutach data-* i aktualizuje im
 * tekst, wypełnienie i klasy. Dzięki temu przebudowa grafiki to podmiana
 * jednego pliku, a nie zmiana w kodzie.
 *
 * Wywoływana przy każdym zdarzeniu SSE. Kosztuje tyle, co kilka
 * querySelectorAll po kilkunastu elementach — żadnego renderowania Reacta
 * wewnątrz rysunku.
 */

import type { MaterialProfile, PointValue, PointValues, PublicPoint } from '@magazyn-pcm/shared';
import { NO_DATA, isStale } from '../format.js';
import { NO_DATA_FILL, isInPhaseBand, temperatureFill, wybierzSkale } from '../scale.js';

export interface BindOptions {
  points: Map<string, PublicPoint>;
  values: PointValues;
  profile: MaterialProfile;
  staleAfterMs: number;
  now: number;
  /**
   * PRZEPŁYW ODNIESIENIA obiegu (m³/h) — przy nim strumień osiąga pełną
   * prędkość. Pochodzi z konfiguracji (`/api/materials`), nie z rysunku
   * i nie z kodu animacji.
   */
  flowFullSpeed: number;
  /** Czy kanał do serwera żyje — decyduje, kto ocenia przestarzałość. */
  channelAlive?: boolean;
  /**
   * PRZEPŁYW UDAWANY, w m³/h, albo null przy pracy na prawdziwych danych.
   *
   * Ciepłomierz jest podłączony, ale pompa nie pracuje, więc przepływ wynosi
   * 0,000 m³/h i rury na schemacie stoją — poprawnie, tylko nie da się na tym
   * pokazać, jak wygląda działający układ. Ten parametr istnieje wyłącznie do
   * pokazu i jest włączany świadomie przyciskiem w widoku.
   *
   * Dlaczego nie zwykłe „wymuś animację": prędkość kreski ma dalej wynikać
   * z liczby, tak jak przy prawdziwym pomiarze. Inaczej tryb pokazowy uczyłby
   * czytania rysunku inaczej niż tryb prawdziwy.
   */
  przeplywDemo?: number | null;
  /**
   * NAŁADOWANIE MAGAZYNU, 0–1, albo null, gdy nie ma z czego policzyć.
   *
   * Liczy je strona wywołująca — dokładnie ten sam odczyt, który pokazuje belka
   * nad schematem. Gdyby ten plik liczył je sam, na jednym ekranie stanęłyby
   * dwie różne liczby opisujące to samo, a wtedy żadnej nie da się wierzyć.
   * Ten sam szew do podmiany źródła (temperatura → bilans energii): zmiana
   * dotyka miejsca wywołania, nie rysunku.
   */
  naladowanie?: number | null;
}

/** Klasy stanu — dokładnie jedna z nich siedzi na elemencie. */
const STATE_CLASSES = [
  'is-ok',
  'is-stale',
  'is-no-data',
  'is-not-connected',
  'is-active',
  'is-inactive',
  'is-unknown',
  'is-phase',
  'is-flowing',
  'is-still',
  'is-reverse',
];

/* --------------------------------------------------------------------------
 * PRĘDKOŚĆ STRUMIENIA — jedno miejsce, w którym m³/h zamienia się na px/s.
 *
 * Animacja (`schema/strumien.ts`) nie wie, co to przepływomierz: dostaje
 * gotową prędkość w pikselach na sekundę przez atrybut `data-flow-speed`.
 * Tutaj natomiast wiadomo wszystko — pomiar, przepływ odniesienia obiegu
 * i tryb pokazowy — więc tu jest właściwe miejsce na tę zamianę.
 * -------------------------------------------------------------------------- */

/**
 * Próg martwy. Poniżej niego animacja stoi.
 *
 * Ciepłomierz podaje przepływ z trzema miejscami po przecinku i przy stojącej
 * pompie ostatnia cyfra drga. 0,02 m³/h to około 4 % przepływu roboczego
 * (0,5 m³/h) — dość, żeby szum nie ruszał rysunku, i za mało, żeby ukryć
 * jakikolwiek prawdziwy przepływ.
 */
const PROG_MARTWY_M3H = 0.02;

/** Granice prędkości w px/s. Powyżej 52 px/s mózg liczy kreski, zamiast czytać. */
const V_MIN = 18;
const V_MAX = 52;

/** Prędkość w trybie pokazowym — stała, niezależna od jakiegokolwiek odczytu. */
const V_DEMO = 46;

/**
 * Prędkość strumienia dla zmierzonego przepływu.
 *
 * MAPOWANIE JEST PIERWIASTKOWE, NIE LINIOWE — i to nie jest kosmetyka.
 * Przy liniowym przeliczeniu małe przepływy wyglądają jak zero (bo prędkość
 * schodzi do zera razem z liczbą), a duże jak chaos. Pierwiastek podnosi dolny
 * koniec skali, więc „ledwo płynie" jest wyraźnie różne od „nie płynie".
 */
function predkoscStrumienia(flowM3h: number, flowNomM3h: number): number {
  const nom = flowNomM3h > 0 ? flowNomM3h : 1;
  const udzial = Math.min(flowM3h / nom, 1);
  return V_MIN + (V_MAX - V_MIN) * Math.sqrt(udzial);
}

function setState(element: Element, ...classes: string[]): void {
  for (const name of STATE_CLASSES) element.classList.remove(name);
  for (const name of classes) element.classList.add(name);
}

/** Stan punktu widziany przez rysunek. */
type Status = 'ok' | 'stale' | 'no-data' | 'not-connected';

function statusOf(
  point: PublicPoint | undefined,
  value: PointValue | undefined,
  staleAfterMs: number,
  now: number,
  channelAlive: boolean,
): Status {
  // Punkt nieznany i punkt zadeklarowany-ale-niepodlaczony wygladaja tak samo
  // na rysunku; roznice widac w konsoli (patrz warnUnknownPoint).
  if (!point || !point.available) return 'not-connected';
  if (!value || value.v === null) return 'no-data';
  return isStale(value, staleAfterMs, now, channelAlive) ? 'stale' : 'ok';
}

/**
 * Identyfikatory ze schematu, ktorych nie ma w rejestrze punktow.
 * Ostrzegamy RAZ na identyfikator — bindSchema biegnie co 5 s, wiec
 * ostrzeganie za kazdym razem zasypaloby konsole.
 */
const warnedUnknown = new Set<string>();

function warnUnknownPoint(id: string): void {
  if (warnedUnknown.has(id)) return;
  warnedUnknown.add(id);
  // eslint-disable-next-line no-console
  console.warn(
    `schema.svg odwołuje się do punktu "${id}", którego nie ma w rejestrze ` +
      '(server/src/points.config.ts). Element zostanie pokazany jako niepodłączony. ' +
      'Najczęstsza przyczyna: literówka w atrybucie data-* po przerysowaniu rysunku.',
  );
}

export function bindSchema(root: ParentNode, opts: BindOptions): void {
  const { points, values, profile, staleAfterMs, now } = opts;
  const channelAlive = opts.channelAlive ?? false;

  // --- Wartości liczbowe ---------------------------------------------------
  for (const element of root.querySelectorAll<SVGElement>('[data-point]')) {
    const id = element.dataset.point;
    if (!id) continue;

    const point = points.get(id);
    if (!point) warnUnknownPoint(id);
    const value = values[id];
    const status = statusOf(point, value, staleAfterMs, now, channelAlive);

    if (status === 'ok' || status === 'stale') {
      const precision = point?.precision ?? 1;
      const unit = element.dataset.unit ?? point?.unit ?? '';
      const number = value!.v!.toFixed(precision);
      element.textContent = unit ? `${number} ${unit}` : number;
    } else {
      // Brak danych to kreska. Nigdy zero, nigdy puste miejsce.
      element.textContent = NO_DATA;
    }

    setState(element, `is-${status}`);
  }

  // --- Wypełnienia według wartości ----------------------------------------
  //
  // SKALA WYBIERANA RAZ, NA CAŁY RYSUNEK — ale ROZSTRZYGANA SONDAMI MATERIAŁU.
  //
  // Rodzaj skali (globalna albo lokalna, zawężona do strefy przemiany) zależy
  // od rozpiętości danych; pytanie było, których danych. Pierwsza wersja brała
  // wszystkie kropki razem z ciepłomierzami — a rury mają dziś 25 °C przy
  // zbiorniku na 9 °C, czyli rozpiętość 17 K, czyli skala globalna. Sześć sond
  // zbiornika wychodziło wtedy w praktycznie jednym odcieniu błękitu, choć
  // różnica między nimi jest jedyną rzeczą, jaką ten rysunek ma o zbiorniku
  // do powiedzenia.
  //
  // Skale lokalne są zawężone dokładnie do stref przemiany (5–12 i 50–62 °C),
  // więc ich sensem jest kontrast W MATERIALE. Dlatego o skali decydują sondy
  // grupy `pcm`, a stosuje się ona do wszystkich kropek — jedna skala na
  // rysunku, bo dwie znaczyłyby, że ta sama liczba stopni ma dwie barwy.
  // Ciepłomierze wychodzą wtedy poza skalę lokalną i barwa się na jej krańcu
  // ZATRZYMUJE; liczba stoi obok kropki, więc informacja nie ginie.
  const doBarwienia: Array<number | null> = [];
  const wszystkieBarwione: Array<number | null> = [];
  for (const element of root.querySelectorAll<SVGElement>('[data-fill-point]')) {
    const id = element.dataset.fillPoint;
    if (!id) continue;
    const point = points.get(id);
    const value = values[id];
    const status = statusOf(point, value, staleAfterMs, now, channelAlive);
    if (status !== 'ok' && status !== 'stale') continue;
    wszystkieBarwione.push(value!.v);
    if (point?.group === 'pcm') doBarwienia.push(value!.v);
  }
  // Bez sond materiału (np. rozpoznanie zbiornika jeszcze nie doszło)
  // rozstrzyga to, co jest — lepsze niż z góry przyjęta skala globalna.
  const skala = wybierzSkale(doBarwienia.length > 0 ? doBarwienia : wszystkieBarwione);

  for (const element of root.querySelectorAll<SVGElement>('[data-fill-point]')) {
    const id = element.dataset.fillPoint;
    if (!id) continue;

    const point = points.get(id);
    if (!point) warnUnknownPoint(id);
    const value = values[id];
    const status = statusOf(point, value, staleAfterMs, now, channelAlive);
    const usable = status === 'ok' || status === 'stale';
    const numeric = usable ? value!.v : null;

    element.setAttribute('fill', usable ? temperatureFill(numeric, skala) : NO_DATA_FILL);
    setState(element, `is-${status}`);

    // Pasmo przemiany fazowej ma OSOBNE oznaczenie na grupie sondy —
    // punkt w plateau znaczy coś zupełnie innego niż punkt poza nim.
    const group = element.closest<SVGElement>('.sensor') ?? element;
    const inBand = status === 'ok' && isInPhaseBand(numeric, profile);
    group.classList.toggle('is-phase', inBand);
    group.classList.toggle('is-dim', status === 'not-connected');

    // Od v0.3 tekst wartości stoi OBOK kropki, na tle strony — kolor nadaje
    // arkusz stylów z motywu. Dobieranie koloru do tła skali (inkOn) miało
    // sens, gdy tekst leżał NA kolorowym kaflu; tu zostawiłoby ciemny napis
    // na ciemnym tle w trybie nocnym. Czyszczenie zamiast pominięcia, żeby
    // zejść ze starych wartości inline po przełączeniu motywu na żywo.
    const text = group.querySelector<SVGElement>(`[data-point="${id}"]`);
    if (text) text.style.fill = '';
  }

  // --- Animacja przepływu --------------------------------------------------
  //
  // DWA TRYBY PRACY.
  //
  //   DEMO  Wszystkie odcinki płyną stałą prędkością bazową, niezależnie od
  //         czegokolwiek. Tryb prezentacyjny: schemat ma wyglądać żywo także
  //         wtedy, gdy instalacja stoi. Włączany świadomie przyciskiem, który
  //         mówi o sobie wprost.
  //
  //   NA ŻYWO  Każdy odcinek idzie za SWOIM przepływomierzem. Odcinek, który
  //         przepływomierza nie ma, NIE ANIMUJE SIĘ WCALE — nie zgadujemy
  //         przepływu i nie pożyczamy go z innego obiegu.
  for (const element of root.querySelectorAll<SVGElement>('[data-flow]')) {
    const sourceId = element.dataset.flowSource;

    if (opts.przeplywDemo !== null && opts.przeplywDemo !== undefined) {
      element.dataset.flowSpeed = String(V_DEMO);
      setState(element, 'is-flowing');
      continue;
    }

    const point = sourceId ? points.get(sourceId) : undefined;
    const value = sourceId ? values[sourceId] : undefined;
    const status = statusOf(point, value, staleAfterMs, now, channelAlive);

    // Brak przypisanego przepływomierza albo brak z niego pomiaru: zdejmujemy
    // atrybut, więc animacja pomija ten odcinek. Rura bazowa zostaje.
    if (!sourceId || status === 'not-connected' || status === 'no-data' || value?.v == null) {
      delete element.dataset.flowSpeed;
      setState(element, 'is-still');
      continue;
    }

    const flow = value.v;

    /*
     * PRZEPŁYW ZWROTNY TO AWARIA, NIE KIERUNEK.
     *
     * Ujemna wartość z przepływomierza znaczy albo odwrotny montaż przyrządu
     * (AXIOMA zgłasza wtedy błąd 0002), albo cofkę w obiegu. Zatrzymujemy
     * animację i znaczymy odcinek. Puszczenie strumienia „do tyłu" czytałoby
     * się jako błąd rysowania, a nie jako informacja o instalacji.
     */
    if (flow < 0) {
      element.dataset.flowSpeed = '0';
      setState(element, 'is-reverse');
      continue;
    }

    if (flow < PROG_MARTWY_M3H) {
      // ZEROWY PRZEPŁYW TO BRAK RUCHU, nie ruch wolny. Wolno sunąca kreska
      // sugerowałaby, że coś płynie — a nic nie płynie. Wygaszenie warstw
      // strumienia rozłoży w czasie sama animacja.
      element.dataset.flowSpeed = '0';
      setState(element, 'is-still');
      continue;
    }

    element.dataset.flowSpeed = predkoscStrumienia(flow, opts.flowFullSpeed).toFixed(1);
    setState(element, 'is-flowing');
  }

  // --- Pasek naładowania pod zbiornikiem -----------------------------------
  //
  // Prosty tor i wypełnienie od lewej, procent wyrównany do prawej krawędzi
  // zbiornika. Szerokość toru czytamy Z RYSUNKU (`data-soc-track`), a nie
  // z kodu: po przerysowaniu schematu pasek dopasuje się sam.
  //
  // Brak odczytu to KRESKA i pusty tor, nigdy zero procent. „0%" znaczyłoby
  // „magazyn rozładowany", czyli konkretny stan instalacji — a my w tej chwili
  // po prostu nie wiemy, w jakim jest.
  const tor = root.querySelector<SVGRectElement>('[data-soc-track]');
  const wypelnienie = root.querySelector<SVGRectElement>('[data-soc-fill]');
  const napis = root.querySelector<SVGElement>('[data-soc-text]');

  if (tor && wypelnienie) {
    const szerokosc = Number(tor.getAttribute('width') ?? 0);
    const udzial =
      opts.naladowanie === null || opts.naladowanie === undefined
        ? null
        : Math.min(1, Math.max(0, opts.naladowanie));
    wypelnienie.setAttribute('width', udzial === null ? '0' : (szerokosc * udzial).toFixed(2));
    wypelnienie.classList.toggle('is-no-data', udzial === null);
  }
  if (napis) {
    napis.textContent =
      opts.naladowanie === null || opts.naladowanie === undefined
        ? NO_DATA
        : `${Math.round(Math.min(1, Math.max(0, opts.naladowanie)) * 100)}%`;
  }

  // --- Stany binarne -------------------------------------------------------
  for (const element of root.querySelectorAll<SVGElement>('[data-state]')) {
    const id = element.dataset.state;
    if (!id) continue;

    const point = points.get(id);
    const value = values[id];
    const status = statusOf(point, value, staleAfterMs, now, channelAlive);

    if (status === 'ok') {
      setState(element, value!.v === 0 ? 'is-inactive' : 'is-active');
    } else {
      // Nie wiemy, czy pracuje. To NIE to samo co "nie pracuje".
      setState(element, 'is-unknown');
    }
  }

  // --- Elementy chowane przy przestarzałej wartości ------------------------
  for (const element of root.querySelectorAll<SVGElement>('[data-stale-hide]')) {
    const id = element.dataset.staleHide || element.dataset.point;
    if (!id) continue;

    const value = values[id];
    const hide = !value || value.v === null || isStale(value, staleAfterMs, now, channelAlive);
    element.classList.toggle('is-hidden', hide);
  }
}
