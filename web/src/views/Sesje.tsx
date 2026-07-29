/**
 * Widok Sesje badawcze.
 *
 * To tutaj zyje informacja "RT8HC vs RT57HC" — material jest atrybutem
 * sesji, nigdy punktu pomiarowego. Znaczniki zdarzen ("napelniono",
 * "start ladowania", "zauwazono kawerne") to realna wartosc dla R&D:
 * bez adnotacji dane po dwoch tygodniach sa nieczytelne.
 */

import { useCallback, useEffect, useState } from 'react';
import type { PcmMaterial, SessionRecord } from '@magazyn-pcm/shared';
import { addSessionEvent, endSession, fetchCurrentSession, fetchSessions, startSession } from '../api.js';
import type { LiveData } from '../useLiveData.js';
import { formatClock } from '../format.js';

/** Podpowiedzi znacznikow — jedno dotkniecie zamiast pisania w rekawicach. */
const QUICK_EVENTS = ['napełniono', 'start ładowania', 'start rozładowania', 'zauważono kawernę'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', { hour12: false });
}

function formatDuration(fromIso: string, toIso: string | null): string {
  const ms = (toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso);
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)} d ${h % 24} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function Sesje({ data }: { data: LiveData }) {
  const [current, setCurrent] = useState<SessionRecord | null>(null);
  const [past, setPast] = useState<SessionRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formularz nowej sesji.
  const [material, setMaterial] = useState<PcmMaterial>('RT8HC');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [customEvent, setCustomEvent] = useState('');

  // Zegar dla czasu trwania biezacej sesji.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const [currentSession, sessions] = await Promise.all([fetchCurrentSession(), fetchSessions()]);
      setCurrent(currentSession);
      setPast(sessions.filter((s) => s.endedAt !== null));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      data.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const profile = data.materials?.profiles[material];

  return (
    <div className="stack">
      {error ? <div className="note is-bad">{error}</div> : null}

      {current ? (
        /* ------------------------- Trwajaca sesja ------------------------- */
        <section className="card session-card is-active">
          <div className="card__head">
            <h2 className="card__title">sesja w toku</h2>
            <p className="card__meta mono">
              start {formatDate(current.startedAt)} · trwa {formatDuration(current.startedAt, null)}
            </p>
          </div>

          <div className="session-summary">
            <p className="session-summary__label">{current.label}</p>
            <p className="session-summary__meta">
              materiał <strong>{current.material}</strong>
              {current.note ? <> · {current.note}</> : null}
            </p>
          </div>

          <div className="event-bar">
            {QUICK_EVENTS.map((quick) => (
              <button
                key={quick}
                type="button"
                className="chip"
                disabled={busy}
                onClick={() => void run(() => addSessionEvent({ label: quick }))}
              >
                + {quick}
              </button>
            ))}

            <form
              className="event-bar__custom"
              onSubmit={(event) => {
                event.preventDefault();
                const text = customEvent.trim();
                if (!text) return;
                setCustomEvent('');
                void run(() => addSessionEvent({ label: text }));
              }}
            >
              <input
                type="text"
                value={customEvent}
                placeholder="własny znacznik…"
                maxLength={200}
                onChange={(event) => setCustomEvent(event.target.value)}
              />
              <button type="submit" className="chip" disabled={busy || customEvent.trim() === ''}>
                dodaj
              </button>
            </form>
          </div>

          <Timeline record={current} />

          <div className="session-actions">
            <button
              type="button"
              className="button-danger"
              disabled={busy}
              onClick={() => {
                // Zakonczenie sesji zamyka rozdzial danych — przypadkowe
                // klikniecie nie moze tego zrobic bez potwierdzenia.
                if (window.confirm('Zakończyć sesję? Znaczniki i metadane zostaną zamknięte.')) {
                  void run(() => endSession());
                }
              }}
            >
              Zakończ sesję
            </button>
          </div>
        </section>
      ) : (
        /* ------------------------- Nowa sesja ------------------------- */
        <section className="card">
          <div className="card__head">
            <h2 className="card__title">rozpocznij sesję badawczą</h2>
            <p className="card__meta">żadna sesja nie jest uruchomiona</p>
          </div>

          <form
            className="session-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() =>
                startSession({ material, label: label.trim(), note: note.trim() || null }),
              );
            }}
          >
            <label className="field">
              <span>materiał w zbiorniku</span>
              <select value={material} onChange={(e) => setMaterial(e.target.value as PcmMaterial)}>
                {data.materials
                  ? Object.values(data.materials.profiles).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))
                  : ['RT8HC', 'RT57HC'].map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
              </select>
            </label>

            {profile ? (
              <p className="session-form__hint">
                przemiana {profile.phaseBandMin}–{profile.phaseBandMax} °C · skala barwna{' '}
                {profile.scaleMin}–{profile.scaleMax} °C · T<sub>max</sub> {profile.tMax} °C
              </p>
            ) : null}

            <label className="field">
              <span>etykieta</span>
              <input
                type="text"
                value={label}
                maxLength={120}
                placeholder="np. Test 01 — ładowanie"
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>

            <label className="field">
              <span>notatka (opcjonalna)</span>
              <textarea
                value={note}
                rows={2}
                maxLength={2000}
                placeholder="cel testu, konfiguracja stanowiska…"
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <button type="submit" className="button-primary" disabled={busy || label.trim() === ''}>
              Rozpocznij sesję
            </button>
          </form>

          {data.health?.sourceKind === 'mock' ? (
            <p className="session-form__hint">
              Źródło syntetyczne symuluje materiał wybrany przy starcie serwera — po rozpoczęciu
              sesji z innym materiałem zrestartuj serwer, żeby liczby trafiły we właściwy zakres.
            </p>
          ) : null}
        </section>
      )}

      {/* ------------------------- Poprzednie sesje ------------------------- */}
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">zakończone sesje</h2>
          <p className="card__meta">{past.length}</p>
        </div>

        {past.length === 0 ? (
          <div className="note">Jeszcze żadna sesja nie została zakończona.</div>
        ) : (
          <div className="session-list">
            {past.map((record) => (
              <details key={record.id} className="session-item">
                <summary>
                  <span className="session-item__label">{record.label}</span>
                  <span className="session-item__meta mono">
                    {record.material} · {formatDate(record.startedAt)} ·{' '}
                    {formatDuration(record.startedAt, record.endedAt)} · {record.events.length}{' '}
                    zdarzeń
                  </span>
                </summary>
                {record.note ? <p className="session-item__note">{record.note}</p> : null}
                <Timeline record={record} />
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Os czasu zdarzen jednej sesji. */
function Timeline({ record }: { record: SessionRecord }) {
  return (
    <ol className="timeline">
      {record.events.map((event, index) => (
        <li key={`${event.ts}-${index}`} className="timeline__item">
          <span className="timeline__time mono">{formatClock(event.ts)}</span>
          <span className="timeline__label">{event.label}</span>
        </li>
      ))}
    </ol>
  );
}
