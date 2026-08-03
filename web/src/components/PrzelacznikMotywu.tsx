/**
 * Przełącznik motywu: jasny ↔ ciemny.
 *
 * DWA STANY, NIE TRZY — i to jest poprawka, nie uproszczenie.
 *
 * Wcześniej przycisk chodził po kole auto → jasny → ciemny. Miało to sens na
 * papierze i nie miało go na ekranie: „auto" przy systemie ustawionym na jasny
 * daje dokładnie ten sam obraz co „jasny". Pierwsze kliknięcie przestawiało
 * więc stan wewnętrzny i NIE ZMIENIAŁO KOLORÓW — wyglądało to na zepsuty
 * przycisk i trzeba było klikać dwa razy, żeby cokolwiek się stało.
 *
 * Trzystanowego koła nie da się z tego uratować: dwa z trzech stanów wyglądają
 * identycznie, więc każdy obieg odwiedzający wszystkie trzy MUSI zawierać krok
 * bez widocznego skutku. Nie ma tu dobrej kolejności — jest tylko wybór, gdzie
 * schować niewypał. Dlatego stanów jest dwa i każde kliknięcie widać.
 *
 * „Auto" nie ginie: zostaje stanem POCZĄTKOWYM, więc przy pierwszym otwarciu
 * aplikacja idzie za ustawieniem systemu. Dotknięcie przełącznika znaczy „teraz
 * ja decyduję" i od tej chwili motyw jest zapisany na stałe. Tak działa
 * większość programów i nikt nie musi się tego uczyć.
 */

import type React from 'react';
import { setThemeChoice, useAppliedTheme } from '../theme.js';

function Ikona({ ciemny }: { ciemny: boolean }) {
  const wspolne: React.SVGProps<SVGSVGElement> = {
    viewBox: '0 0 24 24',
    width: 17,
    height: 17,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: 'false',
  };

  // Ikona pokazuje STAN OBECNY, nie docelowy: księżyc znaczy „jest noc".
  // Odwrotna konwencja („kliknij, żeby dostać to, co widzisz") wygląda tak samo,
  // a przy dwóch stanach nie da się jej odgadnąć bez podpowiedzi.
  if (ciemny) {
    return (
      <svg {...wspolne}>
        <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
      </svg>
    );
  }

  return (
    <svg {...wspolne}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}

export function PrzelacznikMotywu() {
  // Bierzemy motyw ZASTOSOWANY, nie zapisany wybór — przy „auto" tylko on mówi,
  // co użytkownik faktycznie widzi, a przełącznik ma odwracać właśnie to.
  const zastosowany = useAppliedTheme();
  const ciemny = zastosowany === 'dark';

  const opis = ciemny ? 'Motyw ciemny' : 'Motyw jasny';
  const doCzego = ciemny ? 'jasny' : 'ciemny';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setThemeChoice(ciemny ? 'light' : 'dark')}
      title={`${opis} — kliknij, żeby przejść na ${doCzego}`}
      aria-label={`${opis}. Kliknij, żeby przejść na ${doCzego}.`}
      aria-pressed={ciemny}
    >
      <Ikona ciemny={ciemny} />
    </button>
  );
}
