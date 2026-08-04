/**
 * Widok Diagnostyka.
 *
 * Zbudowany wczesnie i celowo: bez niego debugowanie calej reszty jest
 * zgadywaniem. Pokazuje surowe wartosci i dwa NIEZALEZNE stany lacznosci,
 * bo to zupelnie inne awarie:
 *
 *   przegladarka -> serwer      (czy aplikacja dostaje dane)
 *   serwer -> Miniserver        (czy jest co dostawac)
 */

import { Fragment, useEffect, useState } from 'react';
import type { PublicPoint } from '@magazyn-pcm/shared';
import type { LiveData, LinkState } from '../useLiveData.js';
import {
  FALLBACK_STALE_AFTER_MS,
  GROUP_LABEL,
  NO_DATA,
  POINT_STATE_LABEL,
  SOURCE_STATUS_LABEL,
  formatAge,
  formatClock,
  formatNumber,
  formatUptime,
  materialLabel,
  pointState,
} from '../format.js';

const LINK_LABEL: Record<LinkState, string> = {
  connecting: 'łączę się',
  live: 'na żywo',
  reconnecting: 'ponawiam połączenie',
  error: 'brak połączenia',
  // Ten stan przechwytuje App i pokazuje ekran logowania, wiec tutaj
  // praktycznie nie da sie go zobaczyc — etykieta istnieje dla kompletnosci.
  unauthorized: 'wymagane logowanie',
};

/** Zegar odliczajacy wiek wartosci — inaczej kolumna "wiek" stalaby w miejscu. */
function useTicker(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function StatTile(props: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className={`tile${props.tone ? ` is-${props.tone}` : ''}`}>
      <p className="tile__label">{props.label}</p>
      <p className="tile__value">{props.value}</p>
    </div>
  );
}

