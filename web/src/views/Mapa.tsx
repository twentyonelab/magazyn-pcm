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
import { KADR, LOKALIZACJE, MAX_GRANICE, STANOWISKO } from '../map/lokalizacje.js';
import type { LiveData } from '../useLiveData.js';
import { useAppliedTheme } from '../theme.js';

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

function ustawieniaBazy(ciemny: boolean): Record<string, string | boolean> {
  return {
    lightPreset: ciemny ? 'night' : 'day',
    theme: MOTYW_MAPY,
    show3dObjects: true,
    showPlaceLabels: true,
    // Znaczniki sklepów i restauracji zabierałyby uwagę naszym dwudziestu
    // jednemu punktom — a to one są tu treścią.
    showPointOfInterestLabels: false,
  };
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

  // Dane płyną? To decyduje, czy kropka stanowiska pulsuje.
  const zywe = data.link === 'live';
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
        maxZoom: 17,
        pitch: POCHYLENIE,
      });
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

    for (const punkt of LOKALIZACJE) {
      const live = punkt.stan === 'live';

      // Pinezka jako własny element — kropla z kropką w środku. Mapbox pozwala
      // podać dowolny element przez opcję `element`; domyślna niebieska kropla
      // nie umiałaby pulsować ani wyszarzeć się dla punktów pokazowych.
      const el = document.createElement('div');
      el.className = `pinezka is-${punkt.stan}`;
      el.innerHTML =
        '<span class="pinezka__ksztalt" aria-hidden="true">' +
        '<span class="pinezka__oczko"></span>' +
        '</span>' +
        `<span class="pinezka__podpis">${punkt.miasto}</span>`;

      // Dymek z opisem. `offset` odsuwa go nad wierzchołek pinezki, żeby jej
      // nie zasłaniał; `closeButton` zbędny, bo dymek zamyka klik w mapę.
      const dymek = new mapboxgl.Popup({
        offset: 26,
        closeButton: false,
        className: `dymek is-${punkt.stan}`,
        maxWidth: '260px',
      }).setHTML(
        live
          ? `<p class="dymek__nazwa">${punkt.miasto}</p>` +
              `<p class="dymek__opis">${punkt.opis}</p>` +
              '<p class="dymek__akcja">Kliknij pinezkę, żeby otworzyć magazyn</p>'
          : `<p class="dymek__nazwa">${punkt.miasto}</p>` +
              `<p class="dymek__opis">${punkt.opis}</p>`,
      );

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

      if (live) {
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.setAttribute('aria-label', `${punkt.miasto} — otwórz magazyn`);
        el.addEventListener('click', () => otworzRef.current());
        el.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            otworzRef.current();
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
      map.remove();
    };
  }, [theme]);

  // Pulsowanie kropki stanowiska idzie za stanem łącza — bez przebudowy mapy.
  useEffect(() => {
    const el = hostRef.current?.querySelector('.pinezka.is-live');
    el?.classList.toggle('is-plynie', zywe);
  }, [zywe, theme]);

  return (
    <section className="mapa">
      <div className="mapa__plotno" ref={hostRef} aria-label="Mapa stanowisk na Śląsku" />

      <div className="mapa__legenda">
        <p className="mapa__legenda-wiersz">
          <span className="legenda__kropka is-live is-plynie" aria-hidden="true" />
          <span>
            <strong>{STANOWISKO.miasto}</strong> — stanowisko badawcze, {STANOWISKO.opis}
          </span>
        </p>
        <p className="mapa__legenda-wiersz">
          <span className="legenda__kropka is-demo" aria-hidden="true" />
          <span>
            Pozostałe <strong>20 punktów to demonstracja</strong> — pokazują, jak taka sieć
            mogłaby się rozłożyć w regionie. Nie stoją za nimi instalacje ani pomiary.
          </span>
        </p>
      </div>

      {blad ? <p className="note is-bad mapa__blad">{blad}</p> : null}
    </section>
  );
}
