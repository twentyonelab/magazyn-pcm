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
  // STALOWY, nie lodowy blekit. Nasycony #378ADD wygladal jak kolor
  // interfejsu aplikacji, nie jak barwa nosnika — i po wejsciu w magazyn chlodu
  // caly ekran robil sie jaskrawo niebieski. Stalowa szarosc z niebieskim
  // podtonem czyta sie jako 'chlod', a nie jako 'link'.
  chlod: {
    glowny: '#4D7A91',
    jasny: '#8FB0C0',
    tlo: '#E8EEF1',
    ciemny: '#1F3D4D',
  },
};

/**
 * BARWA NOŚNIKA DLA POŁOŻENIA NA SKALI (0..1) — do znaczników na mapie.
 *
 * Pinezka musi robić dwie rzeczy naraz: pasować do kolorystyki widoku
 * (pomarańcze przy cieple, stal przy chłodzie) i mówić, jak gorąco jest
 * w środku. Paleta temperatur A2 jest pastelowa i celowo obca wobec barw
 * interfejsu — na mapie odstawała, bo mapa jest szara, a pinezki są jedynym
 * kolorem na niej. Dlatego tutaj skala idzie po WŁASNEJ rodzinie nośnika:
 * od jasnego przez podstawowy do ciemnego.
 *
 * Kierunek intensywności jest ten sam co na pasku: mocniejsza barwa znaczy
 * więcej zgromadzonej energii. Przy cieple rośnie z temperaturą, przy chłodzie
 * maleje — dlatego wywołujący podaje POŁOŻENIE NA SKALI MATERIAŁU, a nie
 * same stopnie.
 */
export function barwaNosnika(kierunek: Kierunek, pozycja: number): string {
  const paleta = PALETA[kierunek];
  const t = Math.min(1, Math.max(0, pozycja));
  // Trzy przystanki, więc dwa odcinki po 0,5.
  const [od, doKoloru, lokalne] =
    t < 0.5
      ? [paleta.jasny, paleta.glowny, t / 0.5]
      : [paleta.glowny, paleta.ciemny, (t - 0.5) / 0.5];

  const rgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = rgb(od);
  const [br, bg, bb] = rgb(doKoloru);
  const k = (x: number, y: number): number => Math.round(x + (y - x) * lokalne);
  return `rgb(${k(ar, br)} ${k(ag, bg)} ${k(ab, bb)})`;
}

/** Podpis rodzaju magazynu dla człowieka. */
export const OPIS_KIERUNKU: Record<Kierunek, string> = {
  cieplo: 'ciepło',
  chlod: 'chłód',
};
