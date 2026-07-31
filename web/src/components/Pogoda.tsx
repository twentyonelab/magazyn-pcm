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
import { ikonaNieba } from './IkonyPogody.js';

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
    v === null ? NO_DATA : `${v.toFixed(miejsca).replace('.', ',')} ${jednostka}`;

  // Układ z makiety v0.3: duża ikona nieba i temperatura w nagłówku, niżej
  // wiersze etykieta–wartość. Etykiety stoją na stałe (nie tylko w podpowiedzi),
  // bo karta jest teraz pełnoprawnym elementem kompozycji, nie nakładką.
  return (
    <div className={`pogoda is-${dane.source}`} role="status">
      <div className="pogoda__glowa" title="Temperatura powietrza na zewnątrz">
        <img
          className="pogoda__ikona-nieba"
          src={ikonaNieba(dane.text, dane.cloudCover)}
          alt={dane.text ?? 'stan nieba'}
        />
        <div className="pogoda__temp-blok">
          <span className="pogoda__temp mono">
            {dane.tempC === null ? NO_DATA : `${dane.tempC.toFixed(1).replace('.', ',')} °C`}
          </span>
          <span className="pogoda__sub">zewnętrznie{dane.text ? ` · ${dane.text}` : ''}</span>
        </div>
      </div>

      <div className="pogoda__rzad" title="Wilgotność względna powietrza">
        <span className="pogoda__etykieta">wilgotność</span>
        <span className="pogoda__wartosc mono">{liczba(dane.humidity, '%')}</span>
      </div>
      <div className="pogoda__rzad" title="Prędkość wiatru">
        <span className="pogoda__etykieta">wiatr</span>
        <span className="pogoda__wartosc mono">{liczba(dane.windKmh, 'km/h')}</span>
      </div>
      {dane.radiationWm2 !== null ? (
        <div
          className="pogoda__rzad"
          title="Natężenie promieniowania słonecznego — wpływa na zyski ciepła przez przegrody"
        >
          <span className="pogoda__etykieta">nasłonecznienie</span>
          <span className="pogoda__wartosc mono">{liczba(dane.radiationWm2, 'W/m²')}</span>
        </div>
      ) : null}

      <p className="pogoda__zrodlo" title={`${dane.place} · odczyt ${dane.ts}`}>
        {dane.place} · {OPIS_ZRODLA[dane.source]}
      </p>
    </div>
  );
}
