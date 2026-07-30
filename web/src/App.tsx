/**
 * Powloka aplikacji: naglowek, nawigacja, wskaznik zywosci danych.
 *
 * Wszystkie widoki dzialaja. Nawigacje mozna przycinac w Ustawieniach —
 * np. wylaczenie widoku 3D sprawia, ze modul Three.js w ogole sie nie pobiera.
 */

import { Suspense, lazy, useState } from 'react';
import { useLiveData } from './useLiveData.js';
import { Diagnostyka } from './views/Diagnostyka.js';
import { Magazyn } from './views/Magazyn.js';
import { Przebiegi } from './views/Przebiegi.js';
import { Sesje } from './views/Sesje.js';
import { Bilans } from './views/Bilans.js';
import { Ustawienia } from './views/Ustawienia.js';
import { formatClock, materialLabel } from './format.js';
import { useSettings } from './settings.js';
import { BladWidoku } from './components/BladWidoku.js';
import { Logowanie } from './components/Logowanie.js';

/**
 * Widok 3D wczytywany na żądanie.
 *
 * Three.js waży ponad pół megabajta — gdyby wchodził do wspólnej paczki,
 * płaciłby za niego każdy, kto otwiera tylko widok 2D albo Diagnostykę.
 * Przy podglądzie na tablecie w laboratorium to realna różnica.
 */
const Magazyn3D = lazy(() =>
  import('./views/Magazyn3D.js').then((module) => ({ default: module.Magazyn3D })),
);

type ViewId =
  | 'magazyn'
  | 'magazyn3d'
  | 'przebiegi'
  | 'bilans'
  | 'diagnostyka'
  | 'sesje'
  | 'ustawienia';

const VIEWS: Array<{ id: ViewId; label: string; icon?: 'trybik' }> = [
  { id: 'magazyn', label: 'Magazyn' },
  { id: 'magazyn3d', label: 'Magazyn 3D' },
  { id: 'przebiegi', label: 'Przebiegi' },
  { id: 'bilans', label: 'Bilans' },
  { id: 'sesje', label: 'Sesje' },
  { id: 'diagnostyka', label: 'Diagnostyka' },
  // Ustawienia jako trybik: nazwa widoku i tak jest w naglowku strony,
  // a ikona odciaza pasek nawigacji z siodmego napisu.
  { id: 'ustawienia', label: 'Ustawienia', icon: 'trybik' },
];

/** Trybik ustawien. Dziedziczy kolor tekstu przycisku (currentColor). */
function IkonaTrybika() {
  return (
    <svg
      className="nav__icon"
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6l1.6-1.6M18 6l1.6-1.6" />
    </svg>
  );
}

export function App() {
  const [view, setView] = useState<ViewId>('magazyn');
  const data = useLiveData();
  const settings = useSettings();

  // Brama logowania. Gdy serwer jej nie wymaga (praca w sieci laboratorium),
  // ten ekran nie pojawia sie ani na moment.
  if (data.link === 'unauthorized') {
    return <Logowanie onSuccess={data.reload} />;
  }

  // Widok 3D da sie wylaczyc w opcjach — takze wtedy, gdy jest otwarty.
  const views = VIEWS.filter((item) => item.id !== 'magazyn3d' || settings.widok3d);
  const activeView = views.some((item) => item.id === view) ? view : 'magazyn';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">Magazyn PCM</span>
          <span className="brand__dot">.</span>
        </div>

        <nav className="nav" aria-label="Widoki">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav__item${activeView === item.id ? ' is-active' : ''}${
                item.icon ? ' nav__item--icon' : ''
              }`}
              onClick={() => setView(item.id)}
              // Ikona bez tekstu musi miec nazwe dla czytnika ekranu
              // i podpowiedz dla kursora — inaczej jest tylko obrazkiem.
              aria-label={item.icon ? item.label : undefined}
              title={item.icon ? item.label : undefined}
            >
              {item.icon === 'trybik' ? <IkonaTrybika /> : item.label}
            </button>
          ))}
        </nav>

        <div className={`pulse is-${data.link}`}>
          <span className="pulse__dot" aria-hidden="true" />
          <span className="pulse__text">
            {data.lastMessageAt ? formatClock(data.lastMessageAt.toISOString()) : '—'}
          </span>
        </div>
      </header>

      <main className="main">
        <div className="page-head">
          <p className="eyebrow">
            21 zmysłów · stanowisko badawcze
            {data.health?.sourceKind === 'mock' ? ' · DANE SYNTETYCZNE' : ''}
          </p>
          <h1>{views.find((v) => v.id === activeView)?.label}</h1>
          <p className="page-sub">
            {data.session
              ? `Sesja: ${data.session.label} · parafina ${materialLabel(
                  data.session.material,
                  data.materials,
                )}`
              : 'Żadna sesja badawcza nie jest uruchomiona'}
          </p>
        </div>

        <BladWidoku resetKey={activeView}>
          {activeView === 'magazyn' ? <Magazyn data={data} /> : null}
          {activeView === 'magazyn3d' ? (
            <Suspense fallback={<div className="note">Wczytuję scenę trójwymiarową…</div>}>
              <Magazyn3D data={data} />
            </Suspense>
          ) : null}
          {activeView === 'przebiegi' ? <Przebiegi data={data} /> : null}
          {activeView === 'bilans' ? <Bilans data={data} /> : null}
          {activeView === 'sesje' ? <Sesje data={data} /> : null}
          {activeView === 'diagnostyka' ? <Diagnostyka data={data} /> : null}
          {activeView === 'ustawienia' ? <Ustawienia data={data} /> : null}
        </BladWidoku>
      </main>
    </div>
  );
}
