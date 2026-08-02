/**
 * Wyciąga opis sceny 3D z TEGO SAMEGO PLIKU SVG, który rysuje widok 2D.
 *
 * DLACZEGO TAK, A NIE OSOBNY UKŁAD W KODZIE:
 * gdyby scena 3D miała własne współrzędne, po pierwszej przebudowie rysunku
 * oba widoki rozjechałyby się i nikt by tego nie zauważył. Tutaj jest jedno
 * źródło prawdy — plik SVG. Podmieniasz rysunek, oba widoki idą za nim.
 *
 * Czytane atrybuty opisane są w komentarzu na początku schema.svg.
 */

/** Prostokąt w przestrzeni SVG. */
export interface SvgBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneObject extends SvgBox {
  /** Identyfikator bryły (data-object). */
  id: string;
  label: string;
  /** Wysokość bryły w jednostkach świata. */
  height: number;
  /** true = zbiornik, rysowany jako przejrzysty, z zawartością w środku. */
  vessel: boolean;
  /** Punkt stanu binarnego, jeśli bryła go ma (data-state na grupie). */
  statePoint: string | null;
}

export interface SceneSensor extends SvgBox {
  /** Identyfikator punktu pomiarowego (data-fill-point). */
  pointId: string;
  height: number;
  /** Bryła, w której sonda się znajduje, jeśli jest w jakiejś zamknięta. */
  vesselId: string | null;
}

export interface ScenePipe {
  /** Kolejne punkty łamanej w przestrzeni SVG. */
  points: Array<[number, number]>;
  /** Punkt, z którego bierze się prędkość przepływu. */
  flowSource: string | null;
  /** true = gałąź powrotna (rysowana chłodniej). */
  isReturn: boolean;
}

export interface Scene {
  viewBox: { width: number; height: number };
  objects: SceneObject[];
  sensors: SceneSensor[];
  pipes: ScenePipe[];
}

const DEFAULT_SENSOR_HEIGHT = 1.9;
const DEFAULT_OBJECT_HEIGHT = 2.4;

