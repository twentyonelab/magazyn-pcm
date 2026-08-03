/**
 * Powłoka aplikacji: nagłówek z nawigacją, widok, dolny pasek stanu.
 *
 * Układ celowo trzyma stałe elementy przy krawędziach ekranu: nawigacja
 * i logo u góry, kluczowe parametry na dole. Środek należy do danych.
 */

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useLiveData } from './useLiveData.js';
import { Diagnostyka } from './views/Diagnostyka.js';
import { Magazyn } from './views/Magazyn.js';
import { Przebiegi } from './views/Przebiegi.js';
import { Sesje } from './views/Sesje.js';
import { Bilans } from './views/Bilans.js';
import { Ustawienia } from './views/Ustawienia.js';
import { useSettings } from './settings.js';
import { useAppliedTheme } from './theme.js';
import { useWysokosciBelek } from './uklad.js';
import { WERSJA } from './wersja.js';
import { TRYB_POKAZOWY } from './demo/stale.js';
import { ustawAktywnyPunkt } from './demo/aktywnyPunkt.js';
import { useDanePunktu } from './demo/useDanePunktu.js';
import { STANOWISKO, type Lokalizacja } from './map/lokalizacje.js';
import { BladWidoku } from './components/BladWidoku.js';
import { PlakietkaPokazowa } from './components/PlakietkaPokazowa.js';
import { Logowanie } from './components/Logowanie.js';
import { PasekStanu } from './components/PasekStanu.js';
import { PrzelacznikMotywu } from './components/PrzelacznikMotywu.js';

/**
 * Widok 3D wczytywany na żądanie.
 *
 * Three.js waży ponad pół megabajta — gdyby wchodził do wspólnej paczki,
 * płaciłby za niego każdy, kto otwiera tylko widok 2D albo Diagnostykę.
 */
const importMagazyn3D = () => import('./views/Magazyn3D.js');

const Magazyn3D = lazy(() =>
  importMagazyn3D().then((module) => ({ default: module.Magazyn3D })),
);

/**
 * Mapa też wchodzi osobną paczką — Mapbox GL waży podobnie do three.js.
 * Jest widokiem startowym, więc jej paczka pobiera się od razu; wydzielenie
 * służy temu, żeby nie siedziała w tym samym pliku co reszta aplikacji
 * i nie opóźniała pierwszego rysunku interfejsu.
 */
const Mapa = lazy(() => import('./views/Mapa.js').then((module) => ({ default: module.Mapa })));

/**
 * Ściągnięcie paczki 3D w tle, gdy przeglądarka nie ma nic pilnego do roboty.
 *
 * Leniwe wczytywanie oszczędza czas pierwszego otwarcia aplikacji, ale bez tego
 * cały koszt trzy.js spadał na kliknięcie w „Magazyn 3D" — i to właśnie wtedy
 * użytkownik czekał. Pobranie z wyprzedzeniem zostawia oszczędność na starcie,
 * a samo przejście do widoku robi natychmiastowym.
 *
 * `requestIdleCallback` czeka na bezczynność, więc nie odbiera pasma pierwszemu
 * strumieniowi danych. Gdzie go nie ma (Safari), wystarcza zwykłe opóźnienie.
 */
function usePobierzWczesniej3D(wlaczony: boolean): void {
  useEffect(() => {
    if (!wlaczony) return;

    const pobierz = (): void => {
      void importMagazyn3D();
    };

    const idle = window.requestIdleCallback;
    if (typeof idle === 'function') {
      const id = idle(pobierz, { timeout: 4000 });
      return () => window.cancelIdleCallback?.(id);
    }

    const timer = window.setTimeout(pobierz, 1500);
    return () => window.clearTimeout(timer);
  }, [wlaczony]);
}

type ViewId =
  | 'mapa'
  | 'magazyn'
  | 'magazyn3d'
  | 'przebiegi'
  | 'bilans'
  | 'diagnostyka'
  | 'sesje'
  | 'ustawienia';

/**
 * Widoki, w których obraz jest treścią i ma zająć cały ekran.
 * Pozostałe zostają w czytelnej kolumnie — tam treścią są liczby i tabele,
 * a wiersz ciągnący się przez cały monitor czyta się gorzej.
 */
const OBRAZOWE = new Set<ViewId>(['mapa', 'magazyn', 'magazyn3d']);

/**
 * Adres pliku z katalogu `web/public`.
 *
 * Zapis „/logo.webp" wystarczał, dopóki aplikacja stała zawsze w korzeniu
 * adresu. Na GitHub Pages leży w podkatalogu (`/magazyn-pcm/`), a ukośnik
 * na początku znaczy „od korzenia domeny" — logotypy szukałyby się wtedy
 * piętro za wysoko i nie wczytały. `BASE_URL` podstawia Vite przy budowaniu
 * i zawsze kończy się ukośnikiem.
 */
