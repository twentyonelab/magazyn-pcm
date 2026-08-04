/**
 * STRUMIEŃ — animacja przepływu na schemacie instalacji.
 *
 * Długie miękkie segmenty z poświatą, sunące po rurze. Specyfikacja od
 * projektanta (2026-08-04); ten plik jest jej wykonaniem.
 *
 * ============================================================================
 * CO ZASTĄPIŁ I ILE TO KOSZTOWAŁO
 * ============================================================================
 * Poprzednia wersja („Oddech") budowała impuls z K = 20 podsegmentów, każdy
 * w dwóch warstwach, każdy z własnym rozmyciem dobieranym z puli sześciu
 * filtrów. Przy ośmiu rurach i kilku impulsach na rurę dawało to około
 * DWÓCH TYSIĘCY filtrowanych ścieżek w dokumencie i tyle samo zapisów
 * atrybutu w każdej klatce.
 *
 * Tutaj rura ma DWIE ścieżki: poświatę i rdzeń. Osiem rur to szesnaście
 * ścieżek i jeden wspólny filtr rozmycia na cały dokument. Kreskowanie robi
 * to, co wcześniej robiła ręcznie zbudowana obwiednia jasności — a robi to
 * silnik rasteryzacji, nie pętla JavaScriptu.
 *
 * W PĘTLI ZMIENIA SIĘ WYŁĄCZNIE `stroke-dashoffset` I `opacity` POŚWIATY.
 * Grubość kreski, wzór kreskowania i filtr wchodzą raz, przy budowie. To nie
 * jest szczegół: animowanie `filter`, `stroke-width` albo `d` wymusza
 * przeliczenie filtra w każdej klatce i to jest cała różnica między 60 a 20 fps.
 *
 * ============================================================================
 * SKĄD BIERZE SIĘ PRĘDKOŚĆ
 * ============================================================================
 * Z atrybutu `data-flow-speed` na ścieżce rury, w pikselach na sekundę.
 * Wpisuje go `bindSchema`, bo to ONA zna metry sześcienne na godzinę, profil
 * obiegu i tryb pokazowy. Ten moduł nie wie, co to przepływomierz — dostaje
 * liczbę px/s i tyle. Dzięki temu podmiana źródła pomiaru nie dotyka animacji,
 * a zmiana wyglądu animacji nie dotyka warstwy danych.
 *
 *   atrybutu NIE MA   → odcinek bez przypisanego przepływomierza: NIE ANIMUJE
 *                       SIĘ NIGDY. Zgadnięty ruch na schemacie badawczym jest
 *                       gorszy od nieruchomej rury.
 *   "0"               → przepływ poniżej progu martwego albo zwrotny:
 *                       animacja stoi, warstwy gasną łagodnie, rura zostaje.
 *   liczba > 0        → prędkość docelowa; dochodzimy do niej wygładzaniem.
 *
 * ============================================================================
 * KIERUNEK JEST WŁASNOŚCIĄ TOPOLOGII
 * ============================================================================
 * Ustalany RAZ, przy budowie, z klasy `tube__flow--wspak` w rysunku — ta
 * mówi, że Illustrator zapisał ścieżkę od strony urządzenia, a płyn idzie
 * odwrotnie (patrz `narzedzia/wepnij-kontrakt.mjs`, gdzie kierunki wynikają
 * ze strzałek na rysunku projektanta). Znak nie jest liczony w pętli i nie
 * zależy od żadnego odczytu, więc nie ma jak zamigotać między klatkami.
 *
 * Przepływ ZWROTNY to stan awaryjny, nie kierunek: `bindSchema` podaje wtedy
 * prędkość zero i znaczy odcinek klasą `is-reverse`. Animacja „do tyłu"
 * czytałaby się na schemacie jako błąd rysowania, a nie jako informacja
 * o instalacji.
 */

/* --- Parametry (ze specyfikacji) ------------------------------------------ */

/** Długość segmentu strumienia i przerwy między segmentami, w px ścieżki. */
const KRESKA = 46;
const PRZERWA = 30;
/** Okres wzoru kreskowania. Faza liczy się modulo tę wartość. */
const OKRES = KRESKA + PRZERWA;

/** Grubości kreski: poświata szersza, rdzeń węższy. */
const GRUBOSC_POSWIATY = 7;
const GRUBOSC_RDZENIA = 3.2;

