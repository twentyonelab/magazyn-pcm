/**
 * Powłoka aplikacji: nagłówek z nawigacją, widok, dolny pasek stanu.
 *
 * Układ celowo trzyma stałe elementy przy krawędziach ekranu: nawigacja
 * i logo u góry, kluczowe parametry na dole. Środek należy do danych.
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { useLiveData } from './useLiveData.js';
import { Diagnostyka } from './views/Diagnostyka.js';
import { Magazyn } from './views/Magazyn.js';
import { Przebiegi } from './views/Przebiegi.js';
import { Sesje } from './views/Sesje.js';
import { Bilans } from './views/Bilans.js';
import { Ustawienia } from './views/Ustawienia.js';
import { useSettings } from './settings.js';
import { useAppliedTheme } from './theme.js';
import { BladWidoku } from './components/BladWidoku.js';
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
  const data = useLiveData();
  const settings = useSettings();
  const theme = useAppliedTheme();

  // Paczka 3D ląduje w pamięci przeglądarki jeszcze przed kliknięciem.
  usePobierzWczesniej3D(settings.widok3d);

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
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">Magazyn PCM</span>
          <span className="brand__dot">.</span>
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
          {/* Logo w dwóch wersjach — ciemne na jasnym tle i odwrotnie. */}
          <img
            className="topbar__logo"
            src={
              theme === 'dark'
                ? '/logo-21zmyslow-ciemnytryb.webp'
                : '/logo-21zmyslow-jasnytryb.webp'
            }
            alt="21 zmysłów"
          />
        </div>
      </header>

      <main className="main">
        <BladWidoku resetKey={activeView}>
          {activeView === 'mapa' ? (
            <Suspense fallback={<div className="note">Wczytuję mapę…</div>}>
              <Mapa data={data} onOtworzMagazyn={() => setView('magazyn')} />
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

      <PasekStanu data={data} />
    </div>
  );
}
