// WPINANIE KONTRAKTU DANYCH W SCHEMAT PROJEKTANTA.
//
// Wejscie:  narzedzia/schemat-wektor-oryginal.svg  (plik z Illustratora)
// Wyjscie:  web/src/schema/schema.svg               (ten sam plik + kontrakt)
//
// Skrypt istnieje, bo plik projektanta zmienia sie co kilka dni, a recznie
// nanoszony kontrakt gubilby sie przy kazdej podmianie. Tutaj widac DOKLADNIE,
// co aplikacja dopisuje do cudzej grafiki: geometria, gradienty i klasy .stXX
// zostaja nietkniete.
//
// WERSJA ZRODLA: schemat_instalacji_wektor5.svg
//
// CO ZMIENILO SIE WZGLEDEM v4 (poprzedni skrypt lezy jako wepnij-kontrakt-v4.mjs.bak):
//   * Caly rysunek jest przerysowany i wspolrzedne NIE MAJA nic wspolnego
//     z v4 — dlatego skrypt jest napisany od nowa, a nie poprawiony.
//   * Podpisy sa juz w IBM Plex Mono (.st12/.st13), czyli w kroju aplikacji.
//     Zostaly dwa napisy w Arialu (.st14/.st15) i te podmieniamy na Plex Sans.
//   * Rury sa jednolitymi sciezkami .st21 — warstwe przeplywu budujemy
//     z ICH WLASNYCH wspolrzednych (patrz nizej), wiec nie da sie jej
//     rozjechac z rysunkiem.
//   * Nie ma karty cieplomierza. Odczyty energii i przeplywu zostaja w panelu
//     po klikniecu, a na rysunku sa dwie pary temperatur na rurach.
//
// PO NOWEJ WERSJI Z ILLUSTRATORA sprawdz po kolei:
//   1. czy `podmien` nie zglosil bledow (skrypt konczy sie wtedy kodem 1),
//   2. czy numery .stXX w bloku <style> nadal znacza to samo — eksporter
//      nadaje je od nowa przy kazdym zapisie,
//   3. czy wspolrzedne sond i kart zgadzaja sie z rysunkiem.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TU = dirname(fileURLToPath(import.meta.url));
const ZRODLO = join(TU, 'schemat-wektor-oryginal.svg');
const CEL = join(TU, '..', 'web', 'src', 'schema', 'schema.svg');

let svg = readFileSync(ZRODLO, 'utf8');
const bledy = [];

/** Podmiana, ktora KRZYCZY, gdy wzorzec nie pasuje — cicha porazka bylaby
 *  gorsza: schemat wygladalby dobrze, a dane by nie doszly. */
function podmien(opis, szukaj, zamien) {
  if (!svg.includes(szukaj)) {
    bledy.push(`nie znaleziono: ${opis}`);
    return;
  }
  svg = svg.replace(szukaj, zamien);
}