/** Rozmycie poświaty — JEDEN filtr na cały dokument. */
const ROZMYCIE = 3.2;
const FILTR_ID = 'strumien-poswiata';

/** Wygładzanie prędkości: tyle drogi do wartości docelowej na klatkę. */
const LERP_PREDKOSCI = 0.08;

/** Czas pełnego wygaszenia i rozjaśnienia warstw strumienia (sekundy). */
const CZAS_WYGASZENIA_S = 0.6;

/** Krycie rdzenia. Poświata oddycha wokół wartości bazowej — patrz pętla. */
const KRYCIE_RDZENIA = 0.92;
const KRYCIE_POSWIATY_BAZA = 0.62;
const KRYCIE_POSWIATY_AMPLITUDA = 0.18;

/**
 * Amplituda falowania tempa. Jedyne źródło wrażenia „strumień oddycha" —
 * geometria zostaje prosta, ścieżka nie jest deformowana.
 */
const FALOWANIE = 0.16;

const NS = 'http://www.w3.org/2000/svg';

/* --- Filtr --------------------------------------------------------------- */

/**
 * Zakłada w `<defs>` JEDEN filtr rozmycia i zwraca odwołanie do niego.
 *
 * Pole filtra musi być większe niż domyślne 110 %, bo rozmycie wychodzi poza
 * obrys ścieżki — inaczej poświata jest obcięta prostokątem i widać jej
 * krawędź.
 */