function plik(nazwa: string): string {
  return `${import.meta.env.BASE_URL}${nazwa}`;
}

const VIEWS: Array<{ id: ViewId; label: string; icon?: 'trybik' }> = [
  { id: 'mapa', label: 'Mapa' },
  { id: 'magazyn', label: 'Magazyn' },
  { id: 'magazyn3d', label: 'Magazyn 3D' },
  { id: 'przebiegi', label: 'Przebiegi' },
  { id: 'bilans', label: 'Bilans' },
  { id: 'sesje', label: 'Sesje' },
  { id: 'diagnostyka', label: 'Diagnostyka' },
  { id: 'ustawienia', label: 'Ustawienia', icon: 'trybik' },
];

export function App() {
  const [view, setView] = useState<ViewId>('mapa');
  /** Sondy przekazane z widoku Magazyn do Przebiegów (klik w sondę). */
  const [przebiegiIds, setPrzebiegiIds] = useState<string[]>([]);
  /**
   * Oglądany punkt z mapy. `null` = stanowisko badawcze i prawdziwe pomiary.
   *
   * Wejście w punkt pokazowy podmienia całe źródło danych i barwę interfejsu,
   * ale NIE rusza strumienia z serwera — powrót ma być natychmiastowy.
   */
  const [punkt, setPunkt] = useState<Lokalizacja | null>(null);

  const zywe = useLiveData();
  const data = useDanePunktu(zywe, punkt);
  const settings = useSettings();
  const theme = useAppliedTheme();

  /**
   * Barwa całego interfejsu idzie za NOŚNIKIEM oglądanego magazynu:
   * parafina 57HC — pomarańcz, materiał 8HC — lodowy błękit.
   *
   * Źródłem jest materiał sesji (stanowisko) albo rodzaj punktu (mapa), nigdy
   * sam widok — inaczej ten sam magazyn miałby inny kolor w Magazynie
   * i w Przebiegach.
   */
  const kierunek = punkt
    ? punkt.typ
    : (data.session?.material ?? data.materials?.defaultMaterial) === 'RT8HC'
      ? 'chlod'
      : 'cieplo';

  useEffect(() => {
    document.documentElement.dataset.kierunek = kierunek;
  }, [kierunek]);

  // Warstwa API czyta wybrany punkt poza Reactem — patrz demo/aktywnyPunkt.ts.
  useEffect(() => {
    ustawAktywnyPunkt(punkt);
  }, [punkt]);

  // Paczka 3D ląduje w pamięci przeglądarki jeszcze przed kliknięciem.
  usePobierzWczesniej3D(settings.widok3d);

  // Widok przewija się pod belkami, więc musi znać ich wysokość.
  const ramaRef = useRef<HTMLDivElement>(null);
  const gornaRef = useRef<HTMLElement>(null);
  const dolnaRef = useRef<HTMLElement>(null);
  useWysokosciBelek(ramaRef, gornaRef, dolnaRef);

  const openInPrzebiegi = (pointId: string): void => {
    setPrzebiegiIds([pointId]);
    setView('przebiegi');
  };

  // Brama logowania. Gdy serwer jej nie wymaga (praca w sieci laboratorium),
  // ten ekran nie pojawia się ani na moment.
  if (data.link === 'unauthorized') {
    return <Logowanie onSuccess={data.reload} />;
  }

  // Widok 3D da się wyłączyć w opcjach — także wtedy, gdy jest otwarty.
  const views = VIEWS.filter((item) => item.id !== 'magazyn3d' || settings.widok3d);
  const activeView = views.some((item) => item.id === view) ? view : 'magazyn';

  return (
    <div className="app" ref={ramaRef}>
      <header className="topbar" ref={gornaRef}>
        <div className="brand">
          <span className="brand__nazwa">
            <span className="brand__mark">Vaultherm</span>
            {/* Znaczek towarowy w prawym GÓRNYM indeksie nazwy — tak się go
                stawia typograficznie. Bez `aria-hidden`, bo to informacja
                prawna, nie ozdoba, i czytnik ekranu ma ją przeczytać. */}
            <span className="brand__tm">™</span>
          </span>
          {/* Wersja pod nazwą — mała, bo to metryczka, nie tytuł. Numer siedzi
              w `wersja.ts`, żeby był jeden dla całej aplikacji. */}
          <span className="brand__wersja mono">
            {WERSJA}
            {TRYB_POKAZOWY ? <PlakietkaPokazowa /> : null}
          </span>
        </div>

        {/* Pastylka menu jest wyśrodkowana wobec całego ekranu, a nie wobec
            tego, co zostało po logo — dlatego siedzi w osobnym, absolutnie
            pozycjonowanym opakowaniu. Przełącznik motywu wisi tuż za jej
            prawą krawędzią, już poza pastylką, i nie przesuwa jej środka. */}
        <div className="topbar__center">
        <nav className="nav" aria-label="Widoki">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav__item${activeView === item.id ? ' is-active' : ''}${
                item.icon ? ' nav__item--icon' : ''
              }`}
              onClick={() => {
                // Wejście w Przebiegi z nawigacji czyści zaznaczenie z kliknięcia
                // sondy — inaczej badacz widziałby jedną serię i nie wiedział czemu.
                if (item.id === 'przebiegi') setPrzebiegiIds([]);
                setView(item.id);
              }}
              aria-label={item.icon ? item.label : undefined}
              title={item.icon ? item.label : undefined}
            >
              {item.icon === 'trybik' ? (
                <span className="nav__emoji" aria-hidden="true">
                  ⚙️
                </span>
              ) : (
                item.label
              )}
            </button>
          ))}
        </nav>

          <PrzelacznikMotywu />
        </div>

        <div className="topbar__right">
          {/* Logo klienta w prawym górnym rogu (v0.6). Żyje na białej
              pastylce, bo jego kolory potrzebują białego tła w obu motywach. */}
          <img className="topbar__logo--tauron" src={plik('tauron-cieplo.png')} alt="Tauron Ciepło" />
        </div>
      </header>

      {/*
        Widoki obrazowe (mapa, schemat, scena 3D) dostają ramę BEZ ograniczenia
        szerokości i bez marginesów — obraz jest w nich treścią i ma iść do
        samych krawędzi ekranu.

        Wcześniej próbowałem wypychać same widoki poza `.main` sztuczką
        „width: 100vw + margin-left: 50% + translateX(-50vw)". To działa tylko
        wtedy, gdy rodzic ma pełną szerokość okna — a `.main` jest ograniczony
        do 1400 px, więc oba ruchy się znosiły i widok zostawał w kolumnie.
        Zdjęcie ograniczenia z samej ramy jest jednoznaczne i nie ma czego
        znosić.
      */}
      <main className={`main${OBRAZOWE.has(activeView) ? ' main--obraz' : ''}`}>
        <BladWidoku resetKey={activeView}>
          {activeView === 'mapa' ? (
            <Suspense fallback={<div className="note">Wczytuję mapę…</div>}>
              <Mapa
                data={data}
                onOtworzMagazyn={(wybrany) => {
                  setPunkt(wybrany.stan === 'live' ? null : wybrany);
                  setView('magazyn');
                }}
              />
            </Suspense>
          ) : null}
          {activeView === 'magazyn' ? (
            <Magazyn data={data} onOpenInPrzebiegi={openInPrzebiegi} />
          ) : null}
          {activeView === 'magazyn3d' ? (
            <Suspense fallback={<div className="note">Wczytuję scenę trójwymiarową…</div>}>
              <Magazyn3D data={data} />
            </Suspense>
          ) : null}
          {activeView === 'przebiegi' ? (
            // Klucz zeruje stan formularza, gdy przyjdziemy z inną sondą.
            <Przebiegi key={przebiegiIds.join(',')} data={data} initialIds={przebiegiIds} />
          ) : null}
          {activeView === 'bilans' ? <Bilans data={data} /> : null}
          {activeView === 'sesje' ? <Sesje data={data} /> : null}
          {activeView === 'diagnostyka' ? <Diagnostyka data={data} /> : null}
          {activeView === 'ustawienia' ? <Ustawienia data={data} /> : null}
        </BladWidoku>
      </main>

      {/* Pasek oglądanego punktu pokazowego. Wisi nisko przy lewej krawędzi,
          poza drogą schematu, i jest JEDYNYM wyjściem z powrotem na stanowisko
          — nawigacja u góry przełącza widoki, nie źródło danych. */}
      {punkt ? (
        <div className="punkt-pasek">
          <span className={`punkt-pasek__kropka is-${punkt.typ}`} aria-hidden="true" />
          <span className="punkt-pasek__nazwa">{punkt.nazwa}</span>
          <span className="punkt-pasek__opis">
            punkt pokazowy · {punkt.typ === 'chlod' ? 'magazyn chłodu' : 'magazyn ciepła'} · dane
            wyliczone
          </span>
          <button type="button" className="punkt-pasek__wroc" onClick={() => setPunkt(null)}>
            wróć na stanowisko
          </button>
        </div>
      ) : null}

      {/* 21 zmysłów — prawy dolny róg, nad stopką (v0.6). */}
      <img
        className="logo-21"
        src={plik(
          theme === 'dark' ? 'logo-21zmyslow-ciemnytryb.webp' : 'logo-21zmyslow-jasnytryb.webp',
        )}
        alt="21 zmysłów"
      />

      <PasekStanu data={data} ref={dolnaRef} />
    </div>
  );
}
