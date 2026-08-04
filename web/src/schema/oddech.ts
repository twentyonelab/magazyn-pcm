/**
 * ODDECH — animacja przepływu w schemacie.
 *
 * Impuls świetlny sunący po rurze, którego głowa i ogon wtapiają się w rurę
 * bez twardej krawędzi. Specyfikacja od projektanta (2026-08-04) wraz
 * z parametrami zatwierdzonymi wizualnie; ten plik jest jej wykonaniem.
 *
 * DLACZEGO NIE CSS. Poprzednia wersja animowała `stroke-dashoffset` regułą
 * `@keyframes` na każdej rurze osobno. Wystarczyło przełączyć zakładkę
 * i impulsy rozjeżdżały się między rurami, bo każda animacja miała własną
 * fazę czasu. Tutaj JEDNA pętla `requestAnimationFrame` liczy wspólny czas
 * dla całego schematu, więc rozjazd jest niemożliwy.
 *
 * DLACZEGO PULA FILTRÓW. Impuls to łańcuch K podsegmentów, każdy z innym
 * rozmyciem. Osobny `feGaussianBlur` na podsegment dawałby przy tym schemacie
 * ~320 filtrowanych ścieżek i przeglądarka nie utrzymuje na tym 60 fps.
 * Rozmycie jest więc SKWANTOWANE do sześciu poziomów i filtry są wspólne dla
 * całego dokumentu.
 *
 * W PĘTLI USTAWIAMY TYLKO `stroke-dashoffset` I `opacity`. Grubość kreski
 * i filtr wchodzą raz, przy budowie — ich zmiana w pętli wymusza przeliczenie
 * filtra w każdej klatce i to jest dokładnie ta różnica między 60 a 20 fps.
 */

/* --- Parametry (zatwierdzone wizualnie) ----------------------------------- */

/** Podsegmentów na impuls. */
const K = 20;
/** Długość impulsu w pikselach ścieżki. */
const PULSE = 232;
/**
 * Odstęp między głowami kolejnych impulsów. MNIEJSZY OD DŁUGOŚCI IMPULSU
 * i to jest zamierzone: impulsy zachodzą na siebie i dają ciągły, oddychający
 * strumień zamiast osobnych błysków.
 */
const SPACING = 205;
/** Mnożnik rozmycia na końcach impulsu względem jego środka. */
const BLUR = 6;
/** Mnożnik prędkości; baza to 44 px/s. */
const SPEED = 1.05;
const BAZOWA_PREDKOSC = 44;

/** Ile poziomów rozmycia trzyma pula filtrów. */
const POZIOMY_ROZMYCIA = 6;

const NS = 'http://www.w3.org/2000/svg';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/* --- Pula filtrów --------------------------------------------------------- */

/**
 * Tworzy w `<defs>` dwa razy sześć filtrów rozmycia i zwraca funkcję
 * dobierającą identyfikator dla żądanej miękkości.
 */
