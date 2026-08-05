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
import { PALETA } from '../../kolory-magazynu.js';

export type StanNaladowania = 'rozladowany' | 'przemiana' | 'naladowany';

interface KoloryChipu {
  tlo: string;
  tekst: string;
}

export interface KonfiguracjaMaterialu {
  kierunek: Kierunek;
  /**
   * Początek i koniec przemiany — granice strefy środkowej na pasku.
   *
   * DUBLUJĄ `phaseBandMin`/`phaseBandMax` z profilu materiału i dziś obie pary
   * mają te same wartości (8HC 7–9, 57HC 53–58, zgodnie z kartami Rubitherm).
   * To jednak ten sam rodzaj pułapki co ciepło przemiany niżej: dwa zapisy
   * jednej liczby rozjadą się przy pierwszej poprawce zrobionej w jednym
   * miejscu. Do przeniesienia na profil przy najbliższej okazji.
   */
  solidus: number;
  liquidus: number;

  /*
   * CIEPŁA PRZEMIANY I CIEPŁA WŁAŚCIWEGO TU NIE MA — usunięte 2026-08-04.
   *
   * Stały tu `cieploPrzemiany` (150 dla 8HC, 170 dla 57HC) i `cp`, a drugi
   * zapis tych samych wielkości siedział w profilu materiału z serwera.
   * Skutek: pinezka na mapie liczyła naładowanie z profilu, a belka i pasek
   * pod zbiornikiem z tego pliku — przy tej samej średniej 8,5 °C wychodziło
   * 29 % i 31 %. Dwie liczby opisujące to samo na jednym ekranie.
   *
   * Oba parametry idą teraz WYŁĄCZNIE z `MaterialProfile` (`/api/materials`),
   * wyliczone z kart Rubitherm — patrz `server/src/materials.config.ts`.
   */
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
    // JEDEN MODUŁ 67 l (nie 200 — patrz MASA_KG w materials.config serwera):
    // 57 kg × 240 kJ/kg = 13 680 kJ = 3,8 kWh. 240 kJ/kg to POJEMNOŚĆ Z KARTY
    // (latent + jawne, 49–64 °C) — mianownik ma opisywać energię użytkową
    // w oknie pracy, nie samą przemianę. Gęstość 0,85 = średnia z karty.
    // Ta liczba jest TYLKO ZAPASEM: gdy serwer poda bilans (health.soc),
    // belka bierze pojemność stamtąd.
    pojemnoscKWh: 3.8,
    kolorKrzywej: PALETA.cieplo.glowny,
    kolorRozladowany: SZARY_ROZLADOWANY,
    kolorNaladowany: PALETA.cieplo.jasny,
    // SZTRYCH PRZEZROCZYSTY MIEDZY KRESKAMI. Wczesniej miedzy kreskami stalo
    // pelne tlo i pasmo przemiany zakrywalo podzialke temperatury pod soba —
    // a paleta A2 wymaga, zeby pasmo bylo OZNACZENIEM, nie wypelnieniem.
    hatchPrzemiany: 'repeating-linear-gradient(45deg, rgba(28,28,27,.34) 0 1.5px, transparent 1.5px 6px)',
    tloStrefyWykres: PALETA.cieplo.tlo,
    chip: {
      rozladowany: CHIP_ROZLADOWANY,
      przemiana: { tlo: PALETA.cieplo.tlo, tekst: '#633806' },
      naladowany: { tlo: '#FAECE7', tekst: PALETA.cieplo.ciemny },
    },
  },

  RT8HC: {
    kierunek: 'chlod',
    solidus: 7,
    liquidus: 9,
    // JEDEN MODUŁ 67 l: 59 kg × 190 kJ/kg (pojemność z karty, 1–15 °C)
    // = 11 210 kJ = 3,1 kWh. Gęstość ciała stałego (0,88 przy 0 °C), bo
    // magazyn chłodu naładowany to magazyn zamrożony. Zapas na wypadek braku
    // bilansu z serwera — patrz komentarz przy 57HC wyżej.
    pojemnoscKWh: 3.1,
    kolorKrzywej: PALETA.chlod.glowny,
    kolorRozladowany: SZARY_ROZLADOWANY,
    kolorNaladowany: PALETA.chlod.jasny,
    hatchPrzemiany: 'repeating-linear-gradient(45deg, rgba(28,28,27,.34) 0 1.5px, transparent 1.5px 6px)',
    tloStrefyWykres: PALETA.chlod.tlo,
    // Przy chłodzie kolor koduje NAŁADOWANIE, nie temperaturę: zimno znaczy
    // naładowany, więc niebieski należy do stanu naładowanego i przemiany.
    chip: {
      rozladowany: CHIP_ROZLADOWANY,
      przemiana: { tlo: PALETA.chlod.tlo, tekst: PALETA.chlod.ciemny },
      naladowany: { tlo: PALETA.chlod.tlo, tekst: PALETA.chlod.ciemny },
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