/** Usuwa fragment wraz z wcieciem i koncem wiersza. Tez KRZYCZY przy braku. */
function usunFragment(opis, fragment) {
  if (!svg.includes(fragment)) {
    bledy.push(`nie znaleziono do usuniecia: ${opis}`);
    return;
  }
  svg = svg.replace(
    new RegExp('[ \\t]*' + fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?'),
    '',
  );
}

/** Wycina grupe wraz z zawartoscia, liczac zagniezdzenia <g>. */
function wytnijGrupe(otwarcie) {
  const start = svg.indexOf(otwarcie);
  if (start < 0) return null;
  let i = start + otwarcie.length;
  let glebokosc = 1;
  while (glebokosc > 0 && i < svg.length) {
    const otw = svg.indexOf('<g', i);
    const zam = svg.indexOf('</g>', i);
    if (zam < 0) break;
    if (otw >= 0 && otw < zam) {
      glebokosc += 1;
      i = otw + 2;
    } else {
      glebokosc -= 1;
      i = zam + 4;
    }
  }
  return { start, koniec: i, tresc: svg.slice(start, i) };
}

// --- 1. Korzen: kadr, klasa, dostepnosc ----------------------------------
//
// Kadr scinamy z 1565x691 do tresci. Skrajne punkty zmierzone w pliku:
// najdalej w lewo podpis „wodociagowa" (x≈58), w prawo karta pompy ciepla
// (1477), w gore manometry (y≈66), w dol podpis „Magazyn PCM" (y≈640).
// Margines 16 px z kazdej strony.
podmien(
  'korzen svg',
  '<svg id="Warstwa_1" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1565.62 691.4">',
  '<svg id="Warstwa_1" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink"\n' +
    // MAGAZYN NA SRODKU KADRU, nie tresc rysunku.
    //
    // Kadr obejmowal cala tresc (42..1493) i przez to magazyn — czyli jedyny
    // obiekt, po ktory sie tu przychodzi — stal 46 px w lewo od srodka ekranu.
    // Zbiornik ma srodek w x=721,68, wiec lewa krawedz kadru musi lezec
    // symetrycznie wobec prawej: 2*721,68 - 1493 = -49,6. Kadr rosnie tylko
    // w lewo, o pusty pas; nic z rysunku sie nie obcina.
    '  viewBox="-50 50 1543 606" preserveAspectRatio="xMidYMid meet"\n' +
    '  class="schema schema-rura" role="img" aria-label="Schemat instalacji magazynu ciepła PCM">\n' +
    '  <!--\n' +
    '    SCHEMAT INSTALACJI — PLIK PROJEKTANTA (Illustrator), wersja v5.\n' +
    '    Oryginal: narzedzia/schemat-wektor-oryginal.svg\n' +
    '    Kontrakt wpina narzedzia/wepnij-kontrakt.mjs — TEGO PLIKU NIE EDYTUJ\n' +
    '    RECZNIE, bo kolejna wersja z Illustratora go nadpisze. Poprawki nanos\n' +
    '    w skrypcie albo w pliku zrodlowym.\n' +
    '  -->',
);

// --- 2. Reguly kontraktu w bloku <style> pliku ---------------------------
// Musza byc TUTAJ, a nie w arkuszu aplikacji: <style> z wnetrza SVG stoi
// w dokumencie za arkuszem, wiec regula z arkusza by przegrala.
podmien(
  'blok style',
  '    </style>',
  `
      /* ============ KONTRAKT — dopisane przez wepnij-kontrakt.mjs ========= */

      /* KROJE. Projektant sklada podpisy w IBM Plex Mono, czyli dokladnie tym,
         czego uzywa aplikacja do liczb — to zostaje. Dwa napisy przyszly
         jeszcze w Arialu (.st14, .st15) i te przechodza na Plex Sans, zeby
         na rysunku nie stal trzeci krój. */
      .st14, .st15 { font-family: 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif; }

      /* Rury: kolor w zmiennej, zeby dalo sie go dostroic jednym miejscem. */
      .schema-rura { --rura: #d4d9d9; }
      .st20, .st21 { stroke: var(--rura, #d4d9d9); }

      .sensor { cursor: pointer; }
      .sensor__hit { fill: none; pointer-events: all; }
      /* Barwy sond i odczytow ida za NOSNIKIEM: zmienna --akcent ustawia
         arkusz aplikacji (cieplo — pomarancz, chlod — stal), a wartosc po
         przecinku jest awaryjna, gdyby ktos otworzyl ten plik poza aplikacja. */
      .sensor__phase { fill: none; stroke: var(--akcent-jasny, #de7854); stroke-width: 2.5px; opacity: 0; }
      .sensor.is-phase .sensor__phase { opacity: 1; }
      .sensor.is-dim { opacity: .45; }
      /* Kropka sondy: obwodka jak .st8 w oryginale, ale BEZ fill w CSS —
         wypelnienie ustawia aplikacja wedlug temperatury, a regula CSS by je
         przykryla. */
      .sensor__cell { stroke: var(--akcent, #ff5b1a); stroke-width: 2.5px; }
      .sensor:hover .sensor__cell { stroke: #202322; }
      text.is-no-data, text.is-not-connected { fill: #a3a3a0; }
      text.is-stale { opacity: .55; }

      /* Odczyty cieplomierzy na rurach. Klikalne tak samo jak sondy
         w zbiorniku — sa w grupach .sensor, wiec dziedzicza kursor i obwodke. */
      .rura-odczyt { fill: var(--akcent, #ff5b1a); }
      .rura-odczyt.is-no-data, .rura-odczyt.is-not-connected { fill: #a3a3a0; }
      .rura-odczyt.is-stale { opacity: .55; }
      /* Przeplyw stoi nad temperatura, mniejszym stopniem i wycofana barwa:
         to dana pomocnicza, a nie druga rownorzedna liczba. */
      .rura-przeplyw { font-size: 11px; fill: #8d8d88; }
      .rura-przeplyw.is-no-data, .rura-przeplyw.is-not-connected { fill: #b6b6b1; }
      .rura-przeplyw.is-stale { opacity: .55; }

      [data-element] { cursor: pointer; }
      /* Dwa zapisy, bo manometry NIOSA data-element na samej tarczy,
         a karty urzadzen maja je na grupie nadrzednej. */
      [data-element]:hover .karta,
      .karta[data-element]:hover { stroke: #202322; stroke-width: 2px; }
      [data-element].is-selected .karta,
      .karta[data-element].is-selected { stroke: var(--akcent, #d85a30); stroke-width: 3px; }

      .device__led { fill: #a3a3a0; }
      .device.is-active .device__led { fill: #20a969; }
      .device.is-unknown .device__led { fill: #f0c674; }
    </style>`,
);

// --- 3. Sondy w zbiorniku: przebudowa obu kolumn -------------------------
//
// Teksty i kropki leza w oryginale osobno; laczymy je w grupy `.sensor`,
// bo dopiero grupa niesie klik, podpowiedz i pierscien przemiany.
//
// Poziomy licza sie OD DOLU: 1 to dol zbiornika, 3 gora (ustalenie z 2026-07-30,
// historia pomiarow jest do niego przywiazana). W pliku wiersze ida od gory,
// wiec kolejnosc identyfikatorow jest odwrotna: A3, A2, A1.
const SONDY = [
  { kolumna: 'sensors-left', cx: 657.18, tekstX: 602.68, hitX: 590, id: ['A3', 'A2', 'A1'] },
  { kolumna: 'sensors-right', cx: 785.18, tekstX: 797.18, hitX: 779, id: ['B3', 'B2', 'B1'] },
];
const POZIOMY = [
  { cy: 350.93, tekstY: 355.93 },
  { cy: 438.93, tekstY: 443.93 },
  { cy: 521.93, tekstY: 526.93 },
];

for (const kol of SONDY) {
  const grupa = wytnijGrupe(`<g id="${kol.kolumna}">`);
  if (!grupa) {
    bledy.push(`nie znaleziono kolumny sond: ${kol.kolumna}`);
    continue;
  }
  const sondy = POZIOMY.map((poz, i) => {
    const id = kol.id[i];
    return (
      `      <g class="sensor" data-sensor="${id}">\n` +
      `        <rect class="sensor__hit" x="${kol.hitX}" y="${poz.cy - 15}" width="76" height="30"/>\n` +
      `        <circle class="sensor__phase" cx="${kol.cx}" cy="${poz.cy}" r="10"/>\n` +
      `        <text class="st12" data-point="${id}" data-unit="°C" transform="translate(${kol.tekstX} ${poz.tekstY})">—</text>\n` +
      `        <circle class="sensor__cell" fill="#fff" data-fill-point="${id}" cx="${kol.cx}" cy="${poz.cy}" r="4.5"/>\n` +
      `      </g>`
    );
  }).join('\n');
  svg =
    svg.slice(0, grupa.start) +
    `<g id="${kol.kolumna}">\n${sondy}\n  </g>` +
    svg.slice(grupa.koniec);
}

// --- 4. Cieplomierze na rurach: cztery temperatury i dwa przeplywy -------
//
// W pliku stoja cztery odczyty „24.8°C" wpisane na sztywno. Zadnego nie wolno
// zostawic jako tekstu: liczba wpisana w grafike wyglada dokladnie jak pomiar.
//
// PRZYPISANIE (ustalone przez projektanta 2026-08-03, zgodne z nazwami
// kontrolek w Loxone Config):
//   lewa gora  — ODBIOR_T_powrot      + przeplyw odbioru
//   lewa dol   — ODBIOR_T_zasilanie
//   prawa gora — ZRODLO_T_zasilanie   + przeplyw zrodla
//   prawa dol  — ZRODLO_T_powrot
//
// Przeplyw stoi tylko przy GORNYCH odczytach, bo licznik mierzy go raz na
// obieg — dwie liczby na jednym obiegu sugerowalyby dwa przeplywomierze.
//
// TE ODCZYTY SA PELNYMI SONDAMI, nie tekstem: grupa `.sensor` z data-sensor
// niesie klikniecie, wiec panel z wykresem historii otwiera sie tak samo jak
// dla sond w zbiorniku. Kropka dostaje data-fill-point, czyli barwe mapy
// cieplnej, a hit-box 30 px wysokosci — palcem tez da sie trafic.
const CIEPLOMIERZE = [
  {
    strona: 'lewa-gora',
    x: 577.42,
    y: 99.3,
    cx: 596.44,
    cy: 114.63,
    punkt: 'ODBIOR_T_POWROT',
    przeplyw: 'ODBIOR_FLOW',
    // Podpis przeplywu idzie NAD temperature po lewej stronie: nizej stoi
    // druga temperatura, a wyzej jest wolne miejsce nad rura.
    przeplywY: 78,
  },
  {
    strona: 'lewa-dol',
    x: 577.42,
    y: 174.55,
    cx: 596.44,
    cy: 150.33,
    punkt: 'ODBIOR_T_ZASILANIE',
    przeplyw: null,
  },
  {
    strona: 'prawa-gora',
    x: 840.16,
    y: 99.3,
    cx: 859.18,
    cy: 114.63,
    punkt: 'METER_T1',
    przeplyw: 'METER_FLOW',
    przeplywY: 78,
  },
  {
    strona: 'prawa-dol',
    x: 840.16,
    y: 174.55,
    cx: 859.18,
    cy: 150.33,
    punkt: 'METER_T2',
    przeplyw: null,
  },
];

for (const o of CIEPLOMIERZE) {
  // Tekst temperatury i kropka leza w pliku osobno, w roznych miejscach
  // dokumentu. Tekst zamieniamy na CALA grupe sondy, a kropke usuwamy
  // z jej dawnego miejsca — inaczej byloby jej dwie.
  const tekstStary = `<text class="st12" transform="translate(${o.x} ${o.y})"><tspan x="0" y="0">24.8°C</tspan></text>`;
  const przeplyw = o.przeplyw
    ? `\n        <text class="st12 rura-przeplyw" data-point="${o.przeplyw}" data-unit="m³/h"` +
      ` transform="translate(${o.x} ${o.przeplywY})">—</text>`
    : '';

  podmien(
    `sonda cieplomierza ${o.strona}`,
    tekstStary,
    `<g class="sensor sensor--rura" data-sensor="${o.punkt}">\n` +
      `        <rect class="sensor__hit" x="${o.x - 6}" y="${o.y - 20}" width="86" height="30"/>\n` +
      `        <circle class="sensor__phase" cx="${o.cx}" cy="${o.cy}" r="10"/>\n` +
      `        <text class="st12 rura-odczyt" data-point="${o.punkt}" data-unit="°C"` +
      ` transform="translate(${o.x} ${o.y})">—</text>\n` +
      `        <circle class="sensor__cell" fill="#fff" data-fill-point="${o.punkt}"` +
      ` cx="${o.cx}" cy="${o.cy}" r="4.5"/>${przeplyw}\n` +
      `      </g>`,
  );

  usunFragment(
    `stara kropka cieplomierza ${o.strona}`,
    `<circle class="st8" cx="${o.cx}" cy="${o.cy}" r="4.5"/>`,
  );
}

// --- 5. Bryly i karty klikalne -------------------------------------------
//
// `data-object` / `data-vessel` / `data-h` czyta TAKZE scena 3D
// (extractScene.ts) — jeden zapis w rysunku opisuje oba widoki, wiec nie moga
// sie rozjechac. `data-h` to wysokosc bryly w jednostkach sceny.

// Zbiornik PCM — plaszcz. Karta pod nim (przerywana ramka) jest tlem modulu.
podmien(
  'plaszcz zbiornika PCM',
  '<rect class="st2" x="657.18" y="300.93" width="129" height="255"/>',
  '<rect class="st2" x="657.18" y="300.93" width="129" height="255"' +
    ' data-object="storage" data-label="Magazyn PCM" data-h="8" data-vessel="true"/>',
);

// PASEK NALADOWANIA W MIEJSCU PODPISU „Magazyn PCM".
//
// Podpis zniknal swiadomie i to nie strata: zbiornik jest najwieksza brylą na
// rysunku, jego panel po klikniecu nosi te sama nazwe, a nazwa parafiny stoi
// w belce nad schematem. To miejsce pod zbiornikiem jest natomiast jedynym,
// w ktorym naladowanie da sie postawic PRZY samym magazynie — a nie w naglowku,
// dwadziescia centymetrow wyzej.
//
// Wspolrzedne pochodza z rysunku, nie z oka: plaszcz zbiornika to
// x = 657,18 … 786,18, a podpis mial linie pisma na y = 635,03. Pasek zajmuje
// lewa czesc tej szerokosci, procent stoi wyrownany do prawej krawedzi
// zbiornika — tak, zeby oba konczyly sie tam, gdzie konczy sie brylą.
//
// `data-soc-track` niesie szerokosc toru, zeby bindSchema nie musiala jej
// znac z kodu. Podmiana rysunku zmieni ja sama.
podmien(
  'podpis zbiornika -> pasek naladowania',
  '<text class="st13" transform="translate(691.98 635.03)"><tspan x="0" y="0">Magazyn PCM</tspan></text>',
  '<g class="soc">' +
    '<rect class="soc__tor" data-soc-track="true" x="657.18" y="629" width="101" height="8"/>' +
    '<rect class="soc__wypelnienie" data-soc-fill="true" x="657.18" y="629" width="0" height="8"/>' +
    '<text class="soc__wartosc" data-soc-text="true" x="786.18" y="636.5" text-anchor="end">—</text>' +
    // Energia pod paskiem: „ile jest / ile sie miesci" w kWh. Wyrownana do tej
    // samej prawej krawedzi co procent, zeby obie liczby konczyl jeden pion.
    '<text class="soc__energia" data-soc-energy="true" x="786.18" y="653" text-anchor="end">—</text>' +
    '</g>',
);

podmien(
  'karta modulu centralnego',
  '<rect class="st7" x="579.18" y="254.46" width="290" height="356.94" rx="8.12" ry="8.12"/>',
  '<rect class="st7 karta" data-element="storage" x="579.18" y="254.46" width="290" height="356.94" rx="8.12" ry="8.12"/>',
);

// Bufor 80 l — bryla rysowana sciezka, nie prostokatem, wiec `data-*` idzie
// na nia wprost.
podmien(
  'bufor 80 l',
  '<path class="st5" d="M1095.81,420.65c0-18.95-6.17-35.38-9.94-43.66',
  '<path class="st5 karta" data-element="buffer" data-object="buffer"' +
    ' data-label="Bufor 80 l" data-h="4.4" data-vessel="true"' +
    ' d="M1095.81,420.65c0-18.95-6.17-35.38-9.94-43.66',
);

// Naczynie przeponowe — mala bryla miedzy buforem i pompa ciepla.
podmien(
  'naczynie przeponowe',
  '<path class="st5" d="M1165.78,444.49c13.65,0,25.49-4.44,31.45-7.16',
  '<path class="st5 karta" data-element="naczynie-prawe" data-object="naczynie-prawe"' +
    ' data-label="Naczynie przeponowe" data-h="1.4"' +
    ' d="M1165.78,444.49c13.65,0,25.49-4.44,31.45-7.16',
);

// Pompa ciepla.
//
// BEZ LAMPKI STANU. Pierwsza wersja dokladala kropke w prawym gornym rogu
// karty — obca plamka na rysunku, w ktorym projektant ma juz wlasny znak
// (tarcze wentylatora). Punkt HP_STATE i tak nie jest podlaczony, wiec lampka
// swiecilaby stale na szaro i nie mowilaby nic. `data-state` zostaje na grupie:
// gdy stan bedzie dostepny, wroci tu wskaznik — ale zaprojektowany, nie dopiety.
podmien(
  'pompa ciepla',
  '<rect class="st5" x="1247.28" y="369.22" width="230" height="161" rx="7.41" ry="7.41"/>',
  '<g class="device" data-state="HP_STATE" data-element="heatpump">\n' +
    '    <rect class="st5 karta" x="1247.28" y="369.22" width="230" height="161" rx="7.41" ry="7.41"' +
    ' data-object="heatpump" data-label="Pompa ciepła" data-h="3"/>\n' +
    '  </g>',
);

// Pompa obiegowa — tarcza z trojkatem u gory rysunku. Bez lampki, z tego
// samego powodu co przy pompie ciepla: PUMP_STATE nie jest podlaczony, wiec
// kropka swiecilaby stale na szaro i byla tylko plamka na rysunku.
podmien(
  'pompa obiegowa',
  '<circle class="st6" cx="1104.95" cy="114.13" r="14.39"/>',
  '<g class="device" data-state="PUMP_STATE" data-element="pump">\n' +
    '    <circle class="st6 karta" cx="1104.95" cy="114.13" r="14.39"' +
    ' data-object="pump" data-label="Pompa obiegowa" data-h="1.3"/>\n' +
    '  </g>',
);

// Manometry — klikalnosc wprost na tarczy.
podmien(
  'manometr lewy',
  '<circle class="st6" cx="320.45" cy="81.13" r="14.96"/>',
  '<circle class="st6 karta" data-element="manometr-lewy" cx="320.45" cy="81.13" r="14.96"/>',
);
podmien(
  'manometr prawy',
  '<circle class="st6" cx="778.68" cy="81.13" r="14.96"/>',
  '<circle class="st6 karta" data-element="manometr-prawy" cx="778.68" cy="81.13" r="14.96"/>',
);

// Rzad uzdatniania wody po lewej.
//
// PRZYPISANIE PO POLOZENIU PODPISOW, sprawdzone wspolrzednymi:
//   „Woda wodociągowa" (x 58–117, y 436) stoi przy KONCU RURY wchodzacej
//      z lewej (odnoga y=435.96, x 123.66–161.98) — opisuje doprowadzenie
//      wody, nie urzadzenie. Zadna karta go nie dostaje.
//   „Filtr odkamieniający" (x 183–250, y 475) stoi POD pigulka 161.98–280.98.
//   Podpis podgrzewacza jest obrysowany na krzywe (x 353–443, y 502–515)
//      i stoi pod szeroka karta 325.49–472.45.
//
// Pierwsza wersja przypisywala pigulke do wody i to byl blad zgloszony przez
// projektanta.
//
// ATRYBUTY IDA NA PROSTOKAT WYPELNIONY (.st7), NIE NA OBWODKE (.st20).
// Obwodka ma `fill: none`, wiec kursor trafial w nia tylko na samej kresce —
// karta wygladala na klikalna i nie byla. To ta sama pomylka w obu kartach.
podmien(
  'karta filtra odkamieniajacego',
  '<rect class="st7" x="161.98" y="414.3" width="119" height="43.54" rx="20.95" ry="20.95"/>',
  '<rect class="st7 karta" data-element="filtr" x="161.98" y="414.3" width="119" height="43.54" rx="20.95" ry="20.95"' +
    ' data-object="filtr" data-label="Filtr odkamieniający" data-h="1.6"/>',
);
// PODGRZEWACZ JEST WYGASZONY — 30 % krycia, zero interakcji (2026-08-04).
// Strona wody uzytkowej nie bierze udzialu w biezacych testach, wiec element
// zostaje na rysunku jako kontekst instalacji, ale nie udaje aktywnej czesci
// stanowiska. Dlatego:
//   * BEZ `data-element` — klik nie otwiera panelu, najechanie nie podswietla
//     (regula hover w arkuszu celuje w `[data-element]`);
//   * `data-object` zostaje — scena 3D dalej rysuje bryle;
//   * klasa `wylaczone` idzie na CALE GRUPY (karta + podpis), nie na sam
//     prostokat — inaczej podpis staly by w pelnym kryciu pod wyblaklym
//     urzadzeniem. Podpis „Podgrzewacz wody wodociagowej" to litery zamienione
//     na krzywe w grupie #storage-tank22, wiec po tekscie go nie znajdziemy;
//     identyfikator grupy jest jedynym uchwytem i `podmien` KRZYKNIE, gdy
//     eksporter nada inny przy nastepnej wersji rysunku.
podmien(
  'karta podgrzewacza',
  '<rect class="st7" x="325.49" y="385.84" width="146.96" height="97.77" rx="15" ry="15"/>',
  '<rect class="st7 karta" x="325.49" y="385.84" width="146.96" height="97.77" rx="15" ry="15"' +
    ' data-object="podgrzewacz" data-label="Podgrzewacz wody" data-h="2"/>',
);
podmien(
  'wygaszenie podgrzewacza (grupa karty)',
  '<g id="heat-pump1">',
  '<g id="heat-pump1" class="wylaczone">',
);
podmien(
  'wygaszenie podgrzewacza (grupa podpisu)',
  '<g id="storage-tank22" data-name="storage-tank2">',
  '<g id="storage-tank22" data-name="storage-tank2" class="wylaczone">',
);

// --- 6. Warstwa przeplywu ------------------------------------------------
//
// SCIEZKI PRZEPISANE Z RUR, NIE NARYSOWANE OD NOWA. Kazda linia nizej to
// atrybut `d` konkretnej rury (.st21) z pliku projektanta, skopiowany znak
// w znak. Dzieki temu animowana kreska biegnie dokladnie osia rury i nie ma
// czego dostrajac po kolejnej wersji rysunku — wystarczy przepisac na nowo.
//
// KIERUNEK PRZEPLYWU ROZSTRZYGAJA STRZALKI Z RYSUNKU, nie kierunek zapisu.
//
// Projektant narysowal przy gornej krawedzi magazynu cztery strzalki i one sa
// tu zrodlem prawdy. Ich wspolrzedne z pliku (v5), sparowane z rurami po
// najblizszym x:
//
//   strzalka x=663.3  W DOL   ->  rura x=671.99  odbior-powrot   (wchodzi)
//   strzalka x=703.8  W GORE  ->  rura x=694     odbior-gora     (wychodzi)
//   strzalka x=740.7  W DOL   ->  rura x=749.26  zrodlo-zasilanie(wchodzi)
//   strzalka x=784.2  W GORE  ->  rura x=772.26  bufor-zasilanie (wychodzi)
//
// `wspak: true` znaczy „plyn idzie od KONCA sciezki do jej POCZATKU". Trzy
// rury z pieciu maja tak wlasnie, bo Illustrator zapisal je od strony
// urzadzenia, a nie od strony zbiornika. Odwracamy animacje, nie zapis `d` —
// przepisany od tylu `d` trzeba by robic od nowa przy kazdej wersji rysunku.
//
// `--supply` / `--return` mowi tylko, ktora kreska nalezy do zasilania,
// a ktora do powrotu (barwa), i jest niezalezne od kierunku ruchu.
//
// KAZDY ODCINEK MA WLASNY PRZEPLYWOMIERZ (pole `zrodlo`), a nie jeden wspolny.
// Do 2026-08-04 wszystkie osiem bralo przeplyw z `METER_FLOW`, czyli
// z ciepłomierza ZRODLA — wiec lewa strona schematu (obieg odbioru) pokazywala
// ruch, ktorego nikt nie mierzyl. Odkad w Miniserverze jest kanal
// `ODBIOR_Przeplyw`, obieg odbioru idzie za swoim licznikiem.
//
// `zrodlo: null` znaczy „ten odcinek nie ma przeplywomierza". W trybie na zywo
// animacja go wtedy NIE RUSZA (patrz bindSchema): woda wodociagowa nie jest
// nigdzie mierzona, a zgadniety ruch na schemacie badawczym jest gorszy od
// nieruchomej rury. W trybie pokazowym plyna wszystkie odcinki.
const RURY = [
  {
    // Sciezka zapisana OD urzadzenia (x=167) DO zbiornika (x=694), a strzalka
    // mowi, ze przy zbiorniku plyn idzie w gore, czyli WYCHODZI — a wiec ruch
    // jest od zbiornika do urzadzenia, czyli wspak wobec zapisu.
    nazwa: 'odbior-gora',
    rola: 'supply',
    wspak: true,
    zrodlo: 'ODBIOR_FLOW',
    d: 'M167.53,244.91v-118.42c0-6.48,5.26-11.74,11.74-11.74h504.43c6.22,0,11.3,5.1,10.47,12.27v169.19',
  },
  {
    // Zapisana OD zbiornika, a strzalka pokazuje wejscie do zbiornika.
    nazwa: 'odbior-powrot',
    rola: 'return',
    wspak: true,
    zrodlo: 'ODBIOR_FLOW',
    d: 'M671.99,296.22v-134.54c0-6.24-5.11-11.35-11.35-11.35h-129.45c-6.24,0-11.35,5.11-11.35,11.35v262.91c0,6.28-5.09,11.37-11.37,11.37h-36.02',
  },
  {
    // To samo: zapis od zbiornika, przeplyw do zbiornika.
    nazwa: 'zrodlo-zasilanie',
    rola: 'supply',
    wspak: true,
    zrodlo: 'METER_FLOW',
    d: 'M749.26,296.22V126.1c0-6.24,5.1-11.34,11.34-11.34h530.95c6.24,0,11.34,5.1,11.34,11.34v243.12',
  },
  {
    // Jedyna rura przy zbiorniku, w ktorej zapis i przeplyw sa zgodne:
    // strzalka w gore, czyli plyn wychodzi ze zbiornika w strone bufora.
    nazwa: 'bufor-zasilanie',
    rola: 'return',
    wspak: false,
    zrodlo: 'METER_FLOW',
    d: 'M772.26,296.22v-134.55c0-6.24,5.1-11.34,11.34-11.34h146.91c6.24,0,11.34,5.1,11.34,11.34v209.7',
  },
  {
    // Odcinek bufor -> pompa ciepla, poza zasiegiem strzalek. Zapis idzie od
    // bufora do pompy i to jest kierunek obiegu zrodla, wiec bez odwracania.
    nazwa: 'bufor-pompa',
    rola: 'return',
    wspak: false,
    zrodlo: 'METER_FLOW',
    d: 'M985.11,371.26v-159.58c0-6.24,5.1-11.34,11.34-11.34h268.91c6.24,0,11.34,5.1,11.34,11.34v157.55',
  },
  // --- Odcinki dopisane 2026-08-04 (zgloszone jako brakujace) --------------
  //
  // Trzy rury, ktore mialy rure bazowa, ale nie mialy warstwy przeplywu, wiec
  // stały martwe, gdy reszta schematu plynela.
  {
    // Woda wodociagowa -> filtr odkamieniajacy. Krotki odcinek pod kartami,
    // zapisany od filtra w lewo, a woda idzie w prawo — stad wspak.
    // BEZ PRZEPLYWOMIERZA: na wodzie wodociagowej nie ma zadnego licznika.
    nazwa: 'woda-filtr',
    rola: 'supply',
    wspak: true,
    zrodlo: null,
    d: 'M161.98,435.96h-38.32',
  },
  {
    // Filtr -> podgrzewacz wody wodociagowej. Zapis od podgrzewacza w lewo.
    // Tez bez przeplywomierza — ten sam obieg wody uzytkowej.
    nazwa: 'filtr-podgrzewacz',
    rola: 'supply',
    wspak: true,
    zrodlo: null,
    d: 'M325.49,435.96h-44.51',
  },
  {
    // Odgalezienie do naczynia przeponowego: z poziomej rury obiegu zrodla
    // (y=200,87) w dol, do naczynia (y=369,22). Naczynie wisi na tej rurze,
    // wiec dalsza droga do pompy to juz odcinek `bufor-pompa`. Nalezy do
    // obiegu zrodla, wiec dziedziczy jego przeplywomierz.
    nazwa: 'naczynie',
    rola: 'return',
    wspak: false,
    zrodlo: 'METER_FLOW',
    d: 'M1165.78,200.87v168.35',
  },
];

// --- 6a. Dwie rury zabladzone za warstwe przeplywu -------------------------
//
// USTERKA, KTORA WYGLADALA JAK BRAK ANIMACJI, A BYLA KOLEJNOSCIA RYSOWANIA.
//
// Projektant zapisal wiekszosc rur (.st21) w jednym bloku na poczatku pliku,
// ale DWIE stoja pozniej, wsrod urzadzen: odcinek bufor -> pompa ciepla
// (`M985.11,371.26…`) i odgalezienie do naczynia przeponowego
// (`1165.78,200.87 → 369.22`). Warstwe przeplywu wpinamy przed grupa zbiornika,
// czyli PRZED tamtymi dwoma — a w SVG pozniejszy element rysuje sie na
// wierzchu. Rura bazowa zamalowywala wiec strumien: animacja liczyla sie
// poprawnie (klasa `is-flowing`, predkosc w `data-flow-speed`), tylko nie bylo
// jej widac. Zglaszane dwa razy jako „nadal nie mam tu obiegu" — i za pierwszym
// razem szukalem bledu w danych, bo one wygladaly dobrze.
//
// Przenosimy je do bloku z pozostalymi rurami. Wspolrzednych nie ruszamy,
// wiec rysunek nie zmienia sie ani o piksel — zmienia sie tylko kolejnosc.
const RURA_BUFOR_POMPA =
  '<path class="st21" d="M985.11,371.26v-159.58c0-6.24,5.1-11.34,11.34-11.34h268.91c6.24,0,11.34,5.1,11.34,11.34v157.55"/>';
const RURA_NACZYNIE = '<line class="st21" x1="1165.78" y1="200.87" x2="1165.78" y2="369.22"/>';
const OSTATNIA_RURA_W_BLOKU =
  '<path class="st21" d="M772.26,296.22v-134.55c0-6.24,5.1-11.34,11.34-11.34h146.91c6.24,0,11.34,5.1,11.34,11.34v209.7"/>';

// Najpierw usuwamy z miejsc, w ktorych stoja, potem wstawiamy — odwrotna
// kolejnosc kasowalaby swiezo wstawiona kopie (replace bierze pierwsze
// trafienie).
usunFragment('rura bufor -> pompa (przenoszona do bloku rur)', RURA_BUFOR_POMPA);
usunFragment('odgalezienie naczynia (przenoszone do bloku rur)', RURA_NACZYNIE);
podmien(
  'blok rur — miejsce na dwie przeniesione',
  OSTATNIA_RURA_W_BLOKU,
  OSTATNIA_RURA_W_BLOKU + '\n  ' + RURA_BUFOR_POMPA + '\n  ' + RURA_NACZYNIE,
);

const PRZEPLYW =
  '  <!-- KONTRAKT: warstwa przeplywu — osie rur przepisane z rysunku. -->\n' +
  '  <g id="warstwa-przeplywu" fill="none">\n' +
  RURY.map(
    (r) =>
      `    <path class="tube__flow tube__flow--${r.rola}${r.wspak ? ' tube__flow--wspak' : ''}"` +
      ` data-flow="${r.nazwa}"` +
      (r.zrodlo ? ` data-flow-source="${r.zrodlo}"` : '') +
      ` d="${r.d}"/>`,
  ).join('\n') +
  '\n  </g>\n';

// Warstwa lezy NA rurach, ale pod kartami urzadzen — plyn wchodzi
// w urzadzenie, nie przechodzi po jego wierzchu. Wstawiamy ja przed grupa
// zbiornika, ktora jest pierwsza po rurach.
podmien('miejsce na przeplyw', '  <g id="tank">', PRZEPLYW + '  <g id="tank">');

// --- Zapis ----------------------------------------------------------------
if (bledy.length) {
  console.error('BLEDY WPINANIA:');
  for (const b of bledy) console.error('  ' + b);
  process.exit(1);
}

writeFileSync(CEL, svg, 'utf8');

const licz = (wzor) => (svg.match(new RegExp(wzor, 'g')) ?? []).length;
console.log('zapisane:', CEL);
console.log('  data-element   :', licz('data-element='));
console.log('  data-sensor    :', licz('data-sensor='));
console.log('  data-point     :', licz('data-point='));
console.log('  data-fill-point:', licz('data-fill-point='));
console.log('  data-flow      :', licz('data-flow='));
console.log('  data-object    :', licz('data-object='));
