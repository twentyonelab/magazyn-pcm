/**
 * Widok Mapa — pierwszy ekran aplikacji.
 *
 * Odpowiada na pytanie „gdzie to stoi", zanim odpowie się na „co pokazuje".
 * Na mapie Śląska jest jedno stanowisko z czujnikami i dwadzieścia punktów
 * pokazowych. Kliknięcie w to jedno prawdziwe wchodzi do widoku Magazyn.
 *
 * Punkty pokazowe są wyszarzone i NIE DAJĄ SIĘ kliknąć — celowo. Gdyby dały
 * się otworzyć i pokazały pusty ekran, wyglądałyby na zepsute czujniki
 * zamiast na to, czym są.
 *
 * Znaczniki są zwykłymi elementami HTML (Marker), a nie warstwą danych mapy.
 * Przy dwudziestu jeden punktach nie ma to znaczenia dla wydajności, a daje
 * kropce „live" to samo pulsowanie, którym reszta aplikacji mówi „dane płyną" —
 * jeden język wizualny zamiast dwóch.
 */

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { KADR, LOKALIZACJE, MAX_GRANICE, STANOWISKO } from '../map/lokalizacje.js';
import type { LiveData } from '../useLiveData.js';
import { useAppliedTheme } from '../theme.js';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

const STYL = {
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
} as const;

interface Props {
  data: LiveData;
  /** Wejście do widoku Magazyn po kliknięciu stanowiska. */
  onOtworzMagazyn: () => void;
}

export function Mapa({ data, onOtworzMagazyn }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
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

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: host,
        style: STYL[theme === 'dark' ? 'dark' : 'light'],
        bounds: KADR,
        fitBoundsOptions: { padding: 48 },
        maxBounds: MAX_GRANICE,
        minZoom: 6.5,
        maxZoom: 15,
        attributionControl: true,
      });
    } catch (error) {
      setBlad(`Nie udało się otworzyć mapy: ${(error as Error).message}`);
      return;
    }

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    // Mapbox zgłasza brak sieci i zły token przez zdarzenie, nie przez wyjątek.
    map.on('error', (event) => {
      const wiadomosc = (event.error as Error | undefined)?.message ?? 'nieznany błąd';
      setBlad(
        /access token|unauthorized|401/i.test(wiadomosc)
          ? 'Mapbox odrzucił token. Sprawdź VITE_MAPBOX_TOKEN i ograniczenia adresów w panelu Mapbox.'
          : `Mapa nie wczytała się w całości: ${wiadomosc}`,
      );
    });

    for (const punkt of LOKALIZACJE) {
      const el = document.createElement(punkt.stan === 'live' ? 'button' : 'div');
      el.className = `mapmark is-${punkt.stan}`;

      const kropka = document.createElement('span');
      kropka.className = 'mapmark__dot';
      el.appendChild(kropka);

      const podpis = document.createElement('span');
      podpis.className = 'mapmark__label';
      podpis.textContent = punkt.miasto;
      el.appendChild(podpis);

      if (punkt.stan === 'live') {
        (el as HTMLButtonElement).type = 'button';
        el.title = `${punkt.opis} — kliknij, żeby otworzyć magazyn`;
        el.setAttribute('aria-label', `${punkt.miasto} — otwórz magazyn`);
        el.addEventListener('click', () => otworzRef.current());
      } else {
        // Punkt pokazowy nie ma uchwytu kliknięcia, więc jest nieaktywny.
        // Podpowiedź po najechaniu ZOSTAJE — to ona mówi wprost, że nie stoi
        // za nim żadna instalacja. Bez niej na mapie zostałoby dwadzieścia
        // milczących kropek bez wyjaśnienia. Kursor jest zwykłą strzałką
        // (patrz `.mapmark.is-demo`), więc nic nie obiecuje.
        el.title = `${punkt.miasto} — ${punkt.opis}`;
      }

      new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([punkt.lon, punkt.lat])
        .addTo(map);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [theme]);

  // Pulsowanie kropki stanowiska idzie za stanem łącza — bez przebudowy mapy.
  useEffect(() => {
    const el = hostRef.current?.querySelector('.mapmark.is-live');
    el?.classList.toggle('is-plynie', zywe);
  }, [zywe, theme]);

  return (
    <section className="mapa">
      <div className="mapa__plotno" ref={hostRef} aria-label="Mapa stanowisk na Śląsku" />

      <div className="mapa__legenda">
        <p className="mapa__legenda-wiersz">
          <span className="mapmark__dot is-live is-plynie" aria-hidden="true" />
          <span>
            <strong>{STANOWISKO.miasto}</strong> — stanowisko badawcze, {STANOWISKO.opis}
          </span>
        </p>
        <p className="mapa__legenda-wiersz">
          <span className="mapmark__dot is-demo" aria-hidden="true" />
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
