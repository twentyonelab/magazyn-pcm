/**
 * Konfiguracja belki naładowania — DWA MATERIAŁY, JEDEN KOMPONENT.
 *
 * Wszystko, co różni magazyn ciepła od magazynu chłodu, siedzi tutaj: progi
 * stref, kolory, kolejność stref na pasku, podpisy. Komponent nie wie, który
 * materiał rysuje — pyta config. Dzięki temu nie ma w nim ani jednego `if
 * (material === ...)`, a dodanie trzeciego materiału to wpis w tej tablicy.
 *
 * DLACZEGO TO NIE JEST W KONFIGURACJI SERWERA: serwer opisuje materiał
 * pomiarowo (skala, pasmo przemiany, ciepło utajone) i tego nie dublujemy —
 * `skalaMin`, `skalaMax` i `cieploUtajone` bierzemy z jego profilu. Tutaj leżą
 * wyłącznie rzeczy potrzebne DO RYSOWANIA i do modelu entalpii, o których
 * serwer nie musi wiedzieć.
 *
 * ROZBIEŻNOŚĆ DO ROZSTRZYGNIĘCIA: dla 57HC serwer podaje pasmo przemiany
 * 55–58 °C, a specyfikacja tej belki solidus 53 / liquidus 58. Belka używa
 * wartości ze specyfikacji (53), więc jej strefy różnią się od progu, którym
 * kolorowany jest schemat instalacji. Wyrównanie wymaga zmiany
 * `server/src/materials.config.ts` — czeka na decyzję.
 */

import type { PcmMaterial } from '@magazyn-pcm/shared';
import type { Kierunek } from '../../soc.js';

export type StanNaladowania = 'rozladowany' | 'przemiana' | 'naladowany';

interface KoloryChipu {
  tlo: string;
  tekst: string;
}

export interface KonfiguracjaMaterialu {
  kierunek: Kierunek;
  /** Początek i koniec przemiany — granice strefy środkowej na pasku. */
  solidus: number;
  liquidus: number;
  /** Ciepło przemiany użyte w modelu entalpii, kJ/kg. */
  cieploPrzemiany: number;
  /** Ciepło właściwe, kJ/(kg·K). */
  cp: number;
  /** Pojemność zbiornika w kWh — mianownik dla linii „Energia: x / y kWh". */
  pojemnoscKWh: number;
  /** Kolor krzywej entalpii i punktu pracy. */
  kolorKrzywej: string;
  /** Wypełnienia trzech stref paska. */
  kolorRozladowany: string;
  kolorNaladowany: string;
  /** Kreskowanie strefy przemiany. */
  hatchPrzemiany: string;
  /** Tło strefy przemiany na wykresie. */
  tloStrefyWykres: string;
  chip: Record<StanNaladowania, KoloryChipu>;
}

/** Kolory neutralne — te same dla obu materiałów. */
const CHIP_ROZLADOWANY: KoloryChipu = { tlo: '#F1EFE8', tekst: '#444441' };
const SZARY_ROZLADOWANY = '#D3D1C7';

export const KONFIGURACJA: Record<PcmMaterial, KonfiguracjaMaterialu> = {
  RT57HC: {
    kierunek: 'cieplo',
    solidus: 53,
    liquidus: 58,
    cieploPrzemiany: 170,
    cp: 2,
    // 200 l × ~0,85 kg/l × 240 kJ/kg = 40 800 kJ = 11,3 kWh
    pojemnoscKWh: 11.3,
    kolorKrzywej: '#D85A30',
    kolorRozladowany: SZARY_ROZLADOWANY,
    kolorNaladowany: '#F0997B',
    hatchPrzemiany: 'repeating-linear-gradient(45deg, #FAC775 0 4px, #FAEEDA 4px 8px)',
    tloStrefyWykres: '#FAEEDA',
    chip: {
      rozladowany: CHIP_ROZLADOWANY,
      przemiana: { tlo: '#FAEEDA', tekst: '#633806' },
      naladowany: { tlo: '#FAECE7', tekst: '#712B13' },
    },
  },

  RT8HC: {
    kierunek: 'chlod',
    solidus: 7,
    liquidus: 9,
    cieploPrzemiany: 150,
    cp: 2,
    pojemnoscKWh: 9.3,
    kolorKrzywej: '#378ADD',
    kolorRozladowany: SZARY_ROZLADOWANY,
    kolorNaladowany: '#85B7EB',
    hatchPrzemiany: 'repeating-linear-gradient(45deg, #B5D4F4 0 4px, #E6F1FB 4px 8px)',
    tloStrefyWykres: '#E6F1FB',
    // Przy chłodzie kolor koduje NAŁADOWANIE, nie temperaturę: zimno znaczy
    // naładowany, więc niebieski należy do stanu naładowanego i przemiany.
    chip: {
      rozladowany: CHIP_ROZLADOWANY,
      przemiana: { tlo: '#E6F1FB', tekst: '#0C447C' },
      naladowany: { tlo: '#E6F1FB', tekst: '#0C447C' },
    },
  },
};

/**
 * Stan naładowania z temperatury.
 *
 * Przy chłodzie progi są ODWRÓCONE: poniżej solidusu materiał jest zamrożony,
 * czyli naładowany. To jedyne miejsce, w którym ta odwrotność jest zapisana.
 */
export function stanZTemperatury(
  tempC: number,
  cfg: KonfiguracjaMaterialu,
): StanNaladowania {
  if (tempC < cfg.solidus) return cfg.kierunek === 'chlod' ? 'naladowany' : 'rozladowany';
  if (tempC <= cfg.liquidus) return 'przemiana';
  return cfg.kierunek === 'chlod' ? 'rozladowany' : 'naladowany';
}

/** Podpis stanu dla człowieka. */
export const OPIS_STANU: Record<StanNaladowania, string> = {
  rozladowany: 'Rozładowany',
  przemiana: 'Przemiana fazowa',
  naladowany: 'Naładowany',
};

/**
 * Kolejność stref na pasku, od lewej do prawej.
 *
 * Pasek jest osią temperatury, a nie osią naładowania — więc dla chłodu strefa
 * naładowana leży po LEWEJ (zimny koniec). Zwracamy nazwy stanów, a nie kolory,
 * żeby kolory zostały w jednym miejscu.
 */
export function strefyOdLewej(cfg: KonfiguracjaMaterialu): StanNaladowania[] {
  return cfg.kierunek === 'chlod'
    ? ['naladowany', 'przemiana', 'rozladowany']
    : ['rozladowany', 'przemiana', 'naladowany'];
}

/** Wypełnienie CSS dla danej strefy paska. */
export function wypelnienieStrefy(
  stan: StanNaladowania,
  cfg: KonfiguracjaMaterialu,
): string {
  if (stan === 'przemiana') return cfg.hatchPrzemiany;
  return stan === 'naladowany' ? cfg.kolorNaladowany : cfg.kolorRozladowany;
}
