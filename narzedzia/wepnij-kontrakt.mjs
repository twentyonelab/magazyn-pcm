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
    '  viewBox="42 50 1451 606" preserveAspectRatio="xMidYMid meet"\n' +
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

      /* Odczyt na rurze — ta sama rodzina co sondy, ale bez klikania. */
      .rura-odczyt { fill: var(--akcent, #ff5b1a); }
      .rura-odczyt.is-no-data, .rura-odczyt.is-not-connected { fill: #a3a3a0; }
      .rura-odczyt.is-stale { opacity: .55; }
      /* Kropka pomiarowa na rurze bez przypisanego punktu: szara, nigdy
         w barwie nosnika. Punkt bez pomiaru nie moze wygladac jak zywy. */
      .rura-pomiar--brak { stroke: #a3a3a0; }

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

// --- 4. Temperatury na rurach --------------------------------------------
//
// W pliku stoja cztery odczyty „24.8°C" wpisane na sztywno — dwie pary na
// rurach nad zbiornikiem. Zadnej z nich nie wolno zostawic jako tekstu, bo
// liczba wpisana w grafike wyglada dokladnie jak pomiar.
//
// PRAWA PARA (x≈859) lezy na obiegu ZRODLA, czyli tam, gdzie stoi cieplomierz
// AXIOMA: gora — zasilanie, dol — powrot. Te dwa punkty sa zmapowane i zywe.
//
// LEWA PARA (x≈596) lezy na obiegu ODBIORU. Tam nie ma czym zmierzyc
// temperatury — drugi cieplomierz nie jest podlaczony do aplikacji. Zostaje
// wiec kreska i szara kropka, a podpowiedz mowi wprost, ze pomiaru nie ma.
// Podstawienie tu czegokolwiek innego byloby zla dana udajaca dobra.
const ODCZYTY_RUR = [
  { x: 840.16, y: 99.3, cx: 859.18, cy: 114.63, punkt: 'METER_T1', opis: 'Zasilanie obiegu źródła' },
  { x: 840.16, y: 174.55, cx: 859.18, cy: 150.33, punkt: 'METER_T2', opis: 'Powrót obiegu źródła' },
  { x: 577.42, y: 99.3, cx: 596.44, cy: 114.63, punkt: null, opis: 'Obieg odbioru — brak pomiaru temperatury' },
  { x: 577.42, y: 174.55, cx: 596.44, cy: 150.33, punkt: null, opis: 'Obieg odbioru — brak pomiaru temperatury' },
];

for (const o of ODCZYTY_RUR) {
  const tekstStary = `<text class="st12" transform="translate(${o.x} ${o.y})"><tspan x="0" y="0">24.8°C</tspan></text>`;
  const tekstNowy = o.punkt
    ? `<text class="st12 rura-odczyt" data-point="${o.punkt}" data-unit="°C" transform="translate(${o.x} ${o.y})">—</text>`
    : `<text class="st12 rura-odczyt is-not-connected" transform="translate(${o.x} ${o.y})">—<title>${o.opis}</title></text>`;
  podmien(`odczyt na rurze (${o.x}, ${o.y})`, tekstStary, tekstNowy);

  const kropkaStara = `<circle class="st8" cx="${o.cx}" cy="${o.cy}" r="4.5"/>`;
  const kropkaNowa = o.punkt
    ? `<circle class="sensor__cell" fill="#fff" cx="${o.cx}" cy="${o.cy}" r="4.5"><title>${o.opis}</title></circle>`
    : `<circle class="st8 rura-pomiar--brak" fill="#fff" cx="${o.cx}" cy="${o.cy}" r="4.5"><title>${o.opis}</title></circle>`;
  podmien(`kropka na rurze (${o.cx}, ${o.cy})`, kropkaStara, kropkaNowa);
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

// Pompa ciepla — karta z lampka stanu w prawym gornym rogu.
podmien(
  'pompa ciepla',
  '<rect class="st5" x="1247.28" y="369.22" width="230" height="161" rx="7.41" ry="7.41"/>',
  '<g class="device" data-state="HP_STATE" data-element="heatpump">\n' +
    '    <rect class="st5 karta" x="1247.28" y="369.22" width="230" height="161" rx="7.41" ry="7.41"' +
    ' data-object="heatpump" data-label="Pompa ciepła" data-h="3"/>\n' +
    '    <circle class="device__led" cx="1459" cy="387" r="5"/>\n' +
    '  </g>',
);

// Pompa obiegowa — tarcza z trojkatem u gory rysunku.
podmien(
  'pompa obiegowa',
  '<circle class="st6" cx="1104.95" cy="114.13" r="14.39"/>',
  '<g class="device" data-state="PUMP_STATE" data-element="pump">\n' +
    '    <circle class="st6 karta" cx="1104.95" cy="114.13" r="14.39"' +
    ' data-object="pump" data-label="Pompa obiegowa" data-h="1.3"/>\n' +
    '    <circle class="device__led" cx="1119" cy="101" r="4"/>\n' +
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

// Rzad uzdatniania wody po lewej. Przypisanie idzie po polozeniu: pigulka przy
// podpisie „Woda wodociągowa", szeroka karta obok to podgrzewacz (jego podpis
// jest w pliku obrysowany na krzywe, wiec nie da sie go znalezc po tresci).
podmien(
  'karta wody wodociagowej',
  '<rect class="st20" x="161.98" y="414.3" width="119" height="43.54" rx="20.95" ry="20.95"/>',
  '<rect class="st20 karta" data-element="woda" x="161.98" y="414.3" width="119" height="43.54" rx="20.95" ry="20.95"' +
    ' data-object="woda" data-label="Woda wodociągowa" data-h="1.2"/>',
);
podmien(
  'karta podgrzewacza',
  '<rect class="st20" x="325.49" y="385.84" width="146.96" height="97.77" rx="15" ry="15"/>',
  '<rect class="st20 karta" data-element="podgrzewacz" x="325.49" y="385.84" width="146.96" height="97.77" rx="15" ry="15"' +
    ' data-object="podgrzewacz" data-label="Podgrzewacz wody" data-h="2"/>',
);

// --- 6. Warstwa przeplywu ------------------------------------------------
//
// SCIEZKI PRZEPISANE Z RUR, NIE NARYSOWANE OD NOWA. Kazda linia nizej to
// atrybut `d` konkretnej rury (.st21) z pliku projektanta, skopiowany znak
// w znak. Dzieki temu animowana kreska biegnie dokladnie osia rury i nie ma
// czego dostrajac po kolejnej wersji rysunku — wystarczy przepisac na nowo.
//
// Kierunek zapisu jest kierunkiem rysowania projektanta i nie zawsze zgadza
// sie z kierunkiem przeplywu; `--supply` / `--return` mowi tylko, ktora
// kreska nalezy do zasilania, a ktora do powrotu.
const RURY = [
  {
    nazwa: 'odbior-gora',
    rola: 'supply',
    d: 'M167.53,244.91v-118.42c0-6.48,5.26-11.74,11.74-11.74h504.43c6.22,0,11.3,5.1,10.47,12.27v169.19',
  },
  {
    nazwa: 'odbior-powrot',
    rola: 'return',
    d: 'M671.99,296.22v-134.54c0-6.24-5.11-11.35-11.35-11.35h-129.45c-6.24,0-11.35,5.11-11.35,11.35v262.91c0,6.28-5.09,11.37-11.37,11.37h-36.02',
  },
  {
    nazwa: 'zrodlo-zasilanie',
    rola: 'supply',
    d: 'M749.26,296.22V126.1c0-6.24,5.1-11.34,11.34-11.34h530.95c6.24,0,11.34,5.1,11.34,11.34v243.12',
  },
  {
    nazwa: 'bufor-zasilanie',
    rola: 'return',
    d: 'M772.26,296.22v-134.55c0-6.24,5.1-11.34,11.34-11.34h146.91c6.24,0,11.34,5.1,11.34,11.34v209.7',
  },
  {
    nazwa: 'bufor-pompa',
    rola: 'return',
    d: 'M985.11,371.26v-159.58c0-6.24,5.1-11.34,11.34-11.34h268.91c6.24,0,11.34,5.1,11.34,11.34v157.55',
  },
];

const PRZEPLYW =
  '  <!-- KONTRAKT: warstwa przeplywu — osie rur przepisane z rysunku. -->\n' +
  '  <g id="warstwa-przeplywu" fill="none">\n' +
  RURY.map(
    (r) =>
      `    <path class="tube__flow tube__flow--${r.rola}" data-flow="${r.nazwa}"` +
      ` data-flow-source="METER_FLOW" d="${r.d}"/>`,
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
