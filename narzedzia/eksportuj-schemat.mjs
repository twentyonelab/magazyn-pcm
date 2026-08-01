// EKSPORT SCHEMATU DO SAMODZIELNEGO SVG — do recznej edycji w narzedziu
// graficznym.
//
// Plik zrodlowy (web/src/schema/schema.svg) NIE otworzy sie poprawnie poza
// aplikacja: grafiki wskazuje sciezkami /schemat/... (serwuje je aplikacja),
// a style bierze z arkusza aplikacji przez zmienne motywu. Eksport:
//   1. wtapia kazdy PNG do srodka jako data:URI,
//   2. wpisuje potrzebne style z ROZWIAZANYMI kolorami (motyw jasny),
//   3. pokazuje warstwe przeplywu polprzezroczyscie — w aplikacji jest
//      niewidoczna do czasu przeplywu, ale przy edycji trzeba ja widziec.
//
// Tak przygotowany plik dziala tez W DRUGA STRONE: podmieniony z powrotem
// jako web/src/schema/schema.svg zadziala od reki (wtopione grafiki sa dla
// przegladarki tym samym co pliki), POD WARUNKIEM ze edycja nie wytnie
// atrybutow data-* — to one wiaza rysunek z danymi.
//
// Uruchomienie: node narzedzia/eksportuj-schemat.mjs [plik-wyjsciowy]

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TU = dirname(fileURLToPath(import.meta.url));
const ZRODLO = join(TU, '..', 'web', 'src', 'schema', 'schema.svg');
const PUBLIC = join(TU, '..', 'web', 'public');
const WYJSCIE = process.argv[2] ?? join(TU, 'eksport-schemat.svg');

let svg = readFileSync(ZRODLO, 'utf8');

// 1) Wtopienie grafik.
let wtopione = 0;
svg = svg.replace(/href="(\/schemat\/[^"]+)"/g, (_, sciezka) => {
  const dane = readFileSync(join(PUBLIC, sciezka));
  wtopione += 1;
  return `href="data:image/png;base64,${dane.toString('base64')}"`;
});

// 2) Style z rozwiazanymi kolorami motywu jasnego. Warstwa przeplywu widoczna
//    polprzezroczyscie (w aplikacji styruje nia arkusz i dane).
const STYLE = `
  <style>
    /* Style wpisane na potrzeby edycji poza aplikacja (motyw jasny).
       W aplikacji te same klasy stylizuje arkusz przez zmienne motywu. */
    .schema { font-family: 'Segoe UI', system-ui, sans-serif; }
    .label { font-size: 13px; fill: #6b6b68; }
    .label--sm { font-size: 11px; fill: #6b6b68; text-anchor: middle; }
    .meta { font-size: 11px; fill: #a3a3a0; }
    .nakladka { fill: transparent; stroke: transparent; }
    .gauge__stem { stroke: #adada7; stroke-width: 4; fill: none; }
    .valve__arrow { stroke: #a3a3a0; stroke-width: 1.6; stroke-dasharray: 4 4; fill: none; }
    .valve__arrowhead { fill: #a3a3a0; }
    .meter-card__body { fill: #ffffff; stroke: #e6e6e3; stroke-width: 1; }
    .device__led { fill: #a3a3a0; }
    .storage__dot { fill: #2f6b3f; }
    .sensor__hit { fill: none; }
    .sensor__cell { fill: #b0cde0; stroke: #ffffff; stroke-width: 2.5; }
    .sensor__phase { fill: none; stroke: #de7854; stroke-width: 2.5; opacity: 0; }
    .sensor__id { font-size: 10px; font-weight: 600; fill: #a3a3a0; letter-spacing: 0.04em; }
    .sensor__value { font-size: 15px; font-weight: 700; fill: #0d0d0d; }
    .sensor__value--sm { font-size: 12px; font-weight: 600; }
    /* Warstwa przeplywu: w aplikacji niewidoczna do czasu przeplywu. */
    .tube__flow { fill: none; stroke-width: 3.5; stroke-linecap: round; opacity: 0.3; stroke-dasharray: 3 14; }
    .tube__flow--supply { stroke: #d85a30; }
    .tube__flow--return { stroke: #378add; }
  </style>
`;
svg = svg.replace(/(<svg[^>]*>)/, `$1\n${STYLE}`);

// 3) Tlo podgladowe na korzeniu — poza aplikacja przezroczysty schemat
//    wyglada na zepsuty. Przy powrocie pliku do aplikacji ten atrybut
//    trzeba zdjac (aplikacja ma wlasne tlo i tryb ciemny).
svg = svg.replace('<svg', '<svg style="background:#f2f2f0"');

writeFileSync(WYJSCIE, svg, 'utf8');
console.log(`zapisane: ${WYJSCIE}`);
console.log(`wtopione grafiki: ${wtopione}, rozmiar: ${Math.round(svg.length / 1024)} kB`);
