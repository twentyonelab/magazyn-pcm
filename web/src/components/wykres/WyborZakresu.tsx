/**
 * WYBÓR ZAKRESU CZASU — suwak godzinowy plus dwa przyciski skokowe.
 *
 * Suwak obejmuje 1–24 h co godzinę: najczęstsze pytanie badacza to „pokaż
 * ostatnie N godzin", gdzie N zależy od tego, kiedy zaczął się dzisiejszy
 * test — i żadna drabinka sztywnych zakresów na nie dobrze nie odpowiada.
 * Tydzień i miesiąc zostają przyciskami, bo powyżej doby godzinowa precyzja
 * nie znaczy już nic.
 *
 * POBRANIE IDZIE Z OPÓŹNIENIEM 250 ms PO OSTATNIM RUCHU. Przeciągnięcie
 * suwaka z 1 na 24 wyzwala dwadzieścia kilka zdarzeń `change`, a każde
 * zatwierdzenie to zapytanie do `/api/history` — bez zwłoki jedno pociągnięcie
 * robiłoby z aplikacji floodera własnego serwera. Wartość na etykiecie
 * odświeża się mimo to od razu, więc suwak nie sprawia wrażenia opornego.
 *
 * Jeden komponent dla obu kart (temperatury i przepływy) — z tego samego
 * powodu, dla którego dzielą płótno i osie: dwie karty jedna pod drugą,
 * obsługiwane inaczej, wymagałyby uczenia się dwóch rzeczy.
 */

import { useEffect, useRef, useState } from 'react';
import {
  MIESIAC_H,
  SUWAK_MAX_H,
  SUWAK_MIN_H,
  TYDZIEN_H,
  etykietaZakresu,
} from './os.js';

interface Props {
  /** Bieżący zakres w godzinach — 1–24 z suwaka albo tydzień/miesiąc. */
  godzin: number;
  onGodzin: (godzin: number) => void;
  /** Rozróżnia listy znaczników obu kart — `id` w dokumencie musi być jedno. */
  idSufiks: string;
}

export function WyborZakresu({ godzin, onGodzin, idSufiks }: Props) {
  /**
   * Wartość POKAZYWANA w trakcie przeciągania. Zatwierdzenie (i pobranie)
   * idzie z opóźnieniem — patrz nagłówek pliku. Rozdzielenie tych dwóch
   * rzeczy jest całym sensem tego stanu.
   */
  const [robocza, setRobocza] = useState(godzin);
  const timer = useRef(0);

  // Zmiana z zewnątrz (przycisk tydzień/miesiąc) nadpisuje wartość roboczą.
  useEffect(() => setRobocza(godzin), [godzin]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const przesun = (h: number): void => {
    setRobocza(h);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onGodzin(h), 250);
  };

  const skocz = (h: number): void => {
    window.clearTimeout(timer.current);
    onGodzin(h);
  };

  /** Czy zakres siedzi na suwaku, czy na jednym z przycisków. */
  const naSuwaku = godzin <= SUWAK_MAX_H;

  return (
    <div className="zakres" role="group" aria-label="Zakres czasu">
      <div className={`zakres__suwak${naSuwaku ? '' : ' is-uspiony'}`}>
        <input
          type="range"
          min={SUWAK_MIN_H}
          max={SUWAK_MAX_H}
          step={1}
          value={Math.min(robocza, SUWAK_MAX_H)}
          list={`zakres-progi-${idSufiks}`}
          aria-label="Ostatnie godziny, od jednej do doby"
          onChange={(event) => przesun(Number(event.target.value))}
        />
        <datalist id={`zakres-progi-${idSufiks}`}>
          {[1, 6, 12, 18, 24].map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
        {/* Stała szerokość w arkuszu — „godzina" i „7 h" nie mogą przestawiać
            suwaka w poziomie przy każdej zmianie. */}
        <span className="zakres__wartosc mono">
          {etykietaZakresu(Math.min(robocza, SUWAK_MAX_H))}
        </span>
      </div>

      <div className="segment" role="group" aria-label="Zakresy dłuższe niż doba">
        <button
          type="button"
          className={`segment__item${godzin === TYDZIEN_H ? ' is-active' : ''}`}
          onClick={() => skocz(TYDZIEN_H)}
          title="Pokaż ostatni tydzień"
        >
          tydzień
        </button>
        <button
          type="button"
          className={`segment__item${godzin === MIESIAC_H ? ' is-active' : ''}`}
          onClick={() => skocz(MIESIAC_H)}
          title="Pokaż ostatni miesiąc"
        >
          miesiąc
        </button>
      </div>
    </div>
  );
}
