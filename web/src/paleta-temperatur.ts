/**
 * PALETA TEMPERATUR — Entalvia A2.
 *
 * Jedyne miejsce, w którym barwa temperatury jest zapisana. Pełna
 * specyfikacja z uzasadnieniem i rozstrzygnięciami leży w
 * `docs/PALETA-TEMPERATUR.md` — tutaj są same liczby i przeliczanie.
 *
 * DWIE SKALE, JEDNA ZASADA WYBORU. Paleta globalna (0–70 °C) jest pastelowa
 * i ma niską rozdzielczość barwną: przy danych rozrzuconych na 1,5 K —
 * a tak wygląda zbiornik PCM w plateau — wszystkie sondy wychodzą tym samym
 * odcieniem. Dlatego przy rozpiętości poniżej 15 K wchodzi skala LOKALNA,
 * nasycona, zawężona do strefy przemiany. Rozciąganie globalnej palety na
 * wąski zakres jest wprost zabronione (zasada 4), bo dawałoby barwy, których
 * w tej palecie nie ma.
 *
 * KOLOR ZNACZY TEMPERATURĘ, NIGDY NAŁADOWANIE (zasada 1). Podczas przemiany
 * fazowej temperatura stoi godzinami i barwa też ma stać — jeśli się rusza,
 * to znaczy, że koduje coś innego, niż mówi. Naładowanie idzie osobnym
 * kanałem: słupkiem, pierścieniem albo liczbą.
 */

/** Przystanek skali: temperatura w °C i barwa. */
interface Przystanek {
  st: number;
  hex: string;
}

/** Skala globalna, 0–70 °C. Interpolacja liniowa między przystankami. */
const GLOBALNA: Przystanek[] = [
  { st: 0, hex: '#3E5F8C' },
  { st: 8, hex: '#6E8FBA' },
  { st: 20, hex: '#A9BFD4' },
  { st: 30, hex: '#D8DEE2' },
  { st: 36, hex: '#E9E4DC' },
  { st: 45, hex: '#EFD2B4' },
  { st: 55, hex: '#EBB184' },
  { st: 63, hex: '#DC8F5C' },
  { st: 70, hex: '#B96A3E' },
];

/** Poza zakresem skali globalnej barwa się ZATRZYMUJE na tych wartościach. */
const PONIZEJ_GLOBALNEJ = '#2A4266';
const POWYZEJ_GLOBALNEJ = '#8C4B29';

/**
 * Skale lokalne — zoom na strefę przemiany, pełne nasycenie.
 * Przystanki rozłożone równomiernie między `min` i `max`.
 */
const LOKALNA_CHLOD = {
  min: 5,
  max: 12,
  hex: ['#16406E', '#2E6BA8', '#5A97CC', '#93BDDC', '#C8DAE7'],
};

const LOKALNA_CIEPLO = {
  min: 50,
  max: 62,
  hex: ['#9A4517', '#C4652A', '#E28A45', '#EFB57E', '#F5DCC0'],
};

/** Progi z zasady 4 i z rozstrzygnięcia o środku zakresu. */
const PROG_ROZPIETOSCI_K = 15;
const GRANICA_CHLOD_CIEPLO_C = 30;

/** Tusz na tle palety (zasada 3). Nigdy czysta czerń ani biel. */
const TUSZ_CIEMNY = '#1C1C1B';
const TUSZ_JASNY = '#F2EFEA';

export type RodzajSkali = 'globalna' | 'lokalna-chlod' | 'lokalna-cieplo';

/* --- Przeliczanie barw ---------------------------------------------------- */

function hexNaRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function mieszaj(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexNaRgb(a);
  const [br, bg, bb] = hexNaRgb(b);
  const k = (x: number, y: number): number => Math.round(x + (y - x) * t);
  return `rgb(${k(ar, br)} ${k(ag, bg)} ${k(ab, bb)})`;
}

/** Barwa z listy przystanków opisanych temperaturą. */
function zPrzystankow(stopnie: number, lista: Przystanek[], ponizej: string, powyzej: string): string {
  const pierwszy = lista[0]!;
  const ostatni = lista[lista.length - 1]!;
  if (stopnie < pierwszy.st) return ponizej;
  if (stopnie > ostatni.st) return powyzej;

  for (let i = 0; i < lista.length - 1; i += 1) {
    const od = lista[i]!;
    const do_ = lista[i + 1]!;
    if (stopnie > do_.st) continue;
    const rozpietosc = do_.st - od.st;
    return mieszaj(od.hex, do_.hex, rozpietosc === 0 ? 0 : (stopnie - od.st) / rozpietosc);
  }

  return ostatni.hex;
}

