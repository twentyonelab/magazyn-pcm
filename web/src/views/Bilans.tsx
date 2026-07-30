/**
 * Widok Bilans energii — swiadoma zaslepka.
 *
 * Nie pokazujemy zmyslonych liczb. Widok mowi wprost, co juz jest,
 * czego brakuje i dlaczego — zeby bylo jasne, ze to nie usterka,
 * tylko brakujace zrodlo danych.
 */

import type { LiveData } from '../useLiveData.js';
import { NO_DATA, formatValue, pointState, FALLBACK_STALE_AFTER_MS, POINT_STATE_LABEL } from '../format.js';

const METER_IDS = [
  'METER_POWER',
  'METER_ENERGY_HEAT',
  'METER_ENERGY_COOL',
  'METER_FLOW',
  'METER_T1',
  'METER_T2',
  'METER_DT',
  'METER_ERROR',
];

export function Bilans({ data }: { data: LiveData }) {
  const staleAfterMs = data.health?.staleAfterMs ?? FALLBACK_STALE_AFTER_MS;
  const now = Date.now();
  // Gdy kanał żyje, o przestarzałości decyduje serwer — patrz isStale().
  const channelAlive = data.link === 'live';
  const meterPoints = METER_IDS.map((id) => data.points.find((p) => p.id === id)).filter(
    (p): p is NonNullable<typeof p> => Boolean(p),
  );
  const anyMeterData = meterPoints.some((p) => data.values[p.id]?.v !== null && data.values[p.id]);

  return (
    <div className="stack">
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">jak policzymy bilans</h2>
        </div>
        <p className="card__lead">
          Energia cieplna przyjdzie z ciepłomierza (AXIOMA QALCOSONIC E4), energia elektryczna
          z licznika kWh. Z ich ilorazu powstanie <strong>COP</strong> — ile ciepła oddaje układ
          na każdą kilowatogodzinę prądu. Wszystkie trzy liczby pojawią się na tym ekranie
          automatycznie, gdy tylko punkty ciepłomierza zaczną raportować.
        </p>

        <div className="tiles">
          <div className="tile">
            <p className="tile__label">energia cieplna</p>
            <p className="tile__value">{NO_DATA}</p>
          </div>
          <div className="tile">
            <p className="tile__label">energia elektryczna</p>
            <p className="tile__value">{NO_DATA}</p>
          </div>
          <div className="tile">
            <p className="tile__label">COP</p>
            <p className="tile__value">{NO_DATA}</p>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">czego brakuje</h2>
        </div>
        <ul className="blockers">
          <li>
            <strong>Mapa rejestrów Modbus ciepłomierza</strong> — dokument „Modbus RTU Slave Module
            for Qalcosonic E3/E4". Bez niego adresy rejestrów są nieznane i punkty{' '}
            <code>METER_*</code> pozostają niepodłączone.
          </li>
          <li>
            <strong>Zasilanie 24 VDC ciepłomierza</strong> — na samej baterii licznik udostępnia
            Modbusa tylko 80 sekund na godzinę. Odczyt ciągły wymaga zasilania zewnętrznego.
          </li>
          <li>
            <strong>Licznik energii elektrycznej</strong> — otwarte pytanie ze specyfikacji: Modbus
            czy wyjście impulsowe na wejście cyfrowe Miniservera. Od odpowiedzi zależy sposób
            podłączenia.
          </li>
          <li>
            Uwaga pomiarowa: ciepłomierz nie sumuje energii przy ΔT poniżej <strong>3 K</strong>{' '}
            (zgłasza kod błędu 4) — przy małych różnicach temperatur bilans będzie zaniżony
            z przyczyn metrologicznych, nie programowych.
          </li>
        </ul>
      </section>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">punkty ciepłomierza</h2>
          <p className="card__meta">
            {anyMeterData ? 'raportują' : 'wszystkie czekają na mapę rejestrów'}
          </p>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>punkt</th>
                <th>opis</th>
                <th className="num">wartość</th>
                <th>stan</th>
              </tr>
            </thead>
            <tbody>
              {meterPoints.map((point) => {
                const value = data.values[point.id];
                const state = pointState(point, value, staleAfterMs, now, channelAlive);
                return (
                  <tr key={point.id} className={`row is-${state}`}>
                    <td className="mono">{point.id}</td>
                    <td className="muted">{point.label}</td>
                    <td className="num mono strong">{value ? formatValue(value, point) : NO_DATA}</td>
                    <td>
                      <span className={`badge is-${state}`}>{POINT_STATE_LABEL[state]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
