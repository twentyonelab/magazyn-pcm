/**
 * Profile materialow PCM — konfiguracja, nie stale w kodzie widoku.
 *
 * Zakres skali barwnej jest tu najwazniejszy. Plateau przemiany RT8HC ma
 * szerokosc 2 K: przy skali 0-100 stopni cala przemiana fazowa bylaby jednym
 * odcieniem, co zniweczyloby sens calej wizualizacji.
 *
 * Material jest atrybutem SESJI BADAWCZEJ, nie punktu pomiarowego.
 */

import type { MaterialProfile, PcmMaterial } from '@magazyn-pcm/shared';

/**
 * NAZEWNICTWO: identyfikatory (RT8HC / RT57HC) sa kluczami w danych — siedza
 * w zapisanych sesjach i nie zmieniamy ich, dokladnie tak jak identyfikatorow
 * punktow. Do CZLOWIEKA mowi wylacznie pole `label`, a tam nazwa producenta
 * sie nie pojawia: na ekranie i w raportach widac "8HC" i "57HC".
 */
export const MATERIALS: Record<PcmMaterial, MaterialProfile> = {
  RT8HC: {
    id: 'RT8HC',
    label: '8HC',
    scaleMin: 0,
    scaleMax: 20,
    phaseBandMin: 7,
    phaseBandMax: 9,
    peak: 8,
    latentHeat: 190,
    tMax: 40,
  },
  RT57HC: {
    id: 'RT57HC',
    label: '57HC',
    scaleMin: 40,
    scaleMax: 75,
    // PASMO OBEJMUJE OBA KIERUNKI PRZEMIANY, nie tylko topnienie.
    // Specyfikacja palety (docs/PALETA-TEMPERATUR.md): krzepniecie 57→53,
    // topnienie 55→58. Suma to 53–58, wiec dolna granica jest solidusem 53,
    // a nie 55. Bylo tu 55 i to sie nie zgadzalo z belka naladowania, ktora
    // od poczatku liczy solidus 53 — punkt pracy przy 54 °C wychodzil
    // „poza przemiana" na schemacie i „w przemianie" na belce.
    phaseBandMin: 53,
    phaseBandMax: 58,
    peak: 57,
    latentHeat: 240,
    tMax: 90,
  },
};

/**
 * Material uzywany przez zrodlo syntetyczne (mock) i jako podpowiedz przy
 * zakladaniu nowej sesji badawczej.
 */
export const DEFAULT_MATERIAL: PcmMaterial = 'RT8HC';

/**
 * Objetosci zbiornikow — wartosci konfiguracyjne, nie zapisane na stale.
 * Rysunek instalacji wymienia zasobnik 200 l, opis mowi o buforze 80 l
 * (otwarte pytanie nr 2 w specyfikacji).
 */
export const VOLUMES_L = {
  buffer: 80,
  storage: 200,
} as const;

/**
 * Przeplyw, przy ktorym animacja przeplywu na schemacie osiaga pelna predkosc.
 * Ciepłomierz ma qp 2,5 m3/h, a realne przeplywy sa rzedu 0,5 m3/h —
 * skalujemy wiec do wartosci roboczej, nie do maksimum przyrzadu.
 */
export const FLOW_FULL_SPEED_M3H = 0.8;