function num(value: string | null | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Prostokąt otaczający kształt.
 *
 * Obsługuje prostokąt, okrąg i elipsę, bo na schemacie bryłą 3D bywa każde
 * z nich — pompa obiegowa jest kółkiem, filtr soczewką. Bez tego okrąg dawał
 * pudełko {0,0,0,0}, czyli bryłę zerowej wielkości wciśniętą w punkt zerowy
 * układu, i psuł całą scenę zamiast tylko jednego obiektu.
 */
function boxOf(element: Element): SvgBox {
  const nazwa = element.tagName.toLowerCase();

  if (nazwa === 'circle') {
    const cx = num(element.getAttribute('cx'), 0);
    const cy = num(element.getAttribute('cy'), 0);
    const r = num(element.getAttribute('r'), 0);
    return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
  }

  if (nazwa === 'ellipse') {
    const cx = num(element.getAttribute('cx'), 0);
    const cy = num(element.getAttribute('cy'), 0);
    const rx = num(element.getAttribute('rx'), 0);
    const ry = num(element.getAttribute('ry'), 0);
    return { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 };
  }

  return {
    x: num(element.getAttribute('x'), 0),
    y: num(element.getAttribute('y'), 0),
    w: num(element.getAttribute('width'), 0),
    h: num(element.getAttribute('height'), 0),
  };
}

/**
 * Parser ścieżki obsługujący polecenia M, L, H, V (bezwzględne i względne).
 *
 * Świadomie NIE obsługuje krzywych: rury na schemacie są prostokątne, a pełny
 * parser SVG to biblioteka, nie funkcja. Jeśli rysunek dostanie kiedyś łuki,
 * ten parser trzeba rozszerzyć — i lepiej, żeby to było widoczne tutaj, niż
 * żeby po cichu gubił kształty.
 */
export function parsePolylines(d: string): Array<Array<[number, number]>> {
  const tokens = d.match(/[MmLlHhVv]|-?\d*\.?\d+/g);
  if (!tokens) return [];

  const lines: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  let command = 'M';
  let x = 0;
  let y = 0;
  let index = 0;

  const push = (): void => {
    if (current.length > 1) lines.push(current);
    current = [];
  };

  while (index < tokens.length) {
    const token = tokens[index]!;

    if (/[MmLlHhVv]/.test(token)) {
      command = token;
      index += 1;
      if (command === 'M' || command === 'm') push();
      continue;
    }

    const a = Number(token);

    switch (command) {
      case 'M':
      case 'L':
        x = a;
        y = Number(tokens[index + 1] ?? y);
        index += 2;
        break;
      case 'm':
      case 'l':
        x += a;
        y += Number(tokens[index + 1] ?? 0);
        index += 2;
        break;
      case 'H':
        x = a;
        index += 1;
        break;
      case 'h':
        x += a;
        index += 1;
        break;
      case 'V':
        y = a;
        index += 1;
        break;
      case 'v':
        y += a;
        index += 1;
        break;
      default:
        index += 1;
    }

    current.push([x, y]);
    // Po M kolejne pary współrzędnych są traktowane jak L — zgodnie ze SVG.
    if (command === 'M') command = 'L';
    if (command === 'm') command = 'l';
  }

  push();
  return lines;
}

/** Czy prostokąt `inner` leży w środku `outer`. */
function contains(outer: SvgBox, inner: SvgBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/**
 * Czy ŚRODEK `inner` wypada w `outer`.
 *
 * Do przypisania sondy do zbiornika zawieranie w całości nie nadaje się:
 * na rysunku projektanta kropki sond leżą dokładnie na ściance zbiornika,
 * więc połowa każdej kropki wystaje poza jego obrys i test szczelny
 * odrzucałby wszystkie sondy — w scenie 3D wisiałyby w powietrzu zamiast
 * na walcu. Punkt pomiarowy to środek kropki i on decyduje.
 */
function containsCenter(outer: SvgBox, inner: SvgBox): boolean {
  const cx = inner.x + inner.w / 2;
  const cy = inner.y + inner.h / 2;
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h;
}

/**
 * Wczytuje rysunek do drzewa DOM.
 *
 * Parser XML jest ścisły i przy najmniejszym potknięciu (np. podwójny dywiz
 * w komentarzu, na czym ta funkcja już raz się wywróciła) zwraca drzewo
 * OBCIĘTE do miejsca błędu — bez wyjątku. Efektem była scena 3D bez połowy
 * obiektów i zero śladu w konsoli. Dlatego sprawdzamy jawnie i w razie
 * problemu wracamy do pobłażliwego parsera HTML, głośno o tym mówiąc.
 */
function parseSvg(svgText: string): Document {
  const xml = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const failure = xml.querySelector('parsererror');

  if (!failure) return xml;

  // eslint-disable-next-line no-console
  console.warn(
    'schema.svg nie jest poprawnym XML-em — czytam go pobłażliwym parserem HTML. ' +
      'Widok 2D działa, ale warto to naprawić. Szczegóły: ' +
      failure.textContent?.slice(0, 200),
  );

  return new DOMParser().parseFromString(svgText, 'text/html');
}

export function extractScene(svgText: string): Scene {
  const doc = parseSvg(svgText);
  const svg = doc.querySelector('svg') ?? doc.documentElement;

  // Parser HTML zamienia nazwy atrybutów na małe litery, więc szukamy obu zapisów.
  const viewBoxRaw = svg.getAttribute('viewBox') ?? svg.getAttribute('viewbox') ?? '0 0 1240 700';
  const viewBoxAttr = viewBoxRaw.trim().split(/[\s,]+/).map(Number);
  const viewBox = {
    width: viewBoxAttr[2] && viewBoxAttr[2] > 0 ? viewBoxAttr[2] : 1240,
    height: viewBoxAttr[3] && viewBoxAttr[3] > 0 ? viewBoxAttr[3] : 700,
  };

  // --- Bryły --------------------------------------------------------------
  const objects: SceneObject[] = [...doc.querySelectorAll('[data-object]')].map((element) => {
    const box = boxOf(element);
    const stateHost = element.closest('[data-state]');

    return {
      ...box,
      id: element.getAttribute('data-object') ?? 'obiekt',
      label: element.getAttribute('data-label') ?? '',
      height: num(element.getAttribute('data-h'), DEFAULT_OBJECT_HEIGHT),
      vessel: element.getAttribute('data-vessel') === 'true',
      statePoint: stateHost?.getAttribute('data-state') ?? null,
    };
  });

  // --- Sondy --------------------------------------------------------------
  const sensors: SceneSensor[] = [...doc.querySelectorAll('[data-fill-point]')].map((element) => {
    const box = boxOf(element);
    const vessel = objects.find((candidate) => candidate.vessel && containsCenter(candidate, box));

    return {
      ...box,
      pointId: element.getAttribute('data-fill-point') ?? '',
      height: num(element.getAttribute('data-h'), DEFAULT_SENSOR_HEIGHT),
      vesselId: vessel?.id ?? null,
    };
  });

  // --- Rury ---------------------------------------------------------------
  const pipes: ScenePipe[] = [];
  for (const element of doc.querySelectorAll('[data-flow]')) {
    const d = element.getAttribute('d');
    if (!d) continue;

    // Nazwa klasy zmieniła się przy przejściu na schemat projektanta
    // (`pipe--return` → `tube__flow--return`). Sprawdzamy oba zapisy, bo
    // szukanie samej starej nazwy cicho malowało powroty kolorem zasilania.
    const klasa = element.getAttribute('class') ?? '';
    const isReturn = klasa.includes('--return');
    const flowSource = element.getAttribute('data-flow-source');

    for (const points of parsePolylines(d)) {
      pipes.push({ points, flowSource, isReturn });
    }
  }

  return { viewBox, objects, sensors, pipes };
}