function filtrPoswiaty(svg: SVGSVGElement): string {
  if (!svg.querySelector(`#${FILTR_ID}`)) {
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(NS, 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    const filtr = document.createElementNS(NS, 'filter');
    filtr.setAttribute('id', FILTR_ID);
    filtr.setAttribute('x', '-60%');
    filtr.setAttribute('y', '-60%');
    filtr.setAttribute('width', '220%');
    filtr.setAttribute('height', '220%');
    const blur = document.createElementNS(NS, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', String(ROZMYCIE));
    filtr.appendChild(blur);
    defs.appendChild(filtr);
  }
  return `url(#${FILTR_ID})`;
}

/* --- Budowa rur ---------------------------------------------------------- */

interface Rura {
  /** Ścieżka wzorcowa z kontraktu — z niej idzie `d`, rola i kierunek. */
  zrodlo: SVGPathElement;
  poswiata: SVGPathElement;
  rdzen: SVGPathElement;
  /** +1 = zgodnie z zapisem ścieżki, −1 = wspak. STAŁA odcinka. */
  kierunek: 1 | -1;
  /** Przebyta droga w px ścieżki — rośnie tylko wtedy, gdy odcinek płynie. */
  faza: number;
  /** Bieżąca prędkość px/s; dochodzi do docelowej wygładzaniem. */
  predkosc: number;
  /** Mnożnik krycia, 0..1 — wygaszanie i rozjaśnianie w czasie. */
  jasnosc: number;
  /** Ostatnio zapisane krycie warstw; zapis pomijamy, gdy się nie zmieniło. */
  zapisanaPoswiata: number;
  zapisanyRdzen: number;
}

function zbudujRure(zrodlo: SVGPathElement, grupa: SVGGElement, filtr: string): Rura | null {
  const d = zrodlo.getAttribute('d');
  if (!d) return null;

  const wspolne = (el: SVGPathElement, klasa: string, grubosc: number): void => {
    el.setAttribute('d', d);
    el.setAttribute('fill', 'none');
    el.setAttribute('class', klasa);
    el.setAttribute('stroke-width', String(grubosc));
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('stroke-dasharray', `${KRESKA} ${PRZERWA}`);
    // Podpowiedź dla przeglądarki: z tych dwóch ścieżek zmieni się offset.
    // Bez niej każda klatka trafia do warstwy rysowanej razem z resztą rysunku.
    el.style.willChange = 'stroke-dashoffset';
    el.style.opacity = '0';
    grupa.appendChild(el);
  };

  const rola = zrodlo.classList.contains('tube__flow--supply') ? 'supply' : 'return';

  const poswiata = document.createElementNS(NS, 'path');
  wspolne(poswiata, `strumien strumien--glow strumien--${rola}`, GRUBOSC_POSWIATY);
  poswiata.setAttribute('filter', filtr);

  const rdzen = document.createElementNS(NS, 'path');
  wspolne(rdzen, `strumien strumien--core strumien--${rola}`, GRUBOSC_RDZENIA);

  return {
    zrodlo,
    poswiata,
    rdzen,
    kierunek: zrodlo.classList.contains('tube__flow--wspak') ? -1 : 1,
    faza: 0,
    predkosc: 0,
    jasnosc: 0,
    zapisanaPoswiata: -1,
    zapisanyRdzen: -1,
  };
}

/* --- Uruchomienie -------------------------------------------------------- */

export interface Strumien {
  /** Zatrzymuje pętlę i usuwa warstwę strumienia. */
  zatrzymaj: () => void;
  /** Ostatni pomiar klatek na sekundę albo null przed pierwszą sekundą. */
  fps: () => number | null;
}

/**
 * Włącza Strumień w podanym schemacie. Zwraca uchwyt do zatrzymania —
 * wywołaj go przy odmontowaniu widoku, inaczej pętla zostaje w tle.
 */
export function wlaczStrumien(root: ParentNode): Strumien | null {
  const svg = root.querySelector('svg.schema');
  if (!(svg instanceof SVGSVGElement)) return null;

  const warstwa = svg.querySelector('#warstwa-przeplywu');
  if (!warstwa) return null;

  const filtr = filtrPoswiaty(svg);

  const grupa = document.createElementNS(NS, 'g');
  grupa.setAttribute('id', 'warstwa-strumienia');
  grupa.setAttribute('fill', 'none');
  warstwa.parentNode?.insertBefore(grupa, warstwa.nextSibling);

  const rury: Rura[] = [];
  for (const el of warstwa.querySelectorAll<SVGPathElement>('path[data-flow]')) {
    const rura = zbudujRure(el, grupa, filtr);
    if (rura) rury.push(rura);
  }
  if (rury.length === 0) {
    grupa.remove();
    return null;
  }

  /*
   * OGRANICZONY RUCH — statyczne kreski, nie pusta rura.
   *
   * Wyłączone animacje w systemie nie znaczą „nie chcę wiedzieć, którędy
   * płynie". Rysujemy więc wzór strumienia raz i nie ruszamy go: kierunek
   * i przebieg zostają czytelne, tylko nic się nie przesuwa.
   */
  const bezRuchu = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (bezRuchu) {
    for (const rura of rury) {
      rura.poswiata.setAttribute('stroke-dashoffset', '0');
      rura.rdzen.setAttribute('stroke-dashoffset', '0');
      rura.poswiata.style.opacity = String(KRYCIE_POSWIATY_BAZA);
      rura.rdzen.style.opacity = String(KRYCIE_RDZENIA);
      // Bez pętli nie ma czego oszczędzać, a `will-change` trzymałoby warstwę
      // kompozycji dla ścieżek, które nigdy się nie zmienią.
      rura.poswiata.style.willChange = '';
      rura.rdzen.style.willChange = '';
    }
    return { zatrzymaj: () => grupa.remove(), fps: () => null };
  }

  let raf = 0;
  let poprzedniaKlatka: number | null = null;
  let t = 0;
  let klatki = 0;
  let odKlatek = 0;
  let fps: number | null = null;
  /** Czy schemat jest w widoku. Zaczynamy od `true`: obserwator odpowie w tej
   *  samej klatce, a zaczynanie od `false` dawałoby mrugnięcie na wejściu. */
  let widoczny = true;
  let biegnie = false;

  const krok = (teraz: number): void => {
    raf = requestAnimationFrame(krok);

    // Pierwsza klatka po wznowieniu nie ma sensownego `dt` — przerwa mogła
    // trwać minuty. Bez tego strumień skakałby o setki pikseli.
    if (poprzedniaKlatka === null) {
      poprzedniaKlatka = teraz;
      odKlatek = teraz;
      return;
    }
    const dt = Math.min((teraz - poprzedniaKlatka) / 1000, 0.05);
    poprzedniaKlatka = teraz;
    t += dt;

    klatki += 1;
    if (teraz - odKlatek >= 1000) {
      fps = Math.round((klatki * 1000) / (teraz - odKlatek));
      klatki = 0;
      odKlatek = teraz;
    }

    // Wspólna faza czasu dla całego schematu — jeden zegar, więc rozjazd
    // między rurami jest niemożliwy.
    const falowanie = 1 + FALOWANIE * Math.sin(t * 0.9);
    const oddechPoswiaty =
      KRYCIE_POSWIATY_BAZA + KRYCIE_POSWIATY_AMPLITUDA * Math.sin(t * 1.4);
    const krokJasnosci = dt / CZAS_WYGASZENIA_S;

    for (const rura of rury) {
      /*
       * PRĘDKOŚĆ CZYTANA Z RYSUNKU, nie liczona tutaj. Brak atrybutu znaczy
       * „ten odcinek nie ma przepływomierza" i wtedy nie animujemy go nigdy —
       * ani w trybie na żywo, ani po zgaśnięciu innych rur.
       */
      const zapis = rura.zrodlo.dataset.flowSpeed;
      const cel = zapis === undefined ? 0 : Number(zapis);
      const docelowa = Number.isFinite(cel) && cel > 0 ? cel : 0;

      // Prędkość dochodzi do wartości docelowej wygładzaniem: bez tego każda
      // aktualizacja z Miniservera szarpałaby strumieniem.
      rura.predkosc += (docelowa - rura.predkosc) * LERP_PREDKOSCI;
      if (docelowa === 0 && rura.predkosc < 0.05) rura.predkosc = 0;

      const chceSwiecic = docelowa > 0;
      rura.jasnosc = chceSwiecic
        ? Math.min(1, rura.jasnosc + krokJasnosci)
        : Math.max(0, rura.jasnosc - krokJasnosci);

      if (rura.jasnosc === 0) {
        // Zgaszona rura nie dostaje ani jednego zapisu do DOM. Rura bazowa
        // zostaje widoczna — gaśnie tylko strumień.
        if (rura.zapisanaPoswiata !== 0) {
          rura.poswiata.style.opacity = '0';
          rura.rdzen.style.opacity = '0';
          rura.zapisanaPoswiata = 0;
          rura.zapisanyRdzen = 0;
        }
        continue;
      }

      rura.faza += rura.predkosc * dt * falowanie;
      // Modulo trzyma fazę w jednym okresie wzoru. Bez tego po godzinie pracy
      // `stroke-dashoffset` sięgałby setek tysięcy i traciłby precyzję.
      if (rura.faza >= OKRES) rura.faza %= OKRES;

      const offset = -rura.kierunek * rura.faza;
      const zapisOffsetu = offset.toFixed(2);
      rura.poswiata.setAttribute('stroke-dashoffset', zapisOffsetu);
      rura.rdzen.setAttribute('stroke-dashoffset', zapisOffsetu);

      const kryciePoswiaty = Number((oddechPoswiaty * rura.jasnosc).toFixed(3));
      const krycieRdzenia = Number((KRYCIE_RDZENIA * rura.jasnosc).toFixed(3));
      if (kryciePoswiaty !== rura.zapisanaPoswiata) {
        rura.poswiata.style.opacity = String(kryciePoswiaty);
        rura.zapisanaPoswiata = kryciePoswiaty;
      }
      if (krycieRdzenia !== rura.zapisanyRdzen) {
        rura.rdzen.style.opacity = String(krycieRdzenia);
        rura.zapisanyRdzen = krycieRdzenia;
      }
    }
  };

  const uruchom = (): void => {
    if (biegnie) return;
    biegnie = true;
    poprzedniaKlatka = null;
    raf = requestAnimationFrame(krok);
  };

  const wstrzymaj = (): void => {
    if (!biegnie) return;
    biegnie = false;
    cancelAnimationFrame(raf);
    fps = null;
  };

  /**
   * Pętla chodzi tylko wtedy, gdy jest po co: karta na wierzchu I schemat
   * w widoku. Sama karta w tle nie wystarcza — `requestAnimationFrame` jest
   * wtedy wstrzymywany przez przeglądarkę, ale strumień poza kadrem (zjechany
   * schemat, otwarta zakładka niżej) rysowałby się dalej.
   */
  const przelicz = (): void => {
    if (!document.hidden && widoczny) uruchom();
    else wstrzymaj();
  };

  const naWidocznosc = (): void => przelicz();
  document.addEventListener('visibilitychange', naWidocznosc);

  const obserwator = new IntersectionObserver(
    (wpisy) => {
      widoczny = wpisy.some((w) => w.isIntersecting);
      przelicz();
    },
    { threshold: 0 },
  );
  obserwator.observe(svg);

  przelicz();

  return {
    zatrzymaj: () => {
      wstrzymaj();
      obserwator.disconnect();
      document.removeEventListener('visibilitychange', naWidocznosc);
      grupa.remove();
    },
    fps: () => fps,
  };
}
