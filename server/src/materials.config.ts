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

export const MATERIALS: Record<PcmMaterial, MaterialProfile> = {
  RT8HC: {
    id: 'RT8HC',
    label: 'Rubitherm RT8HC',
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
    label: 'Rubitherm RT57HC',
    scaleMin: 40,
    scaleMax: 75,
    phaseBandMin: 55,
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
