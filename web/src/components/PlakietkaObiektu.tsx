/**
 * Plakietka otwartego magazynu — wyśrodkowana, tuż nad dolnym paskiem stanu.
 *
 * DLACZEGO NIE W NAWIGACJI. Nazwa obiektu stała wcześniej w górnej pastylce,
 * między przyciskiem domu a widokami. Miała tam dwie wady. Pierwsza: rosła
 * razem z nazwą, więc „Centrum handlowe Rynek Zachodni" rozpychało pastylkę
 * i przesuwało wszystkie widoki w prawo — menu zmieniało położenie zależnie od
 * tego, w co się weszło. Druga: na węższym ekranie trzeba ją było ukrywać
 * (`@media` 900 px), czyli dokładnie tam, gdzie najłatwiej zgubić orientację,
 * odpowiedź na pytanie „czyje to liczby" znikała.
 *
 * Tutaj jest miejsce na pełną nazwę, jedno na wszystkich widokach, i nic nie
 * przesuwa. Dokłada też to, czego nazwa sama nie powie: KROPKĘ ŻYWOTNOŚCI.
 * Pulsuje na zielono, dopóki dane naprawdę napływają — a gdy przestaną, gaśnie
 * i zmienia barwę, zamiast dalej udawać, że wszystko jest świeże.
 *
 * Dla punktów POKAZOWYCH kropka nie pulsuje nigdy, choćby łącze było idealne:
 * za tymi punktami nie stoi żadna instalacja, więc nie ma czego pulsować.
 */

import type { Lokalizacja } from '../map/lokalizacje.js';
import type { Kierunek } from '../soc.js';
import type { LiveData } from '../useLiveData.js';

interface Props {
  punkt: Lokalizacja;
  /** Barwa nośnika — ta sama, którą ma cały interfejs. */
  kierunek: Kierunek;
  data: LiveData;
}

export function PlakietkaObiektu({ punkt, kierunek, data }: Props) {
  const pokazowy = punkt.stan === 'demo';

  /**
   * Trzy stany, nie dwa: „płynie", „coś nie tak", „stoi".
   *
   * Rozdzielenie ostatnich dwóch ma znaczenie. Zerwane łącze z serwerem
   * i działający serwer, któremu nie odpowiada Miniserver, wyglądają na ekranie
   * podobnie, a znaczą coś innego — i naprawia się je w innym miejscu.
   */
  const stan: 'zywe' | 'uwaga' | 'martwe' = pokazowy
    ? 'martwe'
    : data.link !== 'live'
      ? 'martwe'
      : data.health?.source === 'ok'
        ? 'zywe'
        : 'uwaga';

  const opisStanu =
    stan === 'zywe'
      ? 'dane napływają'
      : stan === 'uwaga'
        ? 'serwer działa, ale Miniserver nie odpowiada w pełni'
        : pokazowy
          ? 'punkt pokazowy — dane wyliczone, nie zmierzone'
          : 'brak połączenia z serwerem';

  return (
    <div className={`plakietka-obiektu is-${stan}`} data-kierunek={kierunek}>
      <span className="plakietka-obiektu__kropka" aria-hidden="true" />
      <span className="plakietka-obiektu__nazwa">{punkt.nazwa}</span>
      <span className="plakietka-obiektu__miasto">{punkt.miasto}</span>
      {/* Opis stanu jest dostępny dla czytnika ekranu zawsze, a dla oczu
          w podpowiedzi — na plakietce zostawiamy samą kropkę, żeby nie
          dublowała dolnego paska, który mówi to samo liczbami. */}
      <span className="visually-hidden">{opisStanu}</span>
      {pokazowy ? <span className="plakietka-obiektu__znacznik">pokazowy</span> : null}
    </div>
  );
}
