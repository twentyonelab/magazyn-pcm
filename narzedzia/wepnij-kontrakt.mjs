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
// PO NOWEJ WERSJI Z ILLUSTRATORA sprawdz po kolei:
//   1. czy `podmien` nie zglosil bledow (skrypt konczy sie wtedy kodem 1),
//   2. czy numery .stXX w bloku <style> nadal znacza to samo — eksporter
//      nadaje je od nowa przy kazdym zapisie i potrafia sie przesunac
//      (w v3 karty mialy .st5, tusz .st15; w v4 tusz to .st13),
//   3. czy wspolrzedne w tablicach ponizej zgadzaja sie z rysunkiem.
//
// WERSJA ZRODLA: schemat_instalacji_wektor4.svg
// Wzgledem v3 rury wrocily z rastrow na wektory (klasa .st3), a dolny rzad
// trzech kart przejal role ukrytej sekcji uzdatniania wody.

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
// viewBox oryginalu ma 1278 px wysokosci, bo Illustrator wliczyl ukryty
// element na y=1261. Widoczna tresc siega y=497, wiec kadr scinamy — inaczej
// rysunek renderowalby sie w gornej jednej trzeciej pola.
// Skrajne punkty: rura dolna konczy sie na x=130.65, pompa ciepla na
// x=1643.92, gorne podpisy siegaja y≈-2, dolne karty y=497.23. Margines 16 px.
podmien(
  'korzen svg',
  '<svg id="Warstwa_1" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1644.42 1278.42">',
  '<svg id="Warstwa_1" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink"\n' +
    '  viewBox="114 -18 1546 533" preserveAspectRatio="xMidYMid meet"\n' +
    '  class="schema" role="img" aria-label="Schemat instalacji magazynu ciepła PCM">\n' +
    '  <!--\n' +
    '    SCHEMAT INSTALACJI — PLIK PROJEKTANTA (Illustrator), wersja v0.8.\n' +
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

      /* Rury nieco ciemniejsze. Projektant dal #e0e0e0, co na ciepłym,
         kremowym tle aplikacji niemal znikalo — instalacja rozpadala sie
         na osobne kafelki. Kolor trzymamy w zmiennej, zeby dalo sie go
         dostroic jednym miejscem. */
      .schema-rura { --rura: #c2c7c6; }
      .st3, .st6 { stroke: var(--rura, #c2c7c6); }

      .sensor { cursor: pointer; }
      .sensor__hit { fill: none; pointer-events: all; }
      /* Barwy sond i odczytow ida za NOSNIKIEM: zmienna --akcent ustawia
         arkusz aplikacji, a wartosc po przecinku jest awaryjna — gdyby ktos
         otworzyl ten plik samodzielnie, poza aplikacja. */
      .sensor__phase { fill: none; stroke: var(--akcent-jasny, #de7854); stroke-width: 2.5px; opacity: 0; }
      .sensor.is-phase .sensor__phase { opacity: 1; }
      .sensor.is-dim { opacity: .45; }
      /* Kropka sondy: obwodka jak .st8, ale BEZ fill w CSS — wypelnienie
         ustawia aplikacja atrybutem wedlug temperatury, a regula CSS by je
         przykryla. */
      .sensor__cell { stroke: var(--akcent, #ff5b1a); stroke-width: 2.5px; }
      .sensor:hover .sensor__cell { stroke: #202322; }
      text.is-no-data, text.is-not-connected { fill: #a3a3a0; }
      text.is-stale { opacity: .55; }

      [data-element] { cursor: pointer; }
      /* Dwa zapisy, bo manometry NIOSA data-element na samej tarczy,
         a karty urzadzen maja je na grupie nadrzednej. */
      [data-element]:hover .karta,
      .karta[data-element]:hover { stroke: #202322; stroke-width: 2px; }
      [data-element].is-selected .karta,
      .karta[data-element].is-selected { stroke: #d85a30; stroke-width: 3px; }

      /* Odczyty cieplomierza wprost na rysunku. 11 px, bo miedzy karta
         (konczy sie na y=124) a rura (y=156) sa tylko 32 px na dwie linijki. */
      .odczyt-miernika__wartosc {
        font-family: ArialMT, Arial;
        font-size: 11px;
        fill: var(--akcent, #d85a30);
      }
      .odczyt-miernika__wartosc.is-no-data,
      .odczyt-miernika__wartosc.is-not-connected { fill: #a3a3a0; }

      .device__led { fill: #a3a3a0; }
      .device.is-active .device__led { fill: #20a969; }
      .device.is-unknown .device__led { fill: #f0c674; }
    </style>`,
);

// Klasa na korzeniu, zeby zmienna --rura miala gdzie zamieszkac.
podmien('klasa rury na korzeniu', 'class="schema" role="img"', 'class="schema schema-rura" role="img"');

// --- 3. Sondy: przebudowa obu kolumn -------------------------------------
// Teksty i kropki leza w oryginale osobno; laczymy je w grupy `.sensor`,
// bo dopiero grupa niesie klik, podpowiedz i pierscien przemiany.
const SONDY = [
  { kolumna: 'sensors-left', cx: 823.82, tekstX: 769.32, hitX: 757, id: ['A3', 'A2', 'A1'] },
  { kolumna: 'sensors-right', cx: 951.82, tekstX: 963.82, hitX: 945, id: ['B3', 'B2', 'B1'] },
];
const POZIOMY = [
  { cy: 211.73, tekstY: 216.73 },
  { cy: 299.73, tekstY: 304.73 },
  { cy: 382.73, tekstY: 387.73 },
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
      `        <text class="st13" data-point="${id}" data-unit="°C" transform="translate(${kol.tekstX} ${poz.tekstY})">—</text>\n` +
      `        <circle class="sensor__cell" fill="#fff" data-fill-point="${id}" cx="${kol.cx}" cy="${poz.cy}" r="4.5"/>\n` +
      `      </g>`
    );
  }).join('\n');
  svg =
    svg.slice(0, grupa.start) +
    `<g id="${kol.kolumna}">\n${sondy}\n    </g>` +
    svg.slice(grupa.koniec);
}

// --- 4. Klikalne elementy + bryly 3D --------------------------------------
podmien(
  'karta modulu centralnego',
  '  <g id="central-module">\n    <rect class="st5" x="755.82" y="132.73" width="270" height="351" rx="8.12" ry="8.12"/>',
  '  <g id="central-module" data-element="storage">\n    <rect class="st5 karta" x="755.82" y="132.73" width="270" height="351" rx="8.12" ry="8.12"/>',
);
podmien(
  'walec PCM (bryla 3D)',
  '<rect class="st20" x="823.82" y="161.73" width="129" height="255"/>',
  '<rect class="st20" x="823.82" y="161.73" width="129" height="255"' +
    ' data-object="storage" data-label="Magazyn PCM" data-h="8" data-vessel="true"/>',
);

podmien(
  'zasobnik 80 l',
  '    <g id="storage-tank">\n      <rect class="st5" x="1085.92" y="208.76" width="90" height="161" rx="15" ry="15"/>',
  '    <g id="storage-tank" data-element="buffer">\n      <rect class="st5 karta" x="1085.92" y="208.76" width="90" height="161" rx="15" ry="15"' +
    ' data-object="buffer" data-label="Zasobnik 80 l" data-h="4.4" data-vessel="true"/>',
);

// Naczynie przeponowe jako jedyne z prawej strony nie ma podpisu w pliku
// projektanta. Karta jest nizsza od sasiednich (101 zamiast 161 px) i pod
// ikona zostaje ledwie 33 px — na dwie linijki po 13 px za malo. Podpis idzie
// wiec POD karte, na tej samej wysokosci co podpisy zasobnika i pompy ciepla
// (455 i 474 px w ukladzie rysunku to dolny rzad; tutaj 327.76 i 346.76),
// dzieki czemu cala prawa strona czyta sie w jednej linii.
podmien(
  'naczynie przeponowe',
  '    <g id="expansion-tank">\n      <rect class="st5" x="1248.92" y="208.76" width="91" height="101" rx="15" ry="15"/>',
  '    <g id="expansion-tank" data-element="naczynie-prawe">\n      <rect class="st5 karta" x="1248.92" y="208.76" width="91" height="101" rx="15" ry="15"' +
    ' data-object="naczynie-prawe" data-label="Naczynie przeponowe" data-h="1.4"/>\n' +
    // Odsuniecia z pomiaru getBBox w przegladarce, nie z oszacowania:
    // „Naczynie" ma 53.9 px, „przeponowe" 71.2 px przy 13 px Arial.
    '      <text class="st13" transform="translate(1267.47 327.76)">Naczynie</text>\n' +
    '      <text class="st13" transform="translate(1258.82 346.76)">przeponowe</text>',
);

podmien(
  'pompa ciepla',
  '    <g id="heat-pump">\n      <rect class="st5" x="1413.92" y="208.76" width="230" height="161" rx="15" ry="15"/>',
  '    <g id="heat-pump" class="device" data-state="HP_STATE" data-element="heatpump">\n' +
    '      <rect class="st5 karta" x="1413.92" y="208.76" width="230" height="161" rx="15" ry="15"' +
    ' data-object="heatpump" data-label="Pompa ciepła" data-h="3"/>\n' +
    '      <circle class="device__led" cx="1624" cy="228" r="5"/>',
);

podmien(
  'cieplomierz',
  '    <g id="heat-meter">',
  '    <g id="heat-meter" data-element="meter">',
);
// Cieplomierz pokazuje ODCZYTY WPROST NA SCHEMACIE — dwie linijki pod karta.
//
// Wczesniej trzeba bylo w niego kliknac, zeby zobaczyc cokolwiek poza napisem
// „Wh". Temperatura i przeplyw sa jednak tym, co mowi, CZY INSTALACJA PRACUJE,
// wiec musza byc widoczne bez klikania; reszta (moc, liczniki energii, ΔT)
// zostaje w panelu.
//
// MIEJSCE JEST CIASNE i to ono narzuca uklad. Karta konczy sie na y=124.16,
// a rura biegnie na y=156.36 — zostaja 32 px. Dwie linijki po 11 px z odstepem
// 13 px mieszcza sie tam z zapasem okolo 2 px; przy 13 px, jak reszta opisow,
// druga linijka wchodzilaby juz na rure. Stad mniejszy stopien pisma.
//
// Wartosci sa w kolorze ciepla, zeby odrozniac odczyt od podpisow rysunku:
// czarne cyfry pod czarnym napisem „Ciepłomierz" czytalyby sie jak kolejna
// etykieta, a nie jak zywa liczba.
podmien(
  'karta cieplomierza',
  '<rect class="st5" x="1160.52" y="60.16" width="64" height="64" rx="14" ry="14"/>',
  '<rect class="st5 karta" x="1160.52" y="60.16" width="64" height="64" rx="14" ry="14"' +
    ' data-object="meter" data-label="Ciepłomierz" data-h="1.2"/>\n' +
    '          <g class="odczyt-miernika">\n' +
    '            <text class="odczyt-miernika__wartosc" text-anchor="middle"' +
    ' transform="translate(1192.52 139)" data-point="METER_T1" data-unit="°C">—</text>\n' +
    '            <text class="odczyt-miernika__wartosc" text-anchor="middle"' +
    ' transform="translate(1192.52 152)" data-point="METER_FLOW" data-unit="m³/h">—</text>\n' +
    '          </g>',
);

podmien(
  'pompa obiegowa',
  '    <g id="circulation-pump">',
  '    <g id="circulation-pump" class="device" data-state="PUMP_STATE" data-element="pump">',
);
podmien(
  'karta pompy obiegowej',
  '<rect class="st5" x="1254.52" y="60.16" width="64" height="64" rx="14" ry="14"/>',
  '<rect class="st5 karta" x="1254.52" y="60.16" width="64" height="64" rx="14" ry="14"' +
    ' data-object="pump" data-label="Pompa obiegowa" data-h="1.3"/>\n' +
    '      <circle class="device__led" cx="1310" cy="68" r="4"/>',
);

podmien(
  'zaworek lewy',
  '    <g id="safety-valve-left">',
  '    <g id="safety-valve-left" data-element="zawor-bezp-lewy">',
);
podmien(
  'karta zaworka lewego',
  '<rect class="st7" x="477.52" y="61.16" width="65" height="64" rx="14" ry="14"/>',
  '<rect class="st7 karta" x="477.52" y="61.16" width="65" height="64" rx="14" ry="14"/>',
);
podmien(
  'zaworek prawy',
  '    <g id="safety-valve-right">',
  '    <g id="safety-valve-right" data-element="zawor-bezp-prawy">',
);
podmien(
  'karta zaworka prawego',
  '<rect class="st5" x="1354.52" y="61.16" width="65" height="64" rx="14" ry="14"/>',
  '<rect class="st5 karta" x="1354.52" y="61.16" width="65" height="64" rx="14" ry="14"/>',
);

// Manometry sa teraz zwyklymi kolkami (w v3 byly rastrami w masce), wiec
// klikalnosc wiesza sie wprost na tarczy — bez podkladanego lapacza.
podmien(
  'manometr lewy',
  '<circle class="st6" cx="758.92" cy="57.16" r="14.96"/>',
  '<circle class="st6 karta" data-element="manometr-lewy" cx="758.92" cy="57.16" r="14.96"/>',
);
podmien(
  'manometr prawy',
  '<circle class="st6" cx="1045.61" cy="57.16" r="14.96"/>',
  '<circle class="st6 karta" data-element="manometr-prawy" cx="1045.61" cy="57.16" r="14.96"/>',
);

// --- 5. Dolny rzad: uzupelnienie brakujacych urzadzen ---------------------
//
// Projektant przeniosl ciag uzdatniania wody z ukrytej sekcji `water-treatment`
// w dolny rzad trzech kart, ale zdazyl opisac tylko pierwsza. Kolejnosc od
// lewej zgadza sie z oryginalem (woda → filtr → podgrzewacz), a pierwsza karta
// nosi juz podpis „Woda wodociagowa", wiec przypisanie jest jednoznaczne.
//
// Ikony i podpisy sa PRZENIESIONE z ukrytej sekcji tego samego pliku — nie
// rysowane od nowa. Dzieki temu kreska, grubosc i kerning zgadzaja sie
// z reszta rysunku.
//
// Uklad kafelka bierzemy z karty zasobnika po prawej (ikona w gornej czesci,
// dwie linijki podpisu nizej), a nie z ukrytej sekcji, gdzie podpis byl NAD
// ikona. Srodek ikony wypada 55 px pod gornaa krawedzia karty, podpisy na
// 119 i 138 px — dokladnie jak w karcie zasobnika.
const SRODEK_IKONY = 55;
const KARTA_GORA = 336.23;
const Y_IKONY = KARTA_GORA + SRODEK_IKONY; // 391.23

/** Przesuniecie ikony z ukrytej sekcji na srodek docelowej karty. */
function przesunIkone(srodekZrodlaX, srodekZrodlaY, srodekKartyX) {
  return `translate(${(srodekKartyX - srodekZrodlaX).toFixed(2)} ${(Y_IKONY - srodekZrodlaY).toFixed(2)})`;
}

// Kropla — z grupy #water-supply. Srodek (57.5, 311.71).
const IKONA_WODA =
  `      <g transform="${przesunIkone(57.5, 311.71, 205.33)}">\n` +
  '        <path class="st2" d="M57.5,298.21c-5,8-9,13-9,18s4.03,9,9,9,9-4.03,9-9-4-10-9-18Z"/>\n' +
  '      </g>';

// Lejek — z grupy #filter. Srodek (217.5, 312.21).
const IKONA_FILTR =
  `      <g transform="${przesunIkone(217.5, 312.21, 368.12)}">\n` +
  '        <path class="st2" d="M207.5,303.21h20M210.5,303.21v5h14v-5M211.5,308.21l2,16h8l2-16M216.5,312.21v8M219.5,312.21v8"/>\n' +
  '        <path class="st2" d="M213.5,300.21h8"/>\n' +
  '      </g>';

// Grzalka — z grupy #water-heater. Srodek (395, 311.71).
const IKONA_PODGRZEWACZ =
  `      <g transform="${przesunIkone(395, 311.71, 545.61)}">\n` +
  '        <rect class="st2" x="376.5" y="300.21" width="37" height="23" rx="5" ry="5"/>\n' +
  '        <path class="st2" d="M383.5,317.21v-10c0-2,1-3,3-3s3,1,3,3v9c0,2,1,3,3,3s3-1,3-3v-9c0-2,1-3,3-3s3,1,3,3v9c0,2,1,3,3,3s3-1,3-3v-10"/>\n' +
  '      </g>';

/** Dwie linijki podpisu. Odsuniecia od srodka karty przepisane z oryginalu,
 *  wiec tekst jest wysrodkowany tak samo jak na pozostalych kafelkach. */
function podpis(srodekX, gora, dol) {
  return (
    `      <text class="st13" transform="translate(${(srodekX + gora.dx).toFixed(2)} 455.23)">${gora.tekst}</text>\n` +
    `      <text class="st13" transform="translate(${(srodekX + dol.dx).toFixed(2)} 474.23)">${dol.tekst}</text>`
  );
}

// Woda wodociagowa — karta ma juz podpis, dokladamy sama ikone.
podmien(
  'ikona wody wodociagowej',
  '    <g id="storage-tank2" data-name="storage-tank">\n      <rect class="st5" x="145.83" y="336.23" width="119" height="161" rx="15" ry="15"/>',
  '    <g id="storage-tank2" data-name="storage-tank" data-element="woda">\n' +
    '      <rect class="st5 karta" x="145.83" y="336.23" width="119" height="161" rx="15" ry="15"' +
    ' data-object="woda" data-label="Woda wodociągowa" data-h="1.2"/>\n' +
    IKONA_WODA,
);

// Filtr odkamieniajacy — karta byla calkiem pusta.
podmien(
  'filtr odkamieniajacy',
  '    <g id="storage-tank1" data-name="storage-tank">\n      <rect class="st5" x="308.62" y="336.23" width="119" height="161" rx="15" ry="15"/>\n    </g>',
  '    <g id="storage-tank1" data-name="storage-tank" data-element="filtr">\n' +
    '      <rect class="st5 karta" x="308.62" y="336.23" width="119" height="161" rx="15" ry="15"' +
    ' data-object="filtr" data-label="Filtr odkamieniający" data-h="1.6"/>\n' +
    IKONA_FILTR +
    '\n' +
    podpis(368.12, { dx: -11.55, tekst: 'Filtr' }, { dx: -44.9, tekst: 'odkamieniający' }) +
    '\n    </g>',
);

// Podgrzewacz wody wodociagowej — karta byla calkiem pusta.
podmien(
  'podgrzewacz wody',
  '    <g id="heat-pump1" data-name="heat-pump">\n      <rect class="st5" x="472.13" y="336.23" width="146.96" height="161" rx="15" ry="15"/>\n    </g>',
  '    <g id="heat-pump1" data-name="heat-pump" data-element="podgrzewacz">\n' +
    '      <rect class="st5 karta" x="472.13" y="336.23" width="146.96" height="161" rx="15" ry="15"' +
    ' data-object="podgrzewacz" data-label="Podgrzewacz wody" data-h="2"/>\n' +
    IKONA_PODGRZEWACZ +
    '\n' +
    podpis(545.61, { dx: -56, tekst: 'Podgrzewacz wody' }, { dx: -40.83, tekst: 'wodociągowej' }) +
    '\n    </g>',
);

// --- 6. Warstwa przeplywu -------------------------------------------------
//
// W v4 rury sa znowu wektorami, wiec sciezki przeplywu to NIE aproksymacja:
// kazda z nich odtwarza wspolrzedne konkretnej rury z pliku projektanta.
// Zaokraglenia naroznikow (r=11.34) pomijamy — kreska ma 3 px w rurze o 6 px,
// wiec sciecie rogu jest niewidoczne, a zapis M/H/V czyta tez parser sceny 3D.
const PRZEPLYW =
  '  <!-- KONTRAKT: warstwa przeplywu — osie rur przepisane z rysunku. -->\n' +
  '  <g id="warstwa-przeplywu" fill="none">\n' +
  // Pompa ciepla → magazyn. Rura gorna, kierunek odwrocony wzgledem zapisu
  // projektanta, bo animacja ma isc od zrodla do zbiornika.
  '    <path class="tube__flow tube__flow--supply" data-flow="pcm-supply"' +
  ' data-flow-source="METER_FLOW" d="M1469.53 207.36 V90.79 H922.73 V156.9"/>\n' +
  // Magazyn → zasobnik 80 l.
  '    <path class="tube__flow tube__flow--return" data-flow="pcm-return"' +
  ' data-flow-source="METER_FLOW" d="M938.9 157.02 V106.36 H1108.49 V207.35"/>\n' +
  // Zasobnik → pompa ciepla (spiecie po prawej, w v3 go nie bylo).
  '    <path class="tube__flow tube__flow--return" data-flow="hp-loop"' +
  ' data-flow-source="METER_FLOW" d="M1151.75 207.23 V156.36 H1443.34 V207.35"/>\n' +
  // Magazyn → dolny rzad uzdatniania wody.
  '    <path class="tube__flow tube__flow--supply" data-flow="dhw-supply"' +
  ' data-flow-source="METER_FLOW" d="M838.63 157.02 V106.36 H686.48 V460.92 H130.65"/>\n' +
  // Powrot gorna rura do zbiornika.
  '    <path class="tube__flow tube__flow--return" data-flow="dhw-return"' +
  ' data-flow-source="METER_FLOW" d="M334.17 90.79 H854.8 V156.9"/>\n' +
  '  </g>\n';

// Warstwa ma lezec NA rurach, ale POD kartami zaworkow, cieplomierza i pompy
// — plyn wchodzi w urzadzenie, nie przechodzi po jego wierzchu.
podmien('miejsce na przeplyw', '  <g id="upper-controls">', PRZEPLYW + '  <g id="upper-controls">');

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
