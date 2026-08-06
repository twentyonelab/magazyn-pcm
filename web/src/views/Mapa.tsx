/**
 * Widok Mapa — pierwszy ekran aplikacji.
 *
 * Odpowiada na pytanie „gdzie to stoi", zanim odpowie się na „co pokazuje".
 * Na mapie Śląska jest jedno stanowisko z czujnikami i dwadzieścia punktów
 * pokazowych. Kliknięcie w to jedno prawdziwe wchodzi do widoku Magazyn.
 *
 * MAPA JEST TRÓJWYMIAROWA — styl Mapbox Standard, motyw „monochrome" (do zmiany
 * przełącznikiem pod lupami), oświetlenie za trybem aplikacji: „day" w jasnym,
 * „night" w ciemnym. Wszystkie
 * nazwy ustawień pochodzą z dokumentacji Mapboxa (patrz stałe niżej), żadna
 * nie jest zgadnięta.
 *
 * CZEGO 3D NIE DAJE PRZY TEJ SKALI: bryły budynków Mapbox rysuje dopiero przy
 * dużym przybliżeniu. Widok całego Śląska jest za daleko, żeby cokolwiek z nich
 * zobaczyć — przestrzenność robi tu pochylenie kamery i rzeźba terenu (Beskidy
 * na południu). Budynki pojawią się same, gdy przybliżyć do miasta.
 */

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MaterialProfile } from '@magazyn-pcm/shared';
import {
  KADR,
  LOKALIZACJE,
  MAX_GRANICE,
  STANOWISKA,
  STANOWISKO_CHLOD,
  STANOWISKO_CIEPLO,
  type Lokalizacja,
} from '../map/lokalizacje.js';
import type { LiveData } from '../useLiveData.js';
import { useAppliedTheme } from '../theme.js';
import { blokMiniPrzebiegu, pobierzMiniPrzebieg, type MiniPrzebieg } from '../map/miniprzebieg.js';
import { naladowanieProcent, sredniaZSond } from '../naladowanie.js';
import { procentSoc } from '../soc.js';
import type { Kierunek } from '../soc.js';
import { PALETA, barwaNosnika } from '../kolory-magazynu.js';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

/**
 * Styl i jego ustawienia — wszystko z dokumentacji Mapbox Standard.
 *
 *   styl              mapbox://styles/mapbox/standard
 *   importId          'basemap'  (klucz, pod którym siedzą ustawienia)
 *   lightPreset       'dawn' | 'day' | 'dusk' | 'night'
 *   theme             'default' | 'faded' | 'monochrome' | 'custom'
 *   show3dObjects     bryły budynków, drzewa, punkty charakterystyczne
 *
 * Motywy „ocean", „warm" i „vivid" z galerii Mapboxa NIE są wartościami pola
 * `theme` — wymagają `theme: 'custom'` i własnej tablicy barw (`theme-data`
 * w postaci obrazu LUT zakodowanego base64). Nie używamy ich, bo prośba
 * dotyczyła „faded", które jest wartością wbudowaną.
 */
const STYL = 'mapbox://styles/mapbox/standard';
const IMPORT_ID = 'basemap';

/**
 * Sposoby kolorowania mapy — wartości pola `theme` stylu Mapbox Standard.
 *
 * Domyślny jest teraz `monochrome`: chłodno-ciepłe szarości, bez zieleni
 * i błękitów, na których znaczniki magazynów gubiły się w tle. Mapa ma być
 * podkładem, a nie treścią.
 *
 * `faded` i `default` zostają do wyboru — pierwszy to poprzedni wygląd,
 * drugi pełna paleta Mapboxa. Przełącznik siedzi pod przyciskami
 * powiększania.
 */
const SPOSOBY_KOLOROWANIA = [
  { id: 'monochrome', etykieta: 'szarości', opis: 'Chłodno-ciepłe szarości — domyślny' },
  { id: 'faded', etykieta: 'przygaszony', opis: 'Przygaszone barwy' },
  { id: 'default', etykieta: 'kolorowy', opis: 'Pełna paleta Mapboxa' },
] as const;

type SposobKolorowania = (typeof SPOSOBY_KOLOROWANIA)[number]['id'];

const MOTYW_DOMYSLNY: SposobKolorowania = 'monochrome';

/** Źródło rzeźby terenu — identyfikator i adres z dokumentacji Mapboxa. */
const DEM_ID = 'mapbox-dem';
const DEM_URL = 'mapbox://mapbox.mapbox-terrain-dem-v1';

