/**
 * Szkielet frontendu.
 *
 * Krok 1 konczy sie na liczbach w konsoli — widoki powstaja w krokach 5-7
 * wedlug kolejnosci z sekcji 10 specyfikacji:
 *   Diagnostyka -> warstwa wiazaca SVG i widok Magazyn PCM -> zaslepki.
 *
 * Ta strona istnieje tylko po to, zeby monorepo bylo kompletne i zeby bylo
 * widac, ze frontend czyta typy ze wspolnego pakietu.
 */

import type { PublicPoint } from '@magazyn-pcm/shared';

/** Kolejnosc budowy z sekcji 10 specyfikacji. */
const ROADMAP: Array<{ step: number; label: string; done: boolean }> = [
  { step: 1, label: 'Middleware — 6 temperatur w konsoli', done: true },
  { step: 2, label: '/api/points i /api/snapshot', done: true },
  { step: 3, label: '/api/stream (SSE)', done: false },
  { step: 4, label: 'Zapis do SQLite', done: false },
  { step: 5, label: 'Widok Diagnostyka', done: false },
  { step: 6, label: 'Warstwa wiazaca SVG i widok Magazyn PCM', done: false },
  { step: 7, label: 'Zaslepki pozostalych widokow', done: false },
  { step: 8, label: '/api/history', done: false },
];

export function App(): JSX.Element {
  // Typ ze wspolnego pakietu — dowod, ze `shared/` dziala po stronie frontendu.
  const example: PublicPoint | null = null;
  void example;

  return (
    <main className="page">
      <header className="page__head">
        <p className="eyebrow">21 zmysłów · stanowisko badawcze</p>
        <h1>
          Magazyn PCM
          <span className="dot">.</span>
        </h1>
      </header>

      <section className="card">
        <h2 className="card__title">interfejs powstaje w kolejnych krokach</h2>
        <p className="card__lead">
          Middleware już działa. Sześć temperatur z magazynu jest odczytywanych i wypisywanych
          w konsoli serwera, a dane są dostępne pod <code>/api/snapshot</code>.
        </p>

        <ol className="roadmap">
          {ROADMAP.map((item) => (
            <li key={item.step} className={item.done ? 'roadmap__item is-done' : 'roadmap__item'}>
              <span className="roadmap__step">{String(item.step).padStart(2, '0')}</span>
              <span className="roadmap__label">{item.label}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