/** Barwa ze skali lokalnej. Poza zakresem zatrzymuje się na skrajnym przystanku. */
function zeSkaliLokalnej(
  stopnie: number,
  skala: { min: number; max: number; hex: string[] },
): string {
  const krok = (skala.max - skala.min) / (skala.hex.length - 1);
  const przystanki: Przystanek[] = skala.hex.map((hex, i) => ({
    st: skala.min + i * krok,
    hex,
  }));
  return zPrzystankow(stopnie, przystanki, skala.hex[0]!, skala.hex[skala.hex.length - 1]!);
}

/* --- Wybór skali --------------------------------------------------------- */

/**
 * Która skala dla tego zestawu odczytów.
 *
 * Bierze WSZYSTKIE wartości pokazywane razem na jednym ekranie, nie każdą
 * osobno: sondy tego samego zbiornika muszą leżeć na jednej skali, inaczej
 * porównanie ich barw nie znaczy nic. Puste wejście daje skalę globalną —
 * przy braku danych nie ma czego zawężać.
 */
export function wybierzSkale(wartosci: Array<number | null | undefined>): RodzajSkali {
  const liczby = wartosci.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (liczby.length === 0) return 'globalna';

  const min = Math.min(...liczby);
  const max = Math.max(...liczby);
  if (max - min >= PROG_ROZPIETOSCI_K) return 'globalna';

  const srodek = (min + max) / 2;
  return srodek < GRANICA_CHLOD_CIEPLO_C ? 'lokalna-chlod' : 'lokalna-cieplo';
}

/** Zakres, jaki obejmuje dana skala — do podpisania podziałki. */
export function zakresSkali(rodzaj: RodzajSkali): { min: number; max: number } {
  if (rodzaj === 'lokalna-chlod') return { min: LOKALNA_CHLOD.min, max: LOKALNA_CHLOD.max };
  if (rodzaj === 'lokalna-cieplo') return { min: LOKALNA_CIEPLO.min, max: LOKALNA_CIEPLO.max };
  return { min: GLOBALNA[0]!.st, max: GLOBALNA[GLOBALNA.length - 1]!.st };
}

/* --- Wejście dla widoków ------------------------------------------------- */

/** Barwa dla temperatury w stopniach Celsjusza. */
export function barwaTemperatury(stopnie: number, rodzaj: RodzajSkali = 'globalna'): string {
  if (rodzaj === 'lokalna-chlod') return zeSkaliLokalnej(stopnie, LOKALNA_CHLOD);
  if (rodzaj === 'lokalna-cieplo') return zeSkaliLokalnej(stopnie, LOKALNA_CIEPLO);
  return zPrzystankow(stopnie, GLOBALNA, PONIZEJ_GLOBALNEJ, POWYZEJ_GLOBALNEJ);
}

/**
 * Tusz czytelny na tle tej temperatury (zasada 3).
 *
 * Próg liczy się w STOPNIACH, nie w barwie: to samo 8 °C ma ten sam tusz
 * niezależnie od tego, czy trafiło na skalę globalną, czy lokalną.
 */
export function tuszNaTemperaturze(stopnie: number): string {
  return stopnie <= 8 || stopnie > 63 ? TUSZ_JASNY : TUSZ_CIEMNY;
}

/**
 * Przystanki do gradientu CSS/SVG — dla podziałek i legend.
 * Zwraca pozycje w procentach szerokości podanego zakresu.
 */
export function przystankiGradientu(
  rodzaj: RodzajSkali,
  zakres: { min: number; max: number } = zakresSkali(rodzaj),
): Array<{ procent: number; barwa: string }> {
  const rozpietosc = zakres.max - zakres.min;
  if (rozpietosc <= 0) return [{ procent: 0, barwa: barwaTemperatury(zakres.min, rodzaj) }];

  // Co 2 °C wystarcza: paleta jest odcinkowo liniowa, a przy tej gęstości
  // przejścia nie widać schodków nawet na pełnej szerokości ekranu.
  const kroki: Array<{ procent: number; barwa: string }> = [];
  for (let st = zakres.min; st <= zakres.max + 0.001; st += 2) {
    kroki.push({
      procent: ((st - zakres.min) / rozpietosc) * 100,
      barwa: barwaTemperatury(st, rodzaj),
    });
  }
  return kroki;
}
