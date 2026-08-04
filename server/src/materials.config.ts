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
/*
 * WSZYSTKIE LICZBY PONIZEJ POCHODZA Z KART MATERIALU RUBITHERM.
 * Sprawdzone 2026-08-04 wprost w dokumentach dostarczonych przez uzytkownika:
 *
 *   Techdata_-RT8HC_EN_11032024.pdf
 *     Melting area              7–9 °C,  main peak 8 °C
 *     Congealing area           8–7 °C,  main peak 8 °C
 *     Heat storage capacity     190 kJ/kg (53 Wh/kg) ±7,5 %
 *                               „combination of latent and sensible heat
 *                                in a temperatur range of 1 °C to 15 °C"
 *     Specific heat capacity    2 kJ/(kg·K)
 *     Density solid / liquid    0,88 kg/l (0 °C) / 0,77 kg/l (15 °C)
 *     Max. operation temp.      40 °C
 *
 *   Techdata_ RT57HC_EN_21012026.pdf
 *     Melting area              55–58 °C, main peak 57 °C
 *     Congealing area           53–57 °C, main peak 57 °C
 *     Heat storage capacity     240 kJ/kg (67 Wh/kg) ±7,5 %
 *                               w przedziale 49 °C … 64 °C
 *     Specific heat capacity    2 kJ/(kg·K)
 *     Density solid / liquid    ~0,9 kg/l (20 °C) / ~0,8 kg/l (60 °C)
 *     Max. operation temp.      90 °C
 *
 * CIEPLO UTAJONE NIE STOI W KARCIE WPROST i to jest tu najwazniejsze.
 * Wiersz „Heat storage capacity" obejmuje cieplo utajone RAZEM z jawnym
 * w podanym przedziale, wiec do modelu entalpii trzeba je rozdzielic:
 *
 *   8HC:  190 − 2 × (15 − 1)  = 190 − 28 = 162 kJ/kg
 *   57HC: 240 − 2 × (64 − 49) = 240 − 30 = 210 kJ/kg
 *
 * Wczesniej do modelu wchodzila cala pojemnosc (190 / 240), a `soc.ts` dokladal
 * cieplo jawne osobno — czyli bylo ono liczone dwa razy.
 */
export const MATERIALS: Record<PcmMaterial, MaterialProfile> = {
  RT8HC: {
    id: 'RT8HC',
    label: '8HC',
    scaleMin: 0,
    scaleMax: 20,
    // Karta: topnienie 7–9, krzepniecie 8–7. Suma obu kierunkow to 7–9.
    phaseBandMin: 7,
    phaseBandMax: 9,
    peak: 8,
    // 190 − 2 × (15 − 1) = 162. Patrz wyliczenie w komentarzu wyzej.
    latentHeat: 162,
    capacityKJkg: 190,
    capacityFromC: 1,
    capacityToC: 15,
    cp: 2,
    tMax: 40,
  },
  RT57HC: {
    id: 'RT57HC',
    label: '57HC',
    scaleMin: 40,
    scaleMax: 75,
    // PASMO OBEJMUJE OBA KIERUNKI PRZEMIANY, nie tylko topnienie.
    // Karta: topnienie 55–58, krzepniecie 53–57. Suma to 53–58, wiec dolna
    // granica jest solidusem 53, a nie 55. Bylo tu 55 i to sie nie zgadzalo
    // z belka naladowania, ktora od poczatku liczy solidus 53 — punkt pracy
    // przy 54 °C wychodzil „poza przemiana" na schemacie i „w przemianie"
    // na belce. Karta materialu to potwierdza.
    phaseBandMin: 53,
    phaseBandMax: 58,
    peak: 57,
    // 240 − 2 × (64 − 49) = 210. Patrz wyliczenie w komentarzu wyzej.
    latentHeat: 210,
    capacityKJkg: 240,
    capacityFromC: 49,
    capacityToC: 64,
    cp: 2,
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