/*
 * PODPISÓW MAPY NIE DA SIĘ PRZYGASIĆ — sprawdzone, nie założone.
 *
 * Prośba brzmiała: nazwy miast na 30% krycia. Nie zrobiłem tego, bo styl
 * Mapbox Standard na to nie pozwala, i wolę zostawić tu powód niż martwy kod.
 *
 * Co sprawdziłem w działającej aplikacji:
 *   • warstwy podpisów WIDAĆ w `getStyle().imports[0].data.layers`
 *     (settlement-major-label, state-label, country-label i dalsze),
 *   • ale `map.getLayer(id)` zwraca dla nich `undefined` — nie są
 *     adresowalne z zewnątrz, bo należą do importowanego stylu,
 *   • `setPaintProperty` na nich NIE rzuca wyjątku, tylko zgłasza błąd
 *     zdarzeniem `error` — czyli u nas czerwonym banerem „Mapa nie wczytała
 *     się w całości". To dlatego pierwsze podejście wyglądało na udane:
 *     wnioskowałem z braku wyjątku, co niczego nie dowodziło,
 *   • konfiguracja Standard nie ma żadnej właściwości barwy ani krycia
 *     podpisów — `colorPlaceLabel` i `placeLabelColor` zwracają `null`.
 *     Jest wyłącznie `showPlaceLabels`: włącz albo wyłącz.
 *
 * Zostają więc dwie realne drogi, obie do decyzji:
 *   1. `showPlaceLabels: false` i własne podpisy miast jako znaczniki —
 *      pełna kontrola nad krycien, ale trzeba je wybrać i rozmieścić,
 *   2. zejście ze Standard na klasyczny styl (np. `light-v11`), którego
 *      warstwy SĄ adresowalne — kosztem trójwymiaru i pola `theme`,
 *      czyli tych szarości, o które prosiłeś w tej samej wiadomości.
 *
 * Do tego czasu podpisy zostają w barwie stylu; motyw `monochrome` i tak
 * je odbarwia.
 */

/** Pochylenie kamery. Bez niego „3D" jest tylko nazwą. */
const POCHYLENIE = 52;

/** Pochylenie i przybliżenie po kliknięciu w pinezkę — tak blisko, jak można. */
const ZOOM_BLISKO = 18;
const POCHYLENIE_BLISKO = 62;

function ustawieniaBazy(ciemny: boolean, motyw: SposobKolorowania): Record<string, string | boolean> {
  return {
    lightPreset: ciemny ? 'night' : 'day',
    theme: motyw,
    show3dObjects: true,
    showPlaceLabels: true,
    // Znaczniki sklepów i restauracji zabierałyby uwagę naszym dwudziestu
    // jednemu punktom — a to one są tu treścią.
    showPointOfInterestLabels: false,
    // Numery i nazwy dróg zdjęte — mapa ma pokazywać, GDZIE stoją magazyny,
    // a nie jak do nich dojechać.
    showRoadLabels: false,
  };
}

/**
 * Zdjęcie lotnicze miejsca — Static Images API Mapboxa.
 *
 * NIE MAM zdjęć tych budynków, więc nie podstawiam wymyślonych. To zdjęcie
 * SATELITARNE z tych samych danych, z których zrobiona jest mapa: prawdziwy
 * obraz tego miejsca, tylko z góry. Gdy pojawi się fotografia stanowiska,
 * wystarczy podmienić adres dla punktu w `lokalizacje.ts`.
 *
 * Wzór adresu i identyfikator stylu `satellite-v9` wprost z dokumentacji:
 *   /styles/v1/{username}/{style_id}/static/{lon},{lat},{zoom}/{w}x{h}{@2x}
 */
