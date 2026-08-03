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
  //
  // WYMIANA SOND 2026-08-03: stare sondy zostaly USUNIETE z Loxone Config,
  // a w ich miejsce doszlo szesc nowych, o innych adresach 1-Wire, wpietych
  // do DRUGIEGO ZBIORNIKA (8HC). Nowe UUID-y wpisal `npm run uuid --zapisz`
  // na podstawie nazw 1A_8HC … 3B_8HC.
  //
  // Wpisy RT57HC sa wyzerowane SWIADOMIE: tamte kontrolki nie istnieja juz
  // w Miniserverze (sprawdzone w LoxAPP3.json — zero nazw z „57HC"), wiec
  // odpytywanie ich byloby strzelaniem w puste UUID-y przy kazdym cyklu
  // rozpoznawania zbiornika. Gdy zbiornik 57HC wroci, jego sondy dostana
  // nowe UUID-y i trzeba bedzie ponownie uruchomic `npm run uuid --zapisz`.
  // -------------------------------------------------------------------------
  {
    id: 'A1',
    uuid: null,
    // Po jednym UUID na zbiornik. Wypelnia `npm run uuid -- --zapisz`.
    uuidByBank: { RT57HC: null, RT8HC: '2114477d-0152-77ea-ffff86611eeca57b' },
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
    uuidByBank: { RT57HC: null, RT8HC: '2114477d-0151-77e2-ffff86611eeca57b' },
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
    uuidByBank: { RT57HC: null, RT8HC: '2114477d-0153-77fa-ffff86611eeca57b' },
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
    uuidByBank: { RT57HC: null, RT8HC: '2114477d-0153-7802-ffff86611eeca57b' },
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
    uuidByBank: { RT57HC: null, RT8HC: '2114477d-014e-77d7-ffff86611eeca57b' },
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
    uuidByBank: { RT57HC: null, RT8HC: '2114477d-0152-77f2-ffff86611eeca57b' },
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
  // PODLACZONY 2026-07-30. Modbus czyta Miniserver, ktory wystawia odczyty
  // jako kontrolki InfoOnlyAnalog o nazwach ZRODLO_*. Znaczy to, ze mapy
  // rejestrow Modbus NIE POTRZEBUJEMY — po naszej stronie to zwykle punkty
  // jak sondy temperatury. Cala wiedza o rejestrach siedzi w Loxone Config.
  //
  // Jednostki bierzemy z formatow zadeklarowanych w Loxone (%.3f m³/h,
  // %.2f kW, %.1f °C, %.2f K), a nie z domyslow — inaczej podpisalibysmy os
  // wykresu czyms, czego licznik nie mierzy.
  //
  // Pamietaj: na samej baterii licznik udostepnia Modbusa tylko 80 s
  // na godzine. Musi byc zasilony zewnetrznie z 24 VDC.
  // -------------------------------------------------------------------------
  {
    id: 'METER_FLOW',
    // UUID-y ciepłomierza zrodla przestawione 2026-08-03: przy przebudowie
    // konfiguracji Loxone caly blok „Cieplomierz_zrodlo" powstal od nowa
    // (stare 210f77xx nalezą dzis do ciepłomierza ODBIORU — dlatego zasilanie
    // i powrot dalej cos pokazywaly, tylko nie ten obieg, co trzeba).
    uuid: '211470a8-00fd-47c4-ffff86611eeca57b', // ZRODLO_Przeplyw
    label: 'Ciepłomierz · przepływ',
    unit: 'm³/h',
    kind: 'flow',
    group: 'meter',
    precision: 3,
    available: true,
  },
  {
    // MOCY NIE MA W MINISERVERZE. Po przebudowie konfiguracji w pokoju
    // „Cieplomierz_zrodlo" jest siedem kontrolek i zadna z nich nie podaje
    // mocy chwilowej. Nie zgadujemy UUID-a — punkt zostaje zadeklarowany,
    // ale niedostepny, zeby bylo widac, czego brakuje po stronie Loxone.
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
    // Dwa osobne liczniki energii, bo licznik rozdziela grzanie i chlodzenie.
    // Sumowanie ich w jedna liczbe zatarloby kierunek przeplywu ciepla —
    // przy badaniu magazynu to wlasnie kierunek jest wynikiem.
    //
    // JEDNOSTKA NIEZADEKLAROWANA: Loxone podaje dla tych dwoch kontrolek
    // format "%.3f" bez jednostki, wiec nie wiemy, czy to kWh, czy MWh.
    // Dopoki nie wiemy, nie podpisujemy — pusty `unit` pokazuje sama liczbe.
    id: 'METER_ENERGY_HEAT',
    uuid: '2114710d-03c4-7d2e-ffff86611eeca57b', // ZRODLO_Energia_Grzania
    label: 'Ciepłomierz · energia grzania',
    unit: '',
    kind: 'energy',
    group: 'meter',
    precision: 3,
    available: true,
  },
  {
    id: 'METER_ENERGY_COOL',
    uuid: '21147120-0321-8b63-ffff86611eeca57b', // ZRODLO_Energia_Chlodzenia
    label: 'Ciepłomierz · energia chłodzenia',
    unit: '',
    kind: 'energy',
    group: 'meter',
    precision: 3,
    available: true,
  },
  {
    id: 'METER_T1',
    uuid: '211470ca-005a-55c9-ffff86611eeca57b', // ZRODLO_T_zasilanie
    label: 'Ciepłomierz · zasilanie',
    unit: '°C',
    kind: 'temperature',
    group: 'meter',
    precision: 1,
    available: true,
  },
  {
    id: 'METER_T2',
    uuid: '211470e4-0369-669b-ffff86611eeca57b', // ZRODLO_T_powrot
    label: 'Ciepłomierz · powrót',
    unit: '°C',
    kind: 'temperature',
    group: 'meter',
    precision: 1,
    available: true,
  },
  {
    // Ponizej 3 K licznik nie sumuje energii i zglasza kod bledu 4.
    id: 'METER_DT',
    uuid: '211470f4-0279-6f10-ffff86611eeca57b', // ZRODLO_dT
    label: 'Ciepłomierz · ΔT',
    unit: 'K',
    kind: 'delta',
    group: 'meter',
    precision: 2,
    available: true,
  },
  {
    // Kod bledu licznika. Trzymamy go jako punkt, a nie jako ukryta flage,
    // bo to on tlumaczy, dlaczego energia nie rosnie (kod 4 = ΔT ponizej 3 K).
    id: 'METER_ERROR',
    uuid: '2114713e-0383-96d5-ffff86611eeca57b', // ZRODLO_Blad
    label: 'Ciepłomierz · kod błędu',
    unit: '',
    kind: 'state',
    group: 'meter',
    precision: 0,
    available: true,
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
  // Pogoda ze STEROWNIKA — miejsca przygotowane, jeszcze niepodlaczone.
  //
  // Miniserver ma modul pogody, ale 2026-07-31 nie oddaje z niego danych:
  // nie ma ustawionej lokalizacji, a stan pogody idzie po WebSockecie, nie po
  // HTTP (szczegoly w server/src/weather.ts). Do tego czasu aplikacja pokazuje
  // pogode z Open-Meteo i wprost pisze, ze to nie sterownik.
  //
  // ZEBY PRZELACZYC NA LOXONE, po stronie Loxone Config trzeba:
  //   1. ustawic lokalizacje projektu (Gliwice) i wlaczyc usluge pogodowa;
  //   2. wystawic wartosci jako kontrolki InfoOnlyAnalog o nazwach POGODA_*
  //      — dokladnie tak, jak zrobiono z cieplomierzem (ZRODLO_*);
  //   3. uruchomic `npm run uuid -- --zapisz` i ustawic `available: true`.
  // Zrodlo przelaczy sie samo, bo Loxone ma pierwszenstwo.
  // -------------------------------------------------------------------------
  {
    id: 'WEATHER_TEMP',
    uuid: null,
    label: 'Pogoda · temperatura zewnętrzna',
    unit: '°C',
    kind: 'temperature',
    group: 'ambient',
    precision: 1,
    available: false,
  },
  {
    id: 'WEATHER_HUMIDITY',
    uuid: null,
    label: 'Pogoda · wilgotność względna',
    unit: '%',
    kind: 'state',
    group: 'ambient',
    precision: 0,
    available: false,
  },
  {
    id: 'WEATHER_WIND',
    uuid: null,
    label: 'Pogoda · prędkość wiatru',
    unit: 'km/h',
    kind: 'state',
    group: 'ambient',
    precision: 0,
    available: false,
  },
  {
    // Natezenie napromienienia ma znaczenie dla badania: to ono mowi, ile
    // ciepla moze wejsc do magazynu ze slonca, jesli kiedys dolaczy kolektor.
    id: 'WEATHER_RADIATION',
    uuid: null,
    label: 'Pogoda · natężenie napromienienia',
    unit: 'W/m²',
    kind: 'power',
    group: 'ambient',
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
