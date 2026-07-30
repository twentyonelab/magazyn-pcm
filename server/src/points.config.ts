/**
 * REJESTR PUNKTOW POMIAROWYCH — jedno zrodlo prawdy dla calej aplikacji.
 *
 * To jedyne miejsce, w ktorym identyfikator logiczny (np. "A1") spotyka sie
 * z UUID-em z Loxone. Zmiana nazwy kontrolki w Loxone Config dotyka wylacznie
 * tego pliku.
 *
 * JAK UZUPELNIC UUID-Y:
 *   1. Podlacz sie do sieci laboratorium.
 *   2. Uruchom:  npm run uuid
 *   3. Skrypt wypisze kontrolki i sam dopasuje sondy do pozycji i zestawow.
 *   4. Zatwierdz zapis:  npm run uuid -- --zapisz
 *
 * DWA ZESTAWY SOND (wymienne zbiorniki):
 * Kazda pozycja pomiarowa ma DWA UUID-y — po jednym na zbiornik. Zestaw jest
 * tozsamy z parafina, bo kazdy zbiornik jest napelniony innym materialem
 * (sondy nazwane w Loxone jako 1A_57HC i 1A_8HC). Identyfikator punktu (A1)
 * jest WSPOLNY dla obu zbiornikow, bo to ta sama pozycja pomiarowa — z ktorego
 * zbiornika pochodzi odczyt, zapisuje sie osobno w historii.
 *
 * UWAGA: pola `id` NIE WOLNO zmieniac po rozpoczeciu zbierania danych —
 * historia pomiarow jest do nich przypisana na zawsze.
 */

import type { PointDef } from '@magazyn-pcm/shared';

