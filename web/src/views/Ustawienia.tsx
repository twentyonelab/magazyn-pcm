/**
 * Widok Ustawienia.
 *
 * Konfiguracja serwera jest TYLKO DO ODCZYTU (wersja 1) — zmienia sie ja
 * w pliku .env i w server/src/points.config.ts, a widok mowi gdzie.
 * Jedyne, co przelacza sie tutaj, to opcje interfejsu tej przegladarki.
 */

import { useEffect, useState } from 'react';
import type { ConfigResponse } from '@magazyn-pcm/shared';
import { fetchConfig } from '../api.js';
import type { LiveData } from '../useLiveData.js';
import { GROUP_LABEL, NO_DATA } from '../format.js';
import { SETTINGS_LABELS, setSetting, useSettings, type UiToggleKey } from '../settings.js';

export function Ustawienia({ data }: { data: LiveData }) {
  const settings = useSettings();
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig()
      .then(setConfig)
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, []);

  const pendingUuid = config?.mappings.filter((m) => m.available && m.uuid === null) ?? [];

  return (
    <div className="stack">
      {error ? <div className="note is-bad">{error}</div> : null}

      {/* ------------------------- Opcje interfejsu ------------------------- */}
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">opcje interfejsu</h2>
          <p className="card__meta">zapisywane w tej przeglądarce</p>
        </div>
        <div className="toggles">
          {(Object.keys(SETTINGS_LABELS) as UiToggleKey[]).map((key) => (
            <label key={key} className="toggle">
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(event) => setSetting(key, event.target.checked)}
              />
              <span className="toggle__body">
                <span className="toggle__label">{SETTINGS_LABELS[key].label}</span>
                <span className="toggle__hint">{SETTINGS_LABELS[key].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* ------------------------- Konfiguracja serwera ------------------------- */}
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">konfiguracja serwera</h2>
          <p className="card__meta">tylko do odczytu · zmiany w pliku .env</p>
        </div>

        {config ? (
          <div className="config-grid">
            <div className="config-row">
              <span>źródło danych</span>
              <strong className="mono">
                {config.sourceKind === 'mock' ? 'syntetyczne (mock)' : `Miniserver ${config.loxoneHost}`}
              </strong>
            </div>
            <div className="config-row">
              <span>interwał odpytywania</span>
              <strong className="mono">{config.pollIntervalMs / 1000} s</strong>
            </div>
            <div className="config-row">
              <span>próg przestarzałości</span>
              <strong className="mono">
                {config.staleAfterMs / 1000} s ({config.staleFactor} × interwał)
              </strong>
            </div>
            <div className="config-row">
              <span>historia</span>
              <strong className="mono">
                {config.historyEnabled
                  ? `${config.historyBackend === 'sqlite' ? 'SQLite' : 'plik NDJSON'}${
                      config.historyRecords !== null ? ` · ${config.historyRecords} rekordów` : ''
                    }`
                  : 'wyłączona'}
              </strong>
            </div>
            <div className="config-row">
              <span>plik historii</span>
              <strong className="mono config-path">{config.historyPath}</strong>
            </div>
            <div className="config-row">
              <span>heartbeat zapisu</span>
              <strong className="mono">co {config.historyHeartbeatS} s przy braku zmian</strong>
            </div>
          </div>
        ) : (
          <div className="note">Wczytuję konfigurację…</div>
        )}
      </section>

      {/* ------------------------- Materiały ------------------------- */}
      {data.materials ? (
        <section className="card">
          <div className="card__head">
            <h2 className="card__title">profile parafin</h2>
            <p className="card__meta">server/src/materials.config.ts</p>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>parafina</th>
                  <th className="num">skala barwna</th>
                  <th className="num">pasmo przemiany</th>
                  <th className="num">ciepło utajone</th>
                  <th className="num">T maks.</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(data.materials.profiles).map((profile) => (
                  <tr key={profile.id}>
                    <td>
                      <strong>{profile.label}</strong>
                      {data.materials!.defaultMaterial === profile.id ? (
                        <span className="badge is-ok" style={{ marginLeft: '0.5rem' }}>
                          domyślny
                        </span>
                      ) : null}
                    </td>
                    <td className="num mono">
                      {profile.scaleMin}–{profile.scaleMax} °C
                    </td>
                    <td className="num mono">
                      {profile.phaseBandMin}–{profile.phaseBandMax} °C
                    </td>
                    <td className="num mono">{profile.latentHeat} kJ/kg</td>
                    <td className="num mono">{profile.tMax} °C</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="card__lead" style={{ marginTop: '1rem', marginBottom: 0 }}>
            Objętości: magazyn {data.materials.volumesL.storage} l · bufor{' '}
            {data.materials.volumesL.buffer} l. Wartości konfiguracyjne — rozbieżność 200/80 l
            z dokumentacji pozostaje do wyjaśnienia.
          </p>
        </section>
      ) : null}

      {/* ------------------------- Mapowanie punktów ------------------------- */}
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">mapowanie punktów → UUID Loxone</h2>
          <p className="card__meta">server/src/points.config.ts · npm run uuid</p>
        </div>

        {pendingUuid.length > 0 ? (
          <div className="note">
            <strong>{pendingUuid.length} punktów czeka na UUID</strong> (
            {pendingUuid.map((m) => m.id).join(', ')}). Miniserver wydaje wartości po
            identyfikatorze kontrolki, a nie po jej nazwie — punkt bez identyfikatora nie ma o co
            zapytać i zostaje pusty. Uruchom <code>npm run uuid</code> w sieci laboratorium i wklej
            identyfikatory do rejestru.
          </div>
        ) : null}

        {config ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>punkt</th>
                  <th>grupa</th>
                  <th>jednostka</th>
                  <th>UUID</th>
                  <th>stan</th>
                </tr>
              </thead>
              <tbody>
                {config.mappings.map((mapping) => (
                  <tr key={mapping.id} className={mapping.available ? '' : 'row is-not-connected'}>
                    <td className="mono">{mapping.id}</td>
                    <td className="muted">{GROUP_LABEL[mapping.group] ?? mapping.group}</td>
                    <td className="muted">{mapping.unit || NO_DATA}</td>
                    <td className="mono config-path">{mapping.uuid ?? NO_DATA}</td>
                    <td>
                      {/* Trzy stany opisują DROGĘ punktu od pomysłu do odczytu.
                          Bez wyjaśnienia różnica między nimi jest nieczytelna,
                          a to ona mówi, czyja jest następna ruch: instalatora
                          w laboratorium czy narzędzia `npm run uuid`. */}
                      {!mapping.available ? (
                        <span
                          className="badge is-not-connected"
                          title="Punkt istnieje w projekcie aplikacji, ale nie ma go jeszcze w instalacji — czujnik lub kanał licznika nie jest podłączony. Aplikacja go nie odpytuje i nigdy nie pokaże dla niego liczby."
                        >
                          zadeklarowany
                        </span>
                      ) : mapping.uuid ? (
                        <span
                          className="badge is-ok"
                          title="Punkt ma przypisany identyfikator kontrolki w Miniserverze, więc serwer wie, o co pytać. To jedyny stan, w którym punkt może podać wartość."
                        >
                          przypisany
                        </span>
                      ) : (
                        <span
                          className="badge is-stale"
                          title={
                            'Punkt jest podłączony w instalacji, ale nie ma przypisanego identyfikatora (UUID) kontrolki w Miniserverze — a Loxone daje wartości po identyfikatorze, nie po nazwie. Serwer nie ma więc o co zapytać i punkt zostaje pusty.\n\n' +
                            'Uzupełnia to `npm run uuid` uruchomiony w sieci stanowiska: dopasowuje punkty do kontrolek po nazwie i wpisuje identyfikatory do rejestru.\n\n' +
                            'Uwaga: przebudowa konfiguracji w Loxone Config nadaje kontrolkom NOWE identyfikatory, więc ten stan może wrócić dla punktu, który wcześniej działał.'
                          }
                        >
                          czeka na UUID
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
