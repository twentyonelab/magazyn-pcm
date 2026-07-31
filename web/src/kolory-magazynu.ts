/**
 * KOLORY CIEPŁA I CHŁODU — jedno źródło dla całego interfejsu.
 *
 * Kolor koduje RODZAJ MAGAZYNU, nie temperaturę. Pomarańcz znaczy „magazyn
 * ciepła", lodowy błękit — „magazyn chłodu", i to samo znaczy na pinezce mapy,
 * na pasku naładowania, na krzywej entalpii i w podpisie lokalizacji. Gdyby
 * każdy widok trzymał własne odcienie, ta sama instalacja miałaby na dwóch
 * ekranach dwa różne kolory — a wtedy kolor przestaje być informacją.
 *
 * Te same wartości są też wystawione jako zmienne CSS (`--cieplo`, `--chlod`
 * i pochodne w styles.css), bo część elementów barwi arkusz stylów, a część
 * kod. Zmiana odcienia wymaga tknięcia obu miejsc — i dlatego jedno stoi tuż
 * obok drugiego w komentarzu, żeby nie dało się zapomnieć.
 */

import type { Kierunek } from './soc.js';

export interface PaletaMagazynu {
  /** Podstawowy — krzywa, obrys pinezki, podpis lokalizacji. */
  glowny: string;
  /** Rozjaśniony — wypełnienie strefy naładowanej, wypełnienie pinezki. */
  jasny: string;
  /** Bardzo jasny — tło strefy przemiany, tło chipu. */
  tlo: string;
  /** Ciemny — tekst na jasnym tle chipu. */
  ciemny: string;
}

export const PALETA: Record<Kierunek, PaletaMagazynu> = {
  cieplo: {
    glowny: '#D85A30',
    jasny: '#F0997B',
    tlo: '#FAEEDA',
    ciemny: '#712B13',
  },
  chlod: {
    glowny: '#378ADD',
    jasny: '#85B7EB',
    tlo: '#E6F1FB',
    ciemny: '#0C447C',
  },
};

/** Podpis rodzaju magazynu dla człowieka. */
export const OPIS_KIERUNKU: Record<Kierunek, string> = {
  cieplo: 'ciepło',
  chlod: 'chłód',
};
