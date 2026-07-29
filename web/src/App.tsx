/**
 * Powloka aplikacji: naglowek, nawigacja, wskaznik zywosci danych.
 *
 * W tym kroku dziala jeden widok — Diagnostyka. Pozostale wejda w krokach
 * 6 i 7 (Magazyn PCM ze schematem SVG, potem zaslepki). Nawigacja pokazuje
 * je od razu jako nieaktywne, zeby bylo widac, gdzie idziemy.
 */

import { useState } from 'react';
import { useLiveData } from './useLiveData.js';
import { Diagnostyka } from './views/Diagnostyka.js';
import { Magazyn } from './views/Magazyn.js';
import { formatClock } from './format.js';

type ViewId = 'magazyn' | 'przebiegi' | 'bilans' | 'diagnostyka' | 'sesje' | 'ustawienia';

const VIEWS: Array<{ id: ViewId; label: string; ready: boolean }> = [
  { id: 'magazyn', label: 'Magazyn', ready: true },
  { id: 'przebiegi', label: 'Przebiegi', ready: false },
  { id: 'bilans', label: 'Bilans', ready: false },
  { id: 'diagnostyka', label: 'Diagnostyka', ready: true },
  { id: 'sesje', label: 'Sesje', ready: false },
  { id: 'ustawienia', label: 'Ustawienia', ready: false },
];

export function App() {
  const [view, setView] = useState<ViewId>('magazyn');
  const data = useLiveData();

  const material = data.session?.material ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">Magazyn PCM</span>
          <span className="brand__dot">.</span>
        </div>

        <nav className="nav" aria-label="Widoki">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav__item${view === item.id ? ' is-active' : ''}${
                item.ready ? '' : ' is-soon'
              }`}
              onClick={() => item.ready && setView(item.id)}
              aria-disabled={!item.ready}
              title={item.ready ? undefined : 'Widok powstanie w kolejnym kroku'}
            >
              {item.label}
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
          <h1>{VIEWS.find((v) => v.id === view)?.label}</h1>
          <p className="page-sub">
            {data.session
              ? `Sesja: ${data.session.label} · materiał ${material}`
              : 'Żadna sesja badawcza nie jest uruchomiona'}
          </p>
        </div>

        {view === 'magazyn' ? <Magazyn data={data} /> : null}
        {view === 'diagnostyka' ? <Diagnostyka data={data} /> : null}
      </main>
    </div>
  );
}