function pulaFiltrow(svg: SVGSVGElement): (warstwa: 'glow' | 'core', soft: number) => string {
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  // Identyfikatory noszą przedrostek, bo ten sam dokument trzyma też filtry
  // z pliku projektanta i gradienty schematu.
  const stworz = (id: string, odchylenie: number): void => {
    if (svg.querySelector(`#${id}`)) return;
    const filtr = document.createElementNS(NS, 'filter');
    filtr.setAttribute('id', id);
    // Rozmycie wychodzi poza obrys ścieżki, więc pole filtra musi być większe
    // niż domyślne 110% — inaczej poświata jest obcięta prostokątem.
    filtr.setAttribute('x', '-120%');
    filtr.setAttribute('y', '-120%');
    filtr.setAttribute('width', '340%');
    filtr.setAttribute('height', '340%');
    const blur = document.createElementNS(NS, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', odchylenie.toFixed(2));
    filtr.appendChild(blur);
    defs!.appendChild(filtr);
  };

  for (let i = 0; i < POZIOMY_ROZMYCIA; i += 1) {
    const soft = 1 + ((BLUR - 1) * i) / (POZIOMY_ROZMYCIA - 1);
    stworz(`oddech-glow-${i}`, 2.6 * soft);
    stworz(`oddech-core-${i}`, 0.9 * soft);
  }

  return (warstwa, soft) => {
    const udzial = (soft - 1) / (BLUR - 1);
    const poziom = Math.min(
      POZIOMY_ROZMYCIA - 1,
      Math.max(0, Math.round(udzial * (POZIOMY_ROZMYCIA - 1))),
    );
    return `url(#oddech-${warstwa}-${poziom})`;
  };
}

/* --- Budowa łańcuchów ----------------------------------------------------- */

interface Podsegment {
  el: SVGPathElement;
  /** Jasność w profilu dzwonowym, 0..1 — z niej liczy się krycie w pętli. */
  bell: number;
  /** Przesunięcie tego podsegmentu wewnątrz impulsu, w px ścieżki. */
  offset: number;
}

interface Rura {
  /** Ścieżka wzorcowa z kontraktu — daje `d`, rolę i długość. */
  zrodlo: SVGPathElement;
  dlugosc: number;
  liczbaImpulsow: number;
  /** Podsegmenty wszystkich impulsów tej rury, po kolei. Puste, dopóki rura nie płynęła. */
  segmenty: Podsegment[];
  /** Czy w tej chwili płynie — ustawia bindSchema klasą `is-flowing`. */
  plynie: boolean;
  /** Dobudowuje podsegmenty przy pierwszym przepływie. */
  zbuduj: () => void;
}

/**
 * Przygotowuje rurę. Podsegmentów NIE tworzy od razu.
 *
 * Ścieżka z kontraktu (`[data-flow]`) zostaje jako rura bazowa — impulsy
 * dorysowujemy nad nią jako osobne elementy, więc podmiana rysunku niczego
 * tu nie psuje: wystarczy zbudować od nowa.
 *
 * BUDOWA JEST LENIWA, bo jeden impuls to K × 2 filtrowanych ścieżek, a przy
 * ośmiu rurach wychodzi ich dwa tysiące. Dopóki przepływ wynosi zero — a taki
 * jest przez większość czasu na stanowisku — nie ma po co ich tworzyć: nie
 * widać ich, a i tak kosztują pamięć i czas składania. Pierwszy przepływ
 * dobudowuje je raz i zostają.
 */
function zbudujRure(
  zrodlo: SVGPathElement,
  grupa: SVGGElement,
  filtr: (warstwa: 'glow' | 'core', soft: number) => string,
): Rura | null {
  const d = zrodlo.getAttribute('d');
  if (!d) return null;

  const dlugosc = zrodlo.getTotalLength();
  if (!Number.isFinite(dlugosc) || dlugosc <= 0) return null;

  const liczbaImpulsow = Math.ceil((dlugosc + 2 * PULSE) / SPACING) + 1;
  const rola = zrodlo.classList.contains('tube__flow--supply') ? 'supply' : 'return';
  const segmenty: Podsegment[] = [];

  const zbuduj = (): void => {
  for (let q = 0; q < liczbaImpulsow; q += 1) {
    for (let i = 0; i < K; i += 1) {
      const u = (i + 0.5) / K;
      const bell = Math.sin(Math.PI * u) ** 2.1;
      const soft = 1 + (BLUR - 1) * (1 - bell) ** 1.4;

      // PODSEGMENTY MUSZĄ ZACHODZIĆ NA SIEBIE. Przy współczynniku 1,3 w ostrym
      // rdzeniu impulsu widać paciorkowanie — osobne kropki zamiast linii.
      // 1,6 zamyka szczelinę; sprawdzone przy BLUR = 1, gdzie artefakt jest
      // najlepiej widoczny.
      const kreska = (PULSE / K) * 1.6;
      const przerwa = dlugosc + 2 * PULSE;

      for (const warstwa of ['glow', 'core'] as const) {
        const el = document.createElementNS(NS, 'path');
        el.setAttribute('d', d);
        el.setAttribute('fill', 'none');
        el.setAttribute('stroke-linecap', 'round');
        el.setAttribute('class', `oddech oddech--${warstwa} oddech--${rola}`);
        el.setAttribute(
          'stroke-width',
          (warstwa === 'glow' ? 3.5 + 7.5 * bell : 1 + 2.6 * bell).toFixed(2),
        );
        el.setAttribute('stroke-dasharray', `${kreska.toFixed(2)} ${przerwa.toFixed(2)}`);
        el.setAttribute('filter', filtr(warstwa, soft));
        el.style.opacity = '0';
        grupa.appendChild(el);

        segmenty.push({ el, bell, offset: (i * PULSE) / K });
      }
    }
  }
  };

  return { zrodlo, dlugosc, liczbaImpulsow, segmenty, plynie: false, zbuduj };
}

/* --- Uruchomienie --------------------------------------------------------- */

export interface Oddech {
  /** Zatrzymuje pętlę i usuwa warstwę impulsów. */
  zatrzymaj: () => void;
  /** Ostatni pomiar liczby klatek na sekundę albo null przed pierwszą sekundą. */
  fps: () => number | null;
}

/**
 * Włącza Oddech w podanym schemacie. Zwraca uchwyt do zatrzymania —
 * wywołaj go przy odmontowaniu widoku, inaczej pętla zostaje w tle.
 */
export function wlaczOddech(root: ParentNode): Oddech | null {
  const svg = root.querySelector('svg.schema');
  if (!(svg instanceof SVGSVGElement)) return null;

  const warstwa = svg.querySelector('#warstwa-przeplywu');
  if (!warstwa) return null;

  const filtr = pulaFiltrow(svg);

  const grupa = document.createElementNS(NS, 'g');
  grupa.setAttribute('id', 'warstwa-oddechu');
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

  let raf = 0;
  let start: number | null = null;
  let klatki = 0;
  let odKlatek = 0;
  let fps: number | null = null;

  const krok = (teraz: number): void => {
    raf = requestAnimationFrame(krok);
    if (start === null) {
      start = teraz;
      odKlatek = teraz;
    }
    const t = (teraz - start) / 1000;

    klatki += 1;
    if (teraz - odKlatek >= 1000) {
      fps = Math.round((klatki * 1000) / (teraz - odKlatek));
      klatki = 0;
      odKlatek = teraz;
    }

    // Wspólna faza czasu dla całego schematu: lekkie falowanie tempa
    // i oddech krycia całego strumienia.
    const travel = t * BAZOWA_PREDKOSC * SPEED * (1 + 0.14 * Math.sin(t * 0.85));
    const breath = 0.8 + 0.3 * Math.sin(t * 0.9);

    for (const rura of rury) {
      // Klasę `is-flowing` ustawia bindSchema z pomiaru przepływu — Oddech
      // tylko ją czyta, żeby nie mieć drugiego źródła prawdy o tym, czy płynie.
      const plynie = rura.zrodlo.classList.contains('is-flowing');
      if (plynie !== rura.plynie) {
        rura.plynie = plynie;
        if (plynie && rura.segmenty.length === 0) rura.zbuduj();
        if (!plynie) for (const s of rura.segmenty) s.el.style.opacity = '0';
      }
      if (!plynie || rura.segmenty.length === 0) continue;

      const okres = rura.liczbaImpulsow * SPACING;
      let indeks = 0;

      for (let q = 0; q < rura.liczbaImpulsow; q += 1) {
        const head = ((travel + q * SPACING) % okres) - PULSE;
        // Wygaszenie na wjeździe w odcinek i na wyjeździe z niego — bez tego
        // impuls pojawia się i znika skokiem na końcach rury.
        const edge = clamp01(
          Math.min(1, (head + PULSE) / 80, (rura.dlugosc - head) / 80),
        );
        const a = edge * breath;

        for (let i = 0; i < K; i += 1) {
          const przesuniecie = -(head + (i * PULSE) / K);
          const glow = rura.segmenty[indeks];
          const core = rura.segmenty[indeks + 1];
          indeks += 2;
          if (!glow || !core) continue;

          glow.el.setAttribute('stroke-dashoffset', przesuniecie.toFixed(1));
          core.el.setAttribute('stroke-dashoffset', przesuniecie.toFixed(1));
          glow.el.style.opacity = (0.6 * glow.bell * a).toFixed(3);
          core.el.style.opacity = (0.62 * core.bell * a).toFixed(3);
        }
      }
    }
  };

  raf = requestAnimationFrame(krok);

  return {
    zatrzymaj: () => {
      cancelAnimationFrame(raf);
      grupa.remove();
    },
    fps: () => fps,
  };
}