export const POINTS: readonly PointDef[] = [
  // -------------------------------------------------------------------------
  // Magazyn PCM — 6 sond Loxone 200077 (DS18B20) zanurzonych w materiale.
  // Siatka: dwie przekatne A i B, po trzy poziomy.
  //
  // POTWIERDZONE 2026-07-29 (Krzysztof): poziom 1 = dol zbiornika,
  // 2 = srodek, 3 = gora. Na kazdym poziomie A i B to sondy na dwoch
  // roznych przekatnych zbiornika. To zamyka otwarte pytanie nr 1 ze
  // specyfikacji — historia pomiarow jest do tego przypisania przywiazana,
  // wiec pol `level` i `diagonal` nie zmieniamy bez powodu.
  // -------------------------------------------------------------------------
  {
    id: 'A1',
    uuid: null,
    // Po jednym UUID na zbiornik. Wypelnia `npm run uuid -- --zapisz`.
    uuidByBank: { RT57HC: null, RT8HC: null },
    label: 'Magazyn · przekątna A · poziom 1',
    unit: '°C',
    kind: 'temperature',
    group: 'pcm',
    precision: 1,
    geometry: { diagonal: 'A', level: 1 },
    available: true,
  },
  {
    id: 'A2',
    uuid: null,
    // Po jednym UUID na zbiornik. Wypelnia `npm run uuid -- --zapisz`.
    uuidByBank: { RT57HC: null, RT8HC: null },
    label: 'Magazyn · przekątna A · poziom 2',
    unit: '°C',
    kind: 'temperature',
    group: 'pcm',
    precision: 1,
    geometry: { diagonal: 'A', level: 2 },
    available: true,
  },
  {
    id: 'A3',
    uuid: null,
    // Po jednym UUID na zbiornik. Wypelnia `npm run uuid -- --zapisz`.
    uuidByBank: { RT57HC: null, RT8HC: null },
    label: 'Magazyn · przekątna A · poziom 3',
    unit: '°C',
    kind: 'temperature',
    group: 'pcm',
    precision: 1,
    geometry: { diagonal: 'A', level: 3 },
    available: true,
  },
  {
    id: 'B1',
    uuid: null,
    // Po jednym UUID na zbiornik. Wypelnia `npm run uuid -- --zapisz`.
    uuidByBank: { RT57HC: null, RT8HC: null },
    label: 'Magazyn · przekątna B · poziom 1',
    unit: '°C',
    kind: 'temperature',
    group: 'pcm',
    precision: 1,
    geometry: { diagonal: 'B', level: 1 },
    available: true,
  },
  {
    id: 'B2',
    uuid: null,
    // Po jednym UUID na zbiornik. Wypelnia `npm run uuid -- --zapisz`.
    uuidByBank: { RT57HC: null, RT8HC: null },
    label: 'Magazyn · przekątna B · poziom 2',
    unit: '°C',
    kind: 'temperature',
    group: 'pcm',
    precision: 1,
    geometry: { diagonal: 'B', level: 2 },
    available: true,
  },
  {
    id: 'B3',
    uuid: null,
    // Po jednym UUID na zbiornik. Wypelnia `npm run uuid -- --zapisz`.
    uuidByBank: { RT57HC: null, RT8HC: null },
    label: 'Magazyn · przekątna B · poziom 3',
    unit: '°C',
    kind: 'temperature',
    group: 'pcm',
    precision: 1,
    geometry: { diagonal: 'B', level: 3 },
    available: true,
  },

  // -------------------------------------------------------------------------
  // Cieplomierz AXIOMA QALCOSONIC E4 (Modbus RTU).
  //
  // available: false — brakuje mapy rejestrow Modbus
  // ("Modbus RTU Slave Module for Qalcosonic E3/E4"). Bez niej adresy
  // rejestrow sa nieznane.
  //
  // Pamietaj tez: na samej baterii licznik udostepnia Modbusa tylko 80 s
  // na godzine. Musi byc zasilony zewnetrznie z 24 VDC.
  // -------------------------------------------------------------------------
  {
    id: 'METER_FLOW',
    uuid: null,
    label: 'Ciepłomierz · przepływ',
    unit: 'm³/h',
    kind: 'flow',
    group: 'meter',
    precision: 3,
    available: false,
  },
  {
    id: 'METER_POWER',
    uuid: null,
    label: 'Ciepłomierz · moc',
    unit: 'kW',
    kind: 'power',
    group: 'meter',
    precision: 2,
    available: false,
  },
  {
    id: 'METER_ENERGY',
    uuid: null,
    label: 'Ciepłomierz · energia',
    unit: 'kWh',
    kind: 'energy',
    group: 'meter',
    precision: 2,
    available: false,
  },
  {
    id: 'METER_T1',
    uuid: null,
    label: 'Ciepłomierz · zasilanie',
    unit: '°C',
    kind: 'temperature',
    group: 'meter',
    precision: 1,
    available: false,
  },
  {
    id: 'METER_T2',
    uuid: null,
    label: 'Ciepłomierz · powrót',
    unit: '°C',
    kind: 'temperature',
    group: 'meter',
    precision: 1,
    available: false,
  },
  {
    // Ponizej 3 K licznik nie sumuje energii i zglasza kod bledu 4.
    id: 'METER_DT',
    uuid: null,
    label: 'Ciepłomierz · ΔT',
    unit: 'K',
    kind: 'delta',
    group: 'meter',
    precision: 2,
    available: false,
  },

  // -------------------------------------------------------------------------
  // Bufor
  // -------------------------------------------------------------------------
  {
    id: 'BUFFER_TOP',
    uuid: null,
    label: 'Bufor · góra',
    unit: '°C',
    kind: 'temperature',
    group: 'buffer',
    precision: 1,
    available: false,
  },
  {
    id: 'BUFFER_BOTTOM',
    uuid: null,
    label: 'Bufor · dół',
    unit: '°C',
    kind: 'temperature',
    group: 'buffer',
    precision: 1,
    available: false,
  },

  // -------------------------------------------------------------------------
  // Stany binarne
  // -------------------------------------------------------------------------
  {
    id: 'HP_STATE',
    uuid: null,
    label: 'Pompa ciepła · praca',
    unit: '',
    kind: 'state',
    group: 'heatpump',
    precision: 0,
    available: false,
  },
  {
    id: 'PUMP_STATE',
    uuid: null,
    label: 'Pompa obiegowa · praca',
    unit: '',
    kind: 'state',
    group: 'actuator',
    precision: 0,
    available: false,
  },
  {
    // Zawor AFRISO BEV 222 jest ODCINAJACY, nie regulacyjny —
    // reprezentujemy go jako stan binarny, nigdy jako element modulowany.
    id: 'VALVE_STATE',
    uuid: null,
    label: 'Zawór AFRISO · otwarty',
    unit: '',
    kind: 'state',
    group: 'actuator',
    precision: 0,
    available: false,
  },

  // -------------------------------------------------------------------------
  // Otoczenie
  // -------------------------------------------------------------------------
  {
    id: 'AMBIENT_HALL',
    uuid: null,
    label: 'Hala · powietrze',
    unit: '°C',
    kind: 'temperature',
    group: 'ambient',
    precision: 1,
    available: false,
  },
];
