/**
 * PODMIANA ŹRÓDŁA DANYCH NA PUNKT POKAZOWY Z MAPY.
 *
 * Aplikacja ma jedno wejście na dane — `useLiveData`. Ten hook staje za nim
 * i, gdy oglądany jest punkt pokazowy, oddaje widokom dane z modelu zamiast
 * ze strumienia. Widoki nie wiedzą o podmianie: dostają ten sam kształt
 * `LiveData`, więc nie ma w nich ani jednego warunku „a jeśli to punkt
 * pokazowy".
 *
 * Strumień SSE pracuje dalej w tle. Świadomie: powrót na stanowisko badawcze
 * ma być natychmiastowy, a nie okupiony ponownym łączeniem i czekaniem na
 * pierwszą migawkę.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Health, PointValues, Session } from '@magazyn-pcm/shared';
import type { Lokalizacja } from '../map/lokalizacje.js';
import type { LiveData } from '../useLiveData.js';
import { PUNKTY_POKAZOWE } from './zrodlo.js';
import { materialyPunktu, wartosciPunktu, zdrowiePunktu } from './punkt.js';

/** Co ile przeliczamy model — tyle samo, co realny cykl odpytywania. */
const TYKNIECIE_MS = 2000;

export function useDanePunktu(zywe: LiveData, punkt: Lokalizacja | null): LiveData {
  const [wartosci, setWartosci] = useState<PointValues>({});
  const [zdrowie, setZdrowie] = useState<Health | null>(null);
  const [znacznik, setZnacznik] = useState<Date | null>(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!punkt) return;
    startRef.current = Date.now();

    const tyknij = (): void => {
      const teraz = Date.now();
      setWartosci(wartosciPunktu(punkt, teraz));
      setZdrowie(zdrowiePunktu(punkt, startRef.current));
      setZnacznik(new Date(teraz));
    };

    tyknij();
    const zegar = window.setInterval(tyknij, TYKNIECIE_MS);
    return () => window.clearInterval(zegar);
  }, [punkt]);

  return useMemo<LiveData>(() => {
    if (!punkt) return zywe;

    // Sesja z materiałem punktu. Belka stanu naładowania i skale barwne czytają
    // materiał WŁAŚNIE z sesji — bez niej pokazywałyby domyślny profil, czyli
    // dla magazynu chłodu skalę parafiny.
    const sesja: Session = {
      material: materialyPunktu(punkt).defaultMaterial,
      label: `Punkt pokazowy · ${punkt.nazwa}`,
      note: 'Dane wyliczone z modelu. Za tym punktem nie stoi instalacja.',
      startedAt: new Date(startRef.current).toISOString(),
    };

    return {
      points: PUNKTY_POKAZOWE,
      values: wartosci,
      health: zdrowie,
      session: sesja,
      materials: materialyPunktu(punkt),
      link: 'live',
      lastMessageAt: znacznik,
      error: null,
      reload: zywe.reload,
    };
  }, [punkt, wartosci, zdrowie, znacznik, zywe]);
}