export function Diagnostyka({ data }: { data: LiveData }) {
  const now = useTicker(1000);
  const { points, values, health, link } = data;

  const linkTone: 'ok' | 'warn' | 'bad' =
    link === 'live' ? 'ok' : link === 'error' ? 'bad' : 'warn';

  /**
   * Gdy nie mamy lacznosci z serwerem, NIE WIEMY, co dzieje sie miedzy
   * serwerem a Miniserverem. Pokazanie ostatniego znanego stanu jako
   * biezacego byloby tym samym klamstwem, co pokazanie starej temperatury
   * jako aktualnej.
   */
  const linkLive = link === 'live';

  const sourceTone: 'ok' | 'warn' | 'bad' = !linkLive
    ? 'warn'
    : !health
      ? 'warn'
      : health.source === 'ok'
        ? 'ok'
        : health.source === 'auth_error' || health.source === 'error'
          ? 'bad'
          : 'warn';

  // Prog przestarzalosci pochodzi z konfiguracji serwera, nie z kodu widoku.
  const staleAfterMs = health?.staleAfterMs ?? FALLBACK_STALE_AFTER_MS;

  // Liczba przestarzalych liczona TU, na biezaco — lista z serwera zamarla by
  // razem z serwerem.
  const staleCount = points.filter(
    (point) => pointState(point, values[point.id], staleAfterMs, now, linkLive) === 'stale',
  ).length;

  // Punkty w kolejnosci grup, zeby tabela dala sie czytac.
  const grouped = groupPoints(points);

  /*
   * USLUGA POGODOWA LOXONE ODPOWIADA, ALE NIC NIE LICZY.
   *
   * Punkty POGODA_* z pokoju „Otoczenie" sa podlaczone i zwracaja HTTP 200,
   * wiec w tabeli wygladaja jak dzialajace czujniki — z wartoscia zero
   * i stanem „aktualne". To najgorszy rodzaj wpisu na ekranie diagnostycznym:
   * zla dana udajaca dobra. Wykrywamy wiec zestaw zer i mowimy wprost, co on
   * znaczy, zamiast liczyc na to, ze ktos sam skojarzy.
   *
   * Warunek jest KOMBINACJA, nie samym „temperatura = 0": zero stopni na
   * zewnatrz jest zima normalne, a cisnienie 0 hPa nie jest nigdy. Ta sama
   * zasada dziala po stronie serwera (server/src/weather.ts), ktory z tego
   * powodu nie wypuszcza zer na kafelek pogody.
   */
  const pogodaZLoxone = points.filter(
    (p) => p.group === 'ambient' && p.id.startsWith('WEATHER_') && p.available,
  );
  const pogodaStoiNaZerach =
    pogodaZLoxone.length > 0 &&
    pogodaZLoxone.every((p) => values[p.id]?.v === 0) &&
    pogodaZLoxone.some((p) => p.id === 'WEATHER_PRESSURE');

  return (
    <div className="stack">
      <section className="tiles">
        <StatTile label="przeglądarka → serwer" value={LINK_LABEL[link]} tone={linkTone} />
        <StatTile
          label="serwer → Miniserver"
          value={!linkLive ? 'nieznany' : health ? SOURCE_STATUS_LABEL[health.source] : NO_DATA}
          tone={sourceTone}
        />
        <StatTile
          label="opóźnienie odpytywania"
          value={
            !linkLive || health === null || health.latencyMs === null
              ? NO_DATA
              : `${health.latencyMs} ms`
          }
        />
        <StatTile
          label="czas działania serwera"
          value={!linkLive || !health ? NO_DATA : formatUptime(health.uptimeS)}
        />
        <StatTile
          label="ostatni udany odczyt"
          value={health ? formatClock(health.lastOkAt) : NO_DATA}
        />
        <StatTile
          label="punkty przestarzałe"
          value={String(staleCount)}
          tone={staleCount > 0 ? 'warn' : undefined}
        />
        {/* Wymienne zbiorniki: bez tego kafla nie dalo by sie sprawdzic,
            czy system rozpoznal wlasciwy zestaw sond po wymianie. */}
        <StatTile
          label="podłączony zbiornik"
          value={
            !health || !health.bank.active
              ? 'nierozpoznany'
              : health.bank.detection === 'auto'
                ? materialLabel(health.bank.active, data.materials)
                : `${materialLabel(health.bank.active, data.materials)} (${
                    health.bank.detection === 'manual' ? 'wymuszony' : 'założony'
                  })`
          }
          tone={health?.bank.detection === 'auto' ? undefined : 'warn'}
        />
      </section>

      {linkLive && health?.message ? (
        <div className={`note${sourceTone === 'bad' ? ' is-bad' : ''}`}>{health.message}</div>
      ) : null}

      {/* Nierozpoznany zbiornik to nie drobiazg: od zestawu zalezy parafina,
          a od niej cala skala barwna i opis zbieranych danych. */}
      {linkLive && health && !health.bank.active && health.bank.message ? (
        <div className="note">
          <strong>Nie wiem, który zbiornik jest podłączony.</strong> {health.bank.message}
        </div>
      ) : null}

      {linkLive && health?.bank.active && health.bank.detection === 'manual' ? (
        <div className="note">
          Zbiornik <strong>{materialLabel(health.bank.active, data.materials)}</strong> jest
          wymuszony w konfiguracji (<code>FORCE_BANK</code>), nie rozpoznany. Po wymianie zbiornika
          trzeba to zmienić ręcznie w pliku <code>.env</code>.
        </div>
      ) : null}

      {health && health.pendingUuidIds.length > 0 ? (
        <div className="note">
          <strong>{health.pendingUuidIds.length} punktów czeka na UUID</strong> (
          {health.pendingUuidIds.join(', ')}). Miniserver wydaje wartości po identyfikatorze
          kontrolki, a nie po jej nazwie — punkt bez identyfikatora nie ma o co zapytać i zostaje
          pusty. Uruchom <code>npm run uuid</code> w sieci laboratorium i uzupełnij{' '}
          <code>server/src/points.config.ts</code>.
        </div>
      ) : null}

      {health?.configChanged ? (
        <div className="note is-bad">
          Konfiguracja w Loxone Config zmieniła się od startu aplikacji. Sprawdź, czy UUID-y
          w rejestrze punktów nadal są aktualne.
        </div>
      ) : null}

      {linkLive && pogodaStoiNaZerach ? (
        <div className="note">
          <strong>Pogoda ze sterownika odpowiada, ale nic nie mierzy.</strong> Wszystkie cztery
          punkty z pokoju „Otoczenie" zwracają dokładnie zero — także ciśnienie, które nie może
          wynosić 0 hPa. Usługa pogodowa Loxone nie ma dla czego liczyć pogody, bo{' '}
          <strong>lokalizacja projektu nie jest zapisana w Miniserverze</strong> (szerokość
          i długość geograficzna = 0). Ustaw lokalizację w Loxone Config, zapisz konfigurację —
          i to wszystko, aplikacja przełączy źródło sama. Do tego czasu kafelek pogody na
          schemacie bierze dane z Open-Meteo i tak się podpisuje.
        </div>
      ) : null}

      {data.error && link !== 'live' ? <div className="note is-bad">{data.error}</div> : null}

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">surowe wartości</h2>
          <p className="card__meta">
            {health ? `próg przestarzałości ${health.staleAfterMs / 1000} s` : ''}
          </p>
        </div>

        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>punkt</th>
                <th>opis</th>
                <th className="num">wartość</th>
                <th>jednostka</th>
                <th className="num">wiek</th>
                <th>stan</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ group, groupPoints: pointsInGroup }) => (
                <Fragment key={group}>
                  <tr className="table__group">
                    <th colSpan={6}>{GROUP_LABEL[group] ?? group}</th>
                  </tr>
                  {pointsInGroup.map((point) => {
                    const value = values[point.id];
                    const state = pointState(point, value, staleAfterMs, now, linkLive);
                    return (
                      <tr key={point.id} className={`row is-${state}`}>
                        <td className="mono">{point.id}</td>
                        <td className="muted">{point.label}</td>
                        <td className="num mono strong">
                          {value ? formatNumber(value, point) : NO_DATA}
                        </td>
                        <td className="muted">{point.unit || NO_DATA}</td>
                        <td className="num mono muted">{value ? formatAge(value, now) : NO_DATA}</td>
                        <td>
                          <span className={`badge is-${state}`}>{POINT_STATE_LABEL[state]}</span>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const GROUP_ORDER = ['pcm', 'meter', 'ambient', 'heatpump', 'actuator'];

function groupPoints(points: PublicPoint[]): Array<{ group: string; groupPoints: PublicPoint[] }> {
  const buckets = new Map<string, PublicPoint[]>();

  for (const point of points) {
    const bucket = buckets.get(point.group);
    if (bucket) bucket.push(point);
    else buckets.set(point.group, [point]);
  }

  return [...buckets.entries()]
    .sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a[0]);
      const bi = GROUP_ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(([group, groupPoints]) => ({ group, groupPoints }));
}