function zdjecieLotnicze(lon: number, lat: number, w: number, h: number, zoom = 16): string {
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/` +
    `${lon},${lat},${zoom}/${w}x${h}@2x?access_token=${TOKEN ?? ''}`
  );
}

/**
 * Treść dymka. Budowana jako HTML, bo Mapbox przyjmuje `setHTML` — to nie jest
 * drzewo Reacta i nie ma tu jego ochrony przed wstrzyknięciem, więc do środka
 * wchodzą WYŁĄCZNIE nasze własne teksty z `lokalizacje.ts` i liczby. Żadnych
 * danych z zewnątrz.
 */
function trescDymka(
  punkt: Lokalizacja,
  sredniaC: number | null,
  procent: number | null,
  /**
   * Rodzaj magazynu do pokolorowania karty. Dla stanowiska badawczego idzie
   * z ROZPOZNANEGO MATERIAŁU, nie z pola `punkt.typ` — zbiorniki są wymienne
   * i to materiał decyduje, czy to magazyn ciepła, czy chłodu.
   */
  kierunek: Kierunek,
  /** Skąd pochodzi procent — podpis musi mówić prawdę o metodzie. */
  opisZrodla = 'szacunek z temperatury',
  /**
   * Uwaga NAD blokiem naładowania — dla stanowiska bez wpiętych sond.
   * Odczyty pokazujemy (jeden Miniserver, jeden zestaw sond), ale to zdanie
   * mówi, że pochodzą z drugiego zbiornika. Liczba bez tej informacji
   * udawałaby własny pomiar.
   */
  notka: string | null = null,
  /**
   * Mini-przebieg 24 h — gotowy blok HTML z `blokMiniPrzebiegu`, tylko dla
   * stanowisk live. Punkt pokazowy go nie dostaje: nie ma historii pomiarów,
   * a wykres z wymyślonych liczb wyglądałby jak zapis z czujnika.
   */
  miniPrzebieg = '',
): string {
  const zdjecie =
    `<img class="dymek__zdjecie" alt="Zdjęcie lotnicze — ${punkt.nazwa}" loading="lazy" ` +
    `src="${zdjecieLotnicze(punkt.lon, punkt.lat, 280, 110, punkt.stan === 'live' ? 17 : 14)}">`;

  const paleta = PALETA[kierunek];

  // Nazwa instalacji w kolorze rodzaju magazynu — ten sam kod barwny co
  // znacznik i co reszta interfejsu. Miasto schodzi do wiersza położenia:
  // w karcie jest miejsce, żeby powiedzieć jedno i drugie.
  const naglowek =
    `<p class="dymek__nazwa" style="color:${paleta.glowny}">${punkt.nazwa}</p>` +
    `<p class="dymek__miejsce">${punkt.miasto}</p>` +
    `<p class="dymek__opis">${punkt.opis}</p>`;

  // Poziom naładowania: dla stanowiska z prawdziwych sond, dla punktów
  // pokazowych z wartości wpisanej na stałe — i wtedy podpisany jako pokazowy.
  const poziom = punkt.stan === 'live' ? procent : Math.round((punkt.demoNaladowanie ?? 0) * 100);

  const uwaga = notka ? `<p class="dymek__akcja">${notka}</p>` : '';

  const ladunek =
    poziom === null
      ? '<p class="dymek__akcja">Brak odczytu sond — naładowania nie da się oszacować</p>'
      : '<div class="ladunek">' +
        '<div class="ladunek__gora">' +
        `<span class="ladunek__etykieta">naładowanie · ${
          punkt.stan === 'live' ? opisZrodla : 'wartość pokazowa'
        }</span>` +
        `<span class="ladunek__liczba mono" style="color:${paleta.glowny}">${poziom}%</span>` +
        '</div>' +
        `<div class="ladunek__tor"><div class="ladunek__wypelnienie" style="width:${poziom}%;background:linear-gradient(90deg,${paleta.jasny},${paleta.glowny})"></div></div>` +
        (punkt.stan === 'live' && sredniaC !== null
          ? `<p class="ladunek__spod">średnia z sond ${sredniaC.toFixed(1).replace('.', ',')} °C</p>`
          : '') +
        '</div>';

  /*
   * INSTRUKCJI OBSŁUGI W KARCIE NIE MA — usunięta 2026-08-04 na prośbę.
   *
   * Stał tu wiersz „Klik przybliża, drugi klik otwiera magazyn". Zachowanie
   * zostaje bez zmian, tylko przestaje być wypisane na rysunku: karta ma mówić
   * o instalacji, a nie o sobie. Opis dla czytników ekranu zostaje w atrybucie
   * `aria-label` znacznika, gdzie jest potrzebny i gdzie nikomu nie zasłania
   * treści.
   */
  return zdjecie + naglowek + uwaga + ladunek + miniPrzebieg;
}

interface Props {
  data: LiveData;
  /**
   * Wejście do widoku Magazyn po drugim kliknięciu w znacznik.
   *
   * Punkt idzie w argumencie, bo otwierać można KAŻDY: stanowisko badawcze
   * pokaże prawdziwe pomiary, punkt pokazowy — dane z modelu.
   */
  onOtworzMagazyn: (punkt: Lokalizacja) => void;
}

export function Mapa({ data, onOtworzMagazyn }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const theme = useAppliedTheme();
  const [blad, setBlad] = useState<string | null>(null);
  /*
   * UCHWYTY DO OBU STANOWISK — od 2026-08-05 Gliwice mają DWA żywe punkty:
   * magazyn chłodu (8HC) i magazyn ciepła (57HC), na jednym Miniserverze.
   * Sondy przepina się fizycznie, więc w danej chwili żyje jeden zestaw —
   * to, KTÓRY, rozpoznaje serwer po sondach (BankDetector), a mapa tylko
   * przełącza klasy: aktywne stanowisko pulsuje i nosi naładowanie,
   * nieaktywne stoi przygaszone.
   *
   * Tożsamość każdego punktu (barwa obrysu, podpis) jest STAŁA — to koniec
   * wcześniejszego przemalowywania pinezki po rozpoznaniu materiału: nie ma
   * już jednej pinezki o zmiennym rodzaju, są dwie o rodzajach ustalonych.
   * Znaczniki powstają raz, w efekcie montującym mapę; uchwyty pozwalają
   * odświeżać treść bez przebudowy (kadr, obrót i otwarty dymek zostają).
   */
  const stacjeRef = useRef(
    new Map<string, { dymek: mapboxgl.Popup; el: HTMLElement; wypelnienie: HTMLElement | null }>(),
  );
  /**
   * Naładowanie stanowiska widziane przez kod budujący znaczniki.
   * Efekt tworzący mapę nie może zależeć od `procent`, bo przy każdym odczycie
   * sond przebudowywałby całą mapę — dlatego wartość wchodzi referencją.
   */
  const procentRef = useRef<number | null>(null);
  /** Srednia z sond — barwa wypelnienia pinezki stanowiska. Referencja z tego
   *  samego powodu co procent: efekt tworzacy mape nie moze od niej zalezec. */
  /**
   * Polozenie sredniej na skali materialu (0..1) albo null. Referencja, bo
   * efekt tworzacy mape nie moze zalezec od danych — inaczej kazdy odczyt
   * sond przebudowywalby cala mape razem z kadrem i dymkami.
   */
  const pozycjaRef = useRef<number | null>(null);
  /**
   * Sposób kolorowania mapy. Zmiana nie przebudowuje mapy — wystarczy podać
   * Mapboxowi nową wartość `theme` przez `setConfigProperty`, a on przemaluje
   * styl na miejscu. Przebudowa gubiłaby kadr, obrót i otwarty dymek.
   */
  const [motywMapy, setMotywMapy] = useState<SposobKolorowania>(MOTYW_DOMYSLNY);
  const motywRef = useRef<SposobKolorowania>(MOTYW_DOMYSLNY);
  motywRef.current = motywMapy;
  /**
   * Motyw aplikacji widziany przez efekt tworzący mapę.
   *
   * REFERENCJĄ, NIE ZALEŻNOŚCIĄ — i to jest poprawka usterki, nie ozdoba.
   * Wcześniej `theme` stał w zależnościach tego efektu, więc przełączenie
   * jasny/ciemny burzyło mapę i stawiało ją od nowa: kadr wracał do widoku
   * całego Śląska. Kto dojechał do jednego magazynu, tracił go z oczu i musiał
   * szukać ponownie. Motyw dotyka wyłącznie oświetlenia (`lightPreset`),
   * a to Mapbox podmienia na wczytanym stylu — dokładnie jak sposób
   * kolorowania niżej.
   */
  const ciemnyRef = useRef(false);
  ciemnyRef.current = theme === 'dark';
  /** Uchwyt mapy — potrzebny, żeby przemalować ją bez przebudowy. */
  const mapaRef = useRef<mapboxgl.Map | null>(null);

  // Dane płyną? To decyduje, czy kropka stanowiska pulsuje.
  const zywe = data.link === 'live';

  // Naładowanie liczone tak samo jak w widoku Magazyn — ta sama definicja,
  // jedno źródło prawdy w `naladowanie.ts`.
  //
  // Hierarchia parafiny jest ta sama co w widoku Magazyn: sesja > rozpoznany
  // zbiornik > podgląd. Bez tego skala byłaby zgadnięta, a wtedy procent
  // naładowania nie znaczyłby nic.
  const rozpoznanyBank =
    data.health && data.health.bank.detection !== 'unknown' ? data.health.bank.active : null;
  const materialAktywny = data.session?.material ?? rozpoznanyBank;
  const profile: MaterialProfile | null = data.materials
    ? (data.materials.profiles[materialAktywny ?? data.materials.defaultMaterial] ?? null)
    : null;
  const sredniaC = sredniaZSond(data.points, data.values);
  // Kierunek bierze się z MATERIAŁU, nie z rodzaju punktu na mapie: to materiał
  // decyduje, czy „naładowany" znaczy gorący (57HC), czy zimny (8HC). Bez tego
  // zbiornik chłodu o 24 °C — czyli pusty — pokazywał na mapie 100%.
  const kierunekStanowiska: Kierunek =
    (materialAktywny ?? data.materials?.defaultMaterial) === 'RT8HC' ? 'chlod' : 'cieplo';
  // Naładowanie z BILANSU ENERGII serwera, gdy jest — ten sam odczyt co belka
  // i pasek pod zbiornikiem. Szacunek z temperatury zostaje trybem awaryjnym
  // (patrz server/src/soc-bilans.ts): w plateau przemiany zaniżał o ~30 punktów.
  // Bilans serwera liczy sie tylko dla parafiny, dla ktorej powstal —
  // patrz komentarz w views/Magazyn.tsx (kod D8 w Diagnostyce).
  const socSerwera =
    data.health?.soc && data.health.soc.material === materialAktywny ? data.health.soc : null;
  const procent =
    socSerwera && socSerwera.soc !== null
      ? procentSoc(socSerwera.soc)
      : naladowanieProcent(sredniaC, profile, kierunekStanowiska);
  const opisZrodla =
    socSerwera?.zrodlo === 'bilans-energii' ? 'z bilansu energii' : 'szacunek z temperatury';
  procentRef.current = procent;
  pozycjaRef.current =
    sredniaC === null || !profile || profile.scaleMax <= profile.scaleMin
      ? null
      : (sredniaC - profile.scaleMin) / (profile.scaleMax - profile.scaleMin);
  /**
   * Które z dwóch gliwickich stanowisk ma WPIĘTE SONDY.
   *
   * ROZSTRZYGA WYŁĄCZNIE ROZPOZNANIE SOND, nie sesja i nie podgląd. Pytanie
   * „gdzie fizycznie siedzą sondy" ma jedną odpowiedź i daje ją `BankDetector`.
   * Pierwsza wersja brała `kierunekStanowiska` (sesja > rozpoznanie) i przy
   * niezamkniętej sesji z 3.08 pulsowało stanowisko chłodu, choć sondy były
   * już w zbiorniku ciepła — czyli mapa pokazywała nie to, co jest, a to, co
   * ktoś kiedyś zadeklarował.
   *
   * Bez rozpoznania (`unknown`, tryb syntetyczny) nie ma czego wybierać, więc
   * oba stanowiska zostają uśpione — żadne nie udaje wtedy podłączonego.
   */
  const bankZeSond =
    data.health?.bank.detection === 'auto' ? data.health.bank.active : null;
  const aktywnaStacjaId =
    bankZeSond === null
      ? null
      : bankZeSond === 'RT8HC'
        ? STANOWISKO_CHLOD.id
        : STANOWISKO_CIEPLO.id;
  // Referencja, żeby uchwyt kliknięcia nie wymuszał przebudowy mapy.
  const otworzRef = useRef(onOtworzMagazyn);
  otworzRef.current = onOtworzMagazyn;

  /**
   * Mini-przebieg 24 h — jedna linia średniej z sond do karty stanowiska.
   *
   * JEDEN zestaw danych dla obu stanowisk: sondy są fizycznie jedne, a karta
   * stanowiska bez sond i tak mówi w notce, skąd pochodzą odczyty. Stan,
   * nie referencja — po nadejściu danych karty muszą się przerysować.
   */
  const [mini, setMini] = useState<MiniPrzebieg | null>(null);
  useEffect(() => {
    let zyje = true;
    const pobierz = (): void => {
      void pobierzMiniPrzebieg().then((wynik) => {
        if (zyje && wynik) setMini(wynik);
      });
    };
    pobierz();
    // Kubełek ma 15 minut, częstsze odpytywanie nic nowego nie przyniesie.
    const takt = window.setInterval(pobierz, 10 * 60_000);
    return () => {
      zyje = false;
      window.clearInterval(takt);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (!TOKEN) {
      setBlad(
        'Brak tokenu Mapbox. Dopisz VITE_MAPBOX_TOKEN do pliku .env i uruchom serwer od nowa.',
      );
      return;
    }

    mapboxgl.accessToken = TOKEN;
    const ciemny = ciemnyRef.current;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: host,
        style: STYL,
        // Ustawienia podane od razu przy tworzeniu mapy, a nie po jej wczytaniu —
        // inaczej pierwsza klatka mrugnęłaby domyślnym motywem i oświetleniem.
        config: { [IMPORT_ID]: ustawieniaBazy(ciemny, motywRef.current) },
        bounds: KADR,
        fitBoundsOptions: { padding: 64, pitch: POCHYLENIE },
        maxBounds: MAX_GRANICE,
        minZoom: 6,
        maxZoom: 20,
        pitch: POCHYLENIE,
        logoPosition: 'bottom-right',
        /**
         * ATRYBUCJI NIE WOLNO USUNĄĆ — i dlatego jej nie usuwam.
         *
         * Warunki Mapboxa: „Maps using Mapbox map styles or data supplied by
         * Mapbox must display both the Mapbox logo and text attribution".
         * Wyjątek dotyczy wyłącznie własnych stylów i własnych danych; my
         * używamy stylu i danych Mapboxa, więc wyjątek nas nie obejmuje.
         * Ukrycie tego napisu byłoby naruszeniem licencji.
         *
         * `compact: true` to najmniejsza forma, jaką Mapbox przewiduje:
         * zamiast pełnego wiersza zostaje mały krążek „i", który rozwija tekst
         * po kliknięciu. Tyle da się zredukować i nie więcej.
         */
        attributionControl: false,
      });

      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
      mapaRef.current = map;
    } catch (error) {
      setBlad(`Nie udało się otworzyć mapy: ${(error as Error).message}`);
      return;
    }

    // Kompas jest tu potrzebny, inaczej po obróceniu mapy nie ma jak wrócić.
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

    // Mapbox zgłasza brak sieci i zły token przez zdarzenie, nie przez wyjątek.
    map.on('error', (event) => {
      const wiadomosc = (event.error as Error | undefined)?.message ?? 'nieznany błąd';
      setBlad(
        /access token|unauthorized|401/i.test(wiadomosc)
          ? 'Mapbox odrzucił token. Sprawdź VITE_MAPBOX_TOKEN i ograniczenia adresów w panelu Mapbox.'
          : `Mapa nie wczytała się w całości: ${wiadomosc}`,
      );
    });

    // Rzeźba terenu. Przy widoku całego regionu to ona, obok pochylenia kamery,
    // daje wrażenie przestrzeni — bryły budynków są na tej skali niewidoczne.
    map.on('style.load', () => {
      if (map.getSource(DEM_ID)) return;
      map.addSource(DEM_ID, {
        type: 'raster-dem',
        url: DEM_URL,
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: DEM_ID, exaggeration: 1.4 });
    });

    /*
     * PODŚWIETLANIA BRYŁ BUDYNKÓW NIE MA — zdjęte 2026-08-06 na prośbę.
     *
     * Były tu interakcje na featuresecie `buildings` stylu Standard
     * (stany highlight/select, barwy w konfiguracji importu), które miały
     * barwić budynki 26 i 28 pod kursorem, jak w demo Mapbox Places.
     * Dopasowanie najechanej bryły do stanowiska okazało się zawodne
     * (obrysy docinane do kafli, budynki proceduralne bez wielokąta)
     * i po dwóch podejściach efekt dalej nie działał u użytkownika.
     * Decyzja: zostaje sam znacznik z kartą podglądu — ona niesie całą
     * treść (naładowanie, mini-przebieg 24 h), a budynek niech będzie
     * zwykłym budynkiem.
     */

    /**
     * Który punkt jest już przybliżony.
     *
     * PIERWSZY KLIK PRZYBLIŻA, DRUGI OTWIERA MAGAZYN. Dzięki temu da się
     * obejrzeć miejsce z bliska, nie tracąc mapy — a wejście do magazynu jest
     * decyzją, nie skutkiem ubocznym pokazania szczegółu.
     */
    let zblizony: string | null = null;

    // Oddalenie kasuje pamięć przybliżenia — po powrocie do widoku regionu
    // pierwszy klik znów ma przybliżać, a nie od razu wchodzić w magazyn.
    //
    // `originalEvent` jest tu kluczowe: dostają je tylko ruchy WYWOŁANE PRZEZ
    // UŻYTKOWNIKA (kółko, przeciągnięcie). Bez tego warunku nasz własny przelot
    // kamery kasował pamięć kliknięcia w chwili, gdy ją właśnie zapisaliśmy —
    // i drugi klik zachowywał się jak pierwszy.
    //
    // Świadomie NIE sprawdzamy też, czy przelot dobiegł końca. Gdyby drugi klik
    // tego wymagał, wystarczyłoby przerwać przelot przeciągnięciem, żeby
    // magazyn przestał się otwierać. Liczy się intencja: ten sam punkt
    // kliknięty po raz drugi.
    map.on('zoomend', (event) => {
      const odUzytkownika = (event as { originalEvent?: unknown }).originalEvent !== undefined;
      if (odUzytkownika && map.getZoom() < ZOOM_BLISKO - 2) zblizony = null;
    });

    /**
     * Podpisy punktów pokazowych pojawiają się dopiero po przybliżeniu.
     *
     * Nazwy instalacji są dłuższe od nazw miast, a w konurbacji katowickiej
     * dziesięć punktów leży w promieniu kilkunastu kilometrów — na widoku
     * całego Śląska ich podpisy zachodziły na siebie i na etykiety miast,
     * dając plamę tekstu zamiast informacji.
     *
     * Stanowisko badawcze jest podpisane ZAWSZE: to jedyny punkt, po który
     * naprawdę się tu przychodzi, i musi być rozpoznawalny bez przybliżania.
     * Punkt pokazowy nazwę pokaże też po najechaniu (reguła w arkuszu).
     */
    const PROG_PODPISOW = 9.4;
    const odswiezPodpisy = (): void => {
      hostRef.current?.classList.toggle('mapa--z-podpisami', map.getZoom() >= PROG_PODPISOW);
    };
    map.on('zoom', odswiezPodpisy);
    odswiezPodpisy();

    for (const punkt of LOKALIZACJE) {
      const live = punkt.stan === 'live';

      // Znacznik to KOŁO Z OBRYSEM, wypełnione od dołu do poziomu naładowania.
      //
      // Wcześniej stała tu biała karta z pionowym zbiornikiem w środku. Karta
      // zabierała mapie miejsce i przy dwudziestu jeden punktach robiła z niej
      // planszę kafelków — a mapa ma pokazywać teren. Koło zajmuje tyle, ile
      // musi, obrys niesie kolor, a poziom cieczy zostaje.
      //
      // RODZAJ JEST TOŻSAMOŚCIĄ PUNKTU — także dla stanowisk. Odkąd Gliwice
      // mają osobny punkt chłodu i osobny ciepła, żaden znacznik nie zmienia
      // już rodzaju po rozpoznaniu materiału; zmienia się tylko to, KTÓRY
      // z nich jest aktywny (efekt niżej).
      const kierunekPunktu = punkt.typ;
      const paleta = PALETA[kierunekPunktu];
      const poziom =
        live ? (procentRef.current ?? 0) : Math.round((punkt.demoNaladowanie ?? 0) * 100);

      /*
       * WYPEŁNIENIE PINEZKI IDZIE PO RODZINIE NOŚNIKA, nie po palecie A2.
       *
       * Paleta temperatur jest pastelowa i celowo obca wobec barw interfejsu —
       * na szarej mapie, gdzie pinezki są jedynym kolorem, odstawała od resztu
       * widoku (zgłoszone 2026-08-04). Barwa dalej mówi o temperaturze, ale
       * odcieniami ciepła albo chłodu: jasny → podstawowy → ciemny, im więcej
       * zgromadzonej energii, tym mocniej.
       *
       * WYSOKOŚĆ wypełnienia zostaje naładowaniem — osobny kanał, zgodnie
       * z zasadą 1 palety: barwa o stopniach, słupek o energii.
       *
       * PUNKT POKAZOWY nie ma temperatury, tylko wymyślone naładowanie, więc
       * dostaje jeden płaski odcień rodzaju. Malowanie go skalą temperatury
       * znaczyłoby, że ktoś tam mierzy stopnie.
       */
      const wypelnienie =
        live && pozycjaRef.current !== null
          ? barwaNosnika(kierunekPunktu, pozycjaRef.current)
          : paleta.jasny;

      const el = document.createElement('div');
      el.className = `pinezka is-${punkt.stan} is-${kierunekPunktu}`;
      // Podpis to NAZWA INSTALACJI, nie miasto: etykiety miast rysuje już sam
      // Mapbox i drugi taki napis obok pinezki czytał się jak jego powtórzenie.
      el.innerHTML =
        `<span class="pinezka__kolo" aria-hidden="true" style="border-color:${paleta.glowny}">` +
        `<span class="pinezka__wypelnienie" style="height:${poziom}%;background:${wypelnienie}"></span>` +
        '</span>' +
        `<span class="pinezka__podpis" style="color:${paleta.glowny}">${punkt.nazwa}</span>`;

      // Dymek. `offset` odsuwa go nad wierzchołek pinezki, żeby jej nie
      // zasłaniał; `closeButton` zbędny, bo dymek zamyka klik w mapę.
      const dymek = new mapboxgl.Popup({
        offset: 30,
        closeButton: false,
        className: `dymek is-${punkt.stan}`,
        maxWidth: '280px',
      }).setHTML(trescDymka(punkt, null, null, kierunekPunktu));

      if (live) {
        stacjeRef.current.set(punkt.id, {
          dymek,
          el,
          wypelnienie: el.querySelector('.pinezka__wypelnienie'),
        });
      }

      const marker = new mapboxgl.Marker({
        element: el,
        // Koło wskazuje miejsce swoim ŚRODKIEM, a podpis wisi pod nim i jest
        // wyłączony z układu (position: absolute), więc zaczepienie idzie na
        // środek koła, nie na dół całego znacznika.
        anchor: 'center',
        // Pinezka stoi pionowo niezależnie od pochylenia kamery — inaczej przy
        // pochyleniu 52 stopni położyłaby się na mapie i przestała być czytelna.
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport',
      })
        .setLngLat([punkt.lon, punkt.lat])
        .setPopup(dymek)
        .addTo(map);

      const kliknij = (): void => {
        const juzBlisko = zblizony === punkt.id;

        if (!juzBlisko) {
          zblizony = punkt.id;
          map.flyTo({
            center: [punkt.lon, punkt.lat],
            zoom: ZOOM_BLISKO,
            pitch: POCHYLENIE_BLISKO,
            duration: 1400,
            // `essential` sprawia, że ruch wykona się także u kogoś, kto
            // w systemie wyłączył animacje — inaczej mapa po prostu stanęłaby.
            essential: true,
          });
          return;
        }

        // Drugi klik otwiera magazyn — także pokazowy. Stanowisko badawcze
        // pokaże prawdziwe pomiary, punkt pokazowy dane z modelu; jedno i
        // drugie w barwie swojego nośnika.
        otworzRef.current(punkt);
      };

      el.addEventListener('click', kliknij);

      // Każdy znacznik jest teraz przyciskiem — także pokazowy.
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.setAttribute('aria-label', `${punkt.nazwa} — przybliż, drugim klikiem otwórz magazyn`);
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          kliknij();
        }
      });

      // Dymek pokazuje się po najechaniu — także na punktach pokazowych, bo to
      // on mówi wprost, że nie stoi za nimi żadna instalacja.
      el.addEventListener('mouseenter', () => {
        if (!dymek.isOpen()) marker.togglePopup();
      });
      el.addEventListener('mouseleave', () => {
        if (dymek.isOpen()) marker.togglePopup();
      });
    }

    return () => {
      stacjeRef.current.clear();
      map.remove();
    };
    // Mapa budowana RAZ. Motyw i sposób kolorowania wchodzą osobnymi efektami.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Oświetlenie mapy idzie za motywem aplikacji — bez przebudowy.
   * Kadr, obrót, otwarty dymek i znaczniki zostają na miejscu.
   */
  useEffect(() => {
    const map = mapaRef.current;
    if (!map) return;
    try {
      map.setConfigProperty(IMPORT_ID, 'lightPreset', theme === 'dark' ? 'night' : 'day');
    } catch {
      // Styl mógł jeszcze się nie wczytać — wtedy wartość z `config` przy
      // tworzeniu mapy jest właściwa, a kolejna zmiana zadziała normalnie.
    }
  }, [theme]);

  /**
   * Przemalowanie mapy po zmianie sposobu kolorowania.
   *
   * `setConfigProperty` działa na już wczytanym stylu, więc nie ma tu nic do
   * przebudowywania — kadr, obrót i znaczniki zostają na miejscu. Przy pierwszym
   * uruchomieniu efekt nie ma nic do roboty, bo motyw wszedł już w `config`
   * przy tworzeniu mapy.
   */
  useEffect(() => {
    const map = mapaRef.current;
    if (!map) return;
    try {
      map.setConfigProperty(IMPORT_ID, 'theme', motywMapy);
    } catch {
      // Styl mógł jeszcze się nie wczytać — wtedy wartość z `config` i tak
      // jest właściwa, a kolejna zmiana zadziała normalnie.
    }
  }, [motywMapy]);

  /*
   * ODŚWIEŻANIE OBU STANOWISK — bez przebudowy mapy.
   *
   * AKTYWNE (rozpoznane po żywych sondach): pulsuje przy działającym łączu,
   * nosi naładowanie w słupku i pełną kartę z procentem.
   * NIEAKTYWNE: klasa `is-uspiona` (przygaszenie w arkuszu), pusty słupek
   * i karta mówiąca wprost, że sondy są przepięte na drugi magazyn — bo
   * nieaktywny punkt z zamrożoną starą liczbą wyglądałby jak działający
   * czujnik, a to najgorszy rodzaj kłamstwa w tym narzędziu.
   *
   * `kierunekStanowiska` w zależnościach: to on wybiera aktywną stację,
   * a zmienia się dokładnie wtedy, gdy ktoś przepnie sondy.
   */
  useEffect(() => {
    for (const punkt of STANOWISKA) {
      const uchwyty = stacjeRef.current.get(punkt.id);
      if (!uchwyty) continue;
      const aktywna = punkt.id === aktywnaStacjaId;

      uchwyty.el.classList.toggle('is-uspiona', !aktywna);
      uchwyty.el.classList.toggle('is-plynie', aktywna && zywe);

      // ODCZYTY IDĄ DO OBU STANOWISK — to jeden Miniserver i jeden zestaw
      // sond, więc te same liczby opisują ten zbiornik, który jest wpięty.
      // Stanowisko bez sond dostaje je z dopiskiem, że sondy siedzą teraz
      // w drugim zbiorniku: liczba nie udaje wtedy własnego pomiaru.
      uchwyty.dymek.setHTML(
        trescDymka(
          punkt,
          sredniaC,
          procent,
          punkt.typ,
          opisZrodla,
          aktywna
            ? null
            : aktywnaStacjaId === null
              ? 'Sondy nierozpoznane — odczyty niżej mogą pochodzić z drugiego zbiornika.'
              : `Sondy są teraz w magazynie ${punkt.typ === 'chlod' ? 'ciepła' : 'chłodu'} — odczyty niżej pochodzą stamtąd, nie z tego zbiornika.`,
          // Mini-przebieg w barwie rodzaju punktu — jeden zestaw danych,
          // patrz komentarz przy stanie `mini`.
          mini ? blokMiniPrzebiegu(mini, PALETA[punkt.typ].glowny) : '',
        ),
      );

      if (uchwyty.wypelnienie) {
        uchwyty.wypelnienie.style.height = `${procent ?? 0}%`;
        // Barwa idzie za temperaturą, wysokość za naładowaniem — dwa kanały,
        // dwie liczby. Bez położenia na skali zostaje jasny odcień rodzaju,
        // ten sam co przy budowie znacznika.
        uchwyty.wypelnienie.style.background =
          pozycjaRef.current === null
            ? PALETA[punkt.typ].jasny
            : barwaNosnika(punkt.typ, pozycjaRef.current);
      }
    }
  }, [sredniaC, procent, kierunekStanowiska, opisZrodla, zywe, aktywnaStacjaId, mini]);

  return (
    <section className="mapa">
      <div className="mapa__plotno" ref={hostRef} aria-label="Mapa stanowisk na Śląsku" />

      {/* Sposób kolorowania — pod przyciskami powiększania i kompasem, które
          Mapbox stawia w prawym górnym rogu. Cyklicznie, bo trzy pozycje nie
          potrzebują listy rozwijanej. */}
      <button
        type="button"
        className="mapa__kolor tool"
        onClick={() => {
          const i = SPOSOBY_KOLOROWANIA.findIndex((x) => x.id === motywMapy);
          setMotywMapy(SPOSOBY_KOLOROWANIA[(i + 1) % SPOSOBY_KOLOROWANIA.length]!.id);
        }}
        title={`Kolory mapy: ${SPOSOBY_KOLOROWANIA.find((x) => x.id === motywMapy)?.opis}. Kliknij, żeby zmienić.`}
        aria-label="Zmień sposób kolorowania mapy"
      >
        <span className="mapa__kolor-znak" aria-hidden="true" />
        <span className="mapa__kolor-podpis">
          {SPOSOBY_KOLOROWANIA.find((x) => x.id === motywMapy)?.etykieta}
        </span>
      </button>
      {blad ? <p className="note is-bad mapa__blad">{blad}</p> : null}
    </section>
  );
}
