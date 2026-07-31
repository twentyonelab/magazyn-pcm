/**
 * Widok Mapa — pierwszy ekran aplikacji.
 *
 * Odpowiada na pytanie „gdzie to stoi", zanim odpowie się na „co pokazuje".
 * Na mapie Śląska jest jedno stanowisko z czujnikami i dwadzieścia punktów
 * pokazowych. Kliknięcie w to jedno prawdziwe wchodzi do widoku Magazyn.
 *
 * MAPA JEST TRÓJWYMIAROWA — styl Mapbox Standard, motyw „faded", oświetlenie
 * dobierane do trybu aplikacji: „day" w jasnym, „night" w ciemnym. Wszystkie
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
  STANOWISKO,
  type Lokalizacja,
} from '../map/lokalizacje.js';
import type { LiveData } from '../useLiveData.js';
import { useAppliedTheme } from '../theme.js';
import { naladowanieProcent, sredniaZSond } from '../naladowanie.js';
import { PALETA } from '../kolory-magazynu.js';

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
const MOTYW_MAPY = 'faded';

/** Źródło rzeźby terenu — identyfikator i adres z dokumentacji Mapboxa. */
const DEM_ID = 'mapbox-dem';
const DEM_URL = 'mapbox://mapbox.mapbox-terrain-dem-v1';

/** Pochylenie kamery. Bez niego „3D" jest tylko nazwą. */
const POCHYLENIE = 52;

/** Pochylenie i przybliżenie po kliknięciu w pinezkę — tak blisko, jak można. */
const ZOOM_BLISKO = 18;
const POCHYLENIE_BLISKO = 62;

