/**
 * Pogoda dla stanowiska — kafelek w lewym górnym rogu schematu.
 *
 * Dlaczego akurat tutaj: przy magazynie ciepła pogoda nie jest ozdobą. Straty
 * z powierzchni zbiornika i to, ile ciepła w ogóle trzeba dostarczyć, zależą
 * od tego, co dzieje się za ścianą. Dlatego stoi na tym samym rysunku co
 * instalacja, a nie w osobnej zakładce.
 *
 * ŹRÓDŁO JEST WIDOCZNE ZAWSZE. Dopóki pogoda nie idzie ze sterownika, kafelek
 * mówi to wprost — bo „22 °C przy instalacji" i „22 °C w prognozie dla
 * Gliwic" to dwie różne informacje i pomylenie ich zafałszowałoby bilans.
 */

import { useEffect, useState } from 'react';
import type { WeatherReading } from '@magazyn-pcm/shared';
import { NO_DATA } from '../format.js';

/** Pogoda zmienia się w minutach — pytamy raz na pięć. */
const ODSWIEZANIE_MS = 5 * 60 * 1000;

/**
 * Po nieudanej próbie pytamy szybciej.
 *
 * Najczęstszy powód braku pogody to zaplecze, które właśnie się restartuje.
 * Przy jednym rytmie pięciu minut kafelek zostawałby wtedy pusty przez całe
 * pięć minut po tym, jak serwer już dawno wstał.
 */
const PONOWNA_PROBA_MS = 20 * 1000;

const OPIS_ZRODLA: Record<WeatherReading['source'], string> = {
  loxone: 'ze sterownika',
  'open-meteo': 'Open-Meteo',
};

export function Pogoda() {
  const [dane, setDane] = useState<WeatherReading | null>(null);
  const [nieudane, setNieudane] = useState(false);

  useEffect(() => {
    let porzucone = false;
    let timer = 0;
    const kontroler = new AbortController();

    const zaplanuj = (opoznienie: number): void => {
      timer = window.setTimeout(() => void pobierz(), opoznienie);
    };

    const pobierz = async (): Promise<void> => {
      try {
        const res = await fetch('/api/weather', { signal: kontroler.signal });
        if (!res.ok) throw new Error(String(res.status));
        const dto = (await res.json()) as WeatherReading | null;
        if (porzucone) return;

        // Poprawna odpowiedź, ale BEZ ODCZYTU (serwer zwraca wtedy `null`).
        // Wcześniej kafelek po prostu znikał i wracał dopiero po pięciu
        // minutach — dokładnie tak, jakby był zepsuty. Traktujemy to jak
        // nieudaną próbę: mów o tym wprost i pytaj ponownie za chwilę.
        if (!dto) {
          setNieudane(true);
          zaplanuj(PONOWNA_PROBA_MS);
          return;
        }

        setDane(dto);
        setNieudane(false);
        zaplanuj(ODSWIEZANIE_MS);
      } catch (error) {
        if (porzucone || (error as Error).name === 'AbortError') return;
        setNieudane(true);
        zaplanuj(PONOWNA_PROBA_MS);
      }
    };

    void pobierz();

    return () => {
      porzucone = true;
      kontroler.abort();
      window.clearTimeout(timer);
    };
  }, []);

  // Bez pogody kafelek znika. Puste pole z napisem „brak danych" zabierałoby
  // miejsce na rysunku, nic nie wnosząc.
  if (!dane && !nieudane) return null;

  if (!dane) {
    return (
      <div className="pogoda is-bad" role="status">
        <p className="pogoda__brak">pogoda niedostępna</p>
      </div>
    );
  }

  const liczba = (v: number | null, jednostka: string, miejsca = 0): string =>
    v === null ? NO_DATA : `${v.toFixed(miejsca)} ${jednostka}`;

  return (
    <div className={`pogoda is-${dane.source}`} role="status">
      <p className="pogoda__temp mono">
        {dane.tempC === null ? NO_DATA : `${dane.tempC.toFixed(1)} °C`}
      </p>

      {dane.text ? <p className="pogoda__opis">{dane.text}</p> : null}

      <dl className="pogoda__pola">
        <div>
          <dt>wilgotność</dt>
          <dd className="mono">{liczba(dane.humidity, '%')}</dd>
        </div>
        <div>
          <dt>wiatr</dt>
          <dd className="mono">{liczba(dane.windKmh, 'km/h')}</dd>
        </div>
        {dane.radiationWm2 !== null ? (
          <div>
            <dt>napromienienie</dt>
            <dd className="mono">{liczba(dane.radiationWm2, 'W/m²')}</dd>
          </div>
        ) : null}
      </dl>

      <p className="pogoda__zrodlo" title={`${dane.place} · odczyt ${dane.ts}`}>
        {dane.place} · {OPIS_ZRODLA[dane.source]}
      </p>
    </div>
  );
}