function ustawieniaBazy(ciemny: boolean): Record<string, string | boolean> {
  return {
    lightPreset: ciemny ? 'night' : 'day',
    theme: MOTYW_MAPY,
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
): string {
  const zdjecie =
    `<img class="dymek__zdjecie" alt="Zdjęcie lotnicze — ${punkt.miasto}" loading="lazy" ` +
    `src="${zdjecieLotnicze(punkt.lon, punkt.lat, 280, 110, punkt.stan === 'live' ? 17 : 14)}">`;

  const paleta = PALETA[punkt.typ];

  // Nazwa miasta w kolorze rodzaju magazynu — ten sam kod barwny co pinezka
  // i co reszta interfejsu.
  const naglowek =
    `<p class="dymek__nazwa" style="color:${paleta.glowny}">${punkt.miasto}</p>` +
    `<p class="dymek__opis">${punkt.opis}</p>`;

  // Poziom naładowania: dla stanowiska z prawdziwych sond, dla punktów
  // pokazowych z wartości wpisanej na stałe — i wtedy podpisany jako pokazowy.
  const poziom = punkt.stan === 'live' ? procent : Math.round((punkt.demoNaladowanie ?? 0) * 100);

  const ladunek =
    poziom === null
      ? '<p class="dymek__akcja">Brak odczytu sond — naładowania nie da się oszacować</p>'
      : '<div class="ladunek">' +
        '<div class="ladunek__gora">' +
        `<span class="ladunek__etykieta">naładowanie · ${
          punkt.stan === 'live' ? 'szacunek z temperatury' : 'wartość pokazowa'
        }</span>` +
        `<span class="ladunek__liczba mono" style="color:${paleta.glowny}">${poziom}%</span>` +
        '</div>' +
        `<div class="ladunek__tor"><div class="ladunek__wypelnienie" style="width:${poziom}%;background:linear-gradient(90deg,${paleta.jasny},${paleta.glowny})"></div></div>` +
        (punkt.stan === 'live' && sredniaC !== null
          ? `<p class="ladunek__spod">średnia z sond ${sredniaC.toFixed(1).replace('.', ',')} °C</p>`
          : '') +
        '</div>';

  if (punkt.stan !== 'live') return zdjecie + naglowek + ladunek;

  return (
    zdjecie +
    naglowek +
    ladunek +
    '<p class="dymek__akcja">Klik przybliża, drugi klik otwiera magazyn</p>'
  );
}

interface Props {
  data: LiveData;
  /** Wejście do widoku Magazyn po kliknięciu stanowiska. */
  onOtworzMagazyn: () => void;
}

export function Mapa({ data, onOtworzMagazyn }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const theme = useAppliedTheme();
  const [blad, setBlad] = useState<string | null>(null);
  /** Dymek stanowiska — trzymany, żeby odświeżać w nim naładowanie. */
  const dymekLiveRef = useRef<mapboxgl.Popup | null>(null);
  /** Wypełnienie zbiornika stanowiska — podnoszone bez przebudowy mapy. */
  const wypelnienieLiveRef = useRef<HTMLElement | null>(null);
  /**
   * Naładowanie stanowiska widziane przez kod budujący znaczniki.
   * Efekt tworzący mapę nie może zależeć od `procent`, bo przy każdym odczycie
   * sond przebudowywałby całą mapę — dlatego wartość wchodzi referencją.
   */
  const procentRef = useRef<number | null>(null);

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
  const procent = naladowanieProcent(sredniaC, profile);
  procentRef.current = procent;
  // Referencja, żeby uchwyt kliknięcia nie wymuszał przebudowy mapy.
  const otworzRef = useRef(onOtworzMagazyn);
  otworzRef.current = onOtworzMagazyn;

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
    const ciemny = theme === 'dark';

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: host,
        style: STYL,
        // Ustawienia podane od razu przy tworzeniu mapy, a nie po jej wczytaniu —
        // inaczej pierwsza klatka mrugnęłaby domyślnym motywem i oświetleniem.
        config: { [IMPORT_ID]: ustawieniaBazy(ciemny) },
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

    for (const punkt of LOKALIZACJE) {
      const live = punkt.stan === 'live';

      // Znacznik to PIONOWY ZBIORNIK o proporcjach 2:1, wypełniony od dołu
      // do poziomu naładowania. Kropla wskazywała tylko miejsce; zbiornik
      // pokazuje przy tym stan — a to jest właściwa treść tej mapy.
      // Obrys w kolorze rodzaju magazynu: pomarańcz = ciepło, lodowy = chłód.
      const paleta = PALETA[punkt.typ];
      const poziom =
        live ? (procentRef.current ?? 0) : Math.round((punkt.demoNaladowanie ?? 0) * 100);

      const el = document.createElement('div');
      el.className = `pinezka is-${punkt.stan} is-${punkt.typ}`;
      el.innerHTML =
        `<span class="pinezka__zbiornik" aria-hidden="true" style="border-color:${paleta.glowny}">` +
        `<span class="pinezka__wypelnienie" style="height:${poziom}%;background:linear-gradient(180deg,${paleta.jasny},${paleta.glowny})"></span>` +
        '</span>' +
        `<span class="pinezka__podpis" style="color:${paleta.glowny}">${punkt.miasto}</span>`;

      // Dymek. `offset` odsuwa go nad wierzchołek pinezki, żeby jej nie
      // zasłaniał; `closeButton` zbędny, bo dymek zamyka klik w mapę.
      const dymek = new mapboxgl.Popup({
        offset: 30,
        closeButton: false,
        className: `dymek is-${punkt.stan}`,
        maxWidth: '280px',
      }).setHTML(trescDymka(punkt, null, null));

      if (live) {
        dymekLiveRef.current = dymek;
        wypelnienieLiveRef.current = el.querySelector('.pinezka__wypelnienie');
      }

      const marker = new mapboxgl.Marker({
        element: el,
        // Wierzchołek kropli wskazuje współrzędną, więc zaczepiamy ją u dołu.
        anchor: 'bottom',
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

        // Drugi klik. Magazyn ma tylko stanowisko badawcze; punkt pokazowy
        // zostaje przybliżony i na tym koniec.
        if (live) otworzRef.current();
      };

      el.addEventListener('click', kliknij);

      if (live) {
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.setAttribute('aria-label', `${punkt.miasto} — przybliż, drugim klikiem otwórz magazyn`);
        el.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            kliknij();
          }
        });
      }

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
      dymekLiveRef.current = null;
      map.remove();
    };
  }, [theme]);

  // Pulsowanie kropki stanowiska idzie za stanem łącza — bez przebudowy mapy.
  useEffect(() => {
    const el = hostRef.current?.querySelector('.pinezka.is-live');
    el?.classList.toggle('is-plynie', zywe);
  }, [zywe, theme]);

  // Naładowanie stanowiska odświeża się z danymi: treść dymka i wysokość
  // wypełnienia zbiornika. Podmieniamy tylko te dwie rzeczy, żeby nie
  // przebudowywać całej mapy przy każdym odczycie sond.
  useEffect(() => {
    dymekLiveRef.current?.setHTML(trescDymka(STANOWISKO, sredniaC, procent));
    if (wypelnienieLiveRef.current) {
      wypelnienieLiveRef.current.style.height = `${procent ?? 0}%`;
    }
  }, [sredniaC, procent]);

  return (
    <section className="mapa">
      <div className="mapa__plotno" ref={hostRef} aria-label="Mapa stanowisk na Śląsku" />
      {blad ? <p className="note is-bad mapa__blad">{blad}</p> : null}
    </section>
  );
}
