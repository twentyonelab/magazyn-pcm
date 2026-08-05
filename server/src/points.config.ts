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
  //
  // NUMERY SERYJNE 1-WIRE SOND ZBIORNIKA 57HC (magazyn ciepla) — podane
  // 2026-08-05, PRZED fizycznym wpieciem. To adresy SPRZETU (DS18B20),
  // trwale dla sondy; UUID-y kontrolek Loxone powstana dopiero po dodaniu
  // ich w Loxone Config i beda inne niz historyczne. Zapisane tutaj, zeby
  // przy wpinaniu dalo sie sparowac sonde z punktem bez zgadywania:
  //
  //   A1  <- 1A_57HC  28.03.EB.F6.10.00.00.DF
  //   B1  <- 1B_57HC  28.9B.E0.F6.10.00.00.BF
  //   A2  <- 2A_57HC  28.E1.26.F6.10.00.00.56
  //   B2  <- 2B_57HC  28.FE.82.F4.10.00.00.02
  //   A3  <- 3A_57HC  28.E2.C6.F4.10.00.00.D2
  //   B3  <- 3B_57HC  28.B9.BF.F6.10.00.00.9D
  //
  // Po wpieciu i dodaniu kontrolek w Loxone Config: `npm run uuid -- --zapisz`
  // uzupelni `uuidByBank.RT57HC` po nazwach — i od tej chwili BankDetector
  // sam rozpozna, ze aktywny jest magazyn ciepla (mapa przelaczy stanowiska).
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
    label: 'Źródło · przepływ',
    unit: 'm³/h',
    kind: 'flow',
    group: 'meter',
    precision: 3,
    available: true,
  },
  {
    // MOC JUZ JEST. Do 2026-08-03 w pokoju „Cieplomierz_zrodlo" nie bylo
    // kontrolki mocy chwilowej i ten punkt stal niedostepny. 2026-08-04
    // w strukturze pojawil sie `ZRODLO_Moc` (%.2f kW) — wpisany nizej.
    //
    // To nie jest kosmetyka: znak mocy rozstrzyga w widoku Magazyn, czy
    // magazyn sie laduje, czy rozladowuje (patrz `kierunekZmiany`). Dopoki
    // punkt milczal, kierunek byl wnioskowany z trendu sredniej temperatury.
    id: 'METER_POWER',
    uuid: '21146dd1-02c5-ff6a-ffff86611eeca57b', // ZRODLO_Moc
    label: 'Źródło · moc',
    unit: 'kW',
    kind: 'power',
    group: 'meter',
    precision: 2,
    available: true,
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
    label: 'Źródło · zasilanie',
    unit: '°C',
    kind: 'temperature',
    group: 'meter',
    precision: 1,
    available: true,
  },
  {
    id: 'METER_T2',
    uuid: '211470e4-0369-669b-ffff86611eeca57b', // ZRODLO_T_powrot
    label: 'Źródło · powrót',
    unit: '°C',
    kind: 'temperature',
    group: 'meter',
    precision: 1,
    available: true,
  },

  // -------------------------------------------------------------------------
  // CIEPLOMIERZ ODBIORU — drugi licznik, obieg po lewej stronie schematu.
  //
  // 2026-08-04: pokoj „Cieplomierz_odbior" ma teraz KOMPLET kanalow Modbus —
  // przeplyw, moc, dwie energie i kod bledu doszly po naszej stronie jako
  // zwykle punkty. Wczesniej byly tam tylko dwie temperatury i ΔT, i wlasnie
  // to zamyka pozycje „brakuje przeplywu i energii" z listy do zrobienia.
  //
  // UWAGA NA PREFIKS UUID-a: kontrolki tego licznika maja 210f77xx, czyli
  // dokladnie te, ktore do 2026-08-03 byly wpisane jako cieplomierz ZRODLA.
  // Tamto mapowanie bylo bledne (przebudowa konfiguracji przestawila bloki)
  // i wlasnie dlatego zrodlo pokazywalo liczby z niewlasciwego obiegu.
  // -------------------------------------------------------------------------
  {
    id: 'ODBIOR_T_ZASILANIE',
    uuid: '210f7702-032b-4d09-ffff86611eeca57b', // ODBIOR_T_zasilanie
    label: 'Odbiór · zasilanie',
    unit: '°C',
    kind: 'temperature',
    group: 'meter',
    precision: 1,
    available: true,
  },
  {
    id: 'ODBIOR_T_POWROT',
    uuid: '210f7726-0029-59bd-ffff86611eeca57b', // ODBIOR_T_powrot
    label: 'Odbiór · powrót',
    unit: '°C',
    kind: 'temperature',
    group: 'meter',
    precision: 1,
    available: true,
  },
  {
    id: 'ODBIOR_DT',
    uuid: '210f774a-017e-63ef-ffff86611eeca57b', // ODBIOR_dT
    label: 'Odbiór · ΔT',
    unit: 'K',
    kind: 'delta',
    group: 'meter',
    precision: 2,
    available: true,
  },
  {
    // PODLACZONY 2026-08-04. Kanal `ODBIOR_Przeplyw` (%.3f m³/h) pojawil sie
    // w Miniserverze i od tej pory obieg odbioru ma wlasny pomiar przeplywu.
    //
    // TO ZMIENIA SCHEMAT: odcinki `odbior-gora` i `odbior-powrot` przestaly
    // brac przeplyw od ciepłomierza ZRODLA (patrz `data-flow-source`
    // w narzedzia/wepnij-kontrakt.mjs). Wczesniej caly rysunek plynal jednym
    // pomiarem, czyli lewa strona pokazywala ruch, ktorego nikt nie mierzyl.
    id: 'ODBIOR_FLOW',
    uuid: '210f76e2-02a8-42e3-ffff86611eeca57b', // ODBIOR_Przeplyw
    label: 'Odbiór · przepływ',
    unit: 'm³/h',
    kind: 'flow',
    group: 'meter',
    precision: 3,
    available: true,
  },
  {
    id: 'ODBIOR_POWER',
    uuid: '210f769d-0255-3151-ffff86611eeca57b', // ODBIOR_Moc
    label: 'Odbiór · moc',
    unit: 'kW',
    kind: 'power',
    group: 'meter',
    precision: 2,
    available: true,
  },
  {
    // Jednostka NIEZADEKLAROWANA, dokladnie jak przy liczniku zrodla: Loxone
    // podaje format „%.3f" bez jednostki, wiec nie wiemy, czy to kWh, czy MWh.
    //
    // UWAGA NA WARTOSCI UJEMNE: 2026-08-04 oba liczniki energii tego przyrzadu
    // zwracaly −0,640. Ujemna energia zsumowana to objaw ODWROTNEGO MONTAZU
    // (blad AXIOMA 0002), a nie wynik pomiaru. Punkt jest podlaczony, zeby to
    // bylo widac w Diagnostyce — nie zeby na tym cokolwiek liczyc.
    id: 'ODBIOR_ENERGY_HEAT',
    uuid: '210f77a3-034c-7345-ffff86611eeca57b', // ODBIOR_Energia_Grzania
    label: 'Odbiór · energia grzania',
    unit: '',
    kind: 'energy',
    group: 'meter',
    precision: 3,
    available: true,
  },
  {
    id: 'ODBIOR_ENERGY_COOL',
    uuid: '210f77af-0286-7d8f-ffff86611eeca57b', // ODBIOR_Energia_Chlodzenia
    label: 'Odbiór · energia chłodzenia',
    unit: '',
    kind: 'energy',
    group: 'meter',
    precision: 3,
    available: true,
  },
  {
    id: 'ODBIOR_ERROR',
    uuid: '210f77bf-031e-8553-ffff86611eeca57b', // ODBIOR_Blad
    label: 'Odbiór · kod błędu',
    unit: '',
    kind: 'state',
    group: 'meter',
    precision: 0,
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
  // BUFOR NIE JEST MONITOROWANY — i nie ma tu po nim zadnego punktu.
  //
  // Stały tu kiedys `BUFFER_TOP` i `BUFFER_BOTTOM`, oba z `uuid: null`
  // i `available: false`. Nie ma sond w buforze, nie bylo ich w planie
  // i nie ma po co trzymac dwoch wiecznie pustych wierszy w Diagnostyce ani
  // grupy „Bufor", w ktorej nigdy nic nie stanie. Sam bufor zostaje na
  // schemacie jako bryla instalacji — to element hydrauliczny, nie pomiar.
  // Usuniete 2026-08-04 na wyrazna prosbe.
  // -------------------------------------------------------------------------

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
  // Pogoda ze STEROWNIKA — pokoj „Otoczenie", podlaczony 2026-08-04.
  //
  // W strukturze Miniservera pojawil sie pokoj „Otoczenie" z czterema
  // kontrolkami uslugi pogodowej Loxone: Temperatura, Wilgotnosc wzgledna,
  // Cisnienie powietrza i Zanieczyszczenie pylem zawieszonym. UUID-y ponizej
  // sa ich prawdziwymi identyfikatorami (prefiks 210b49cf — to identyfikatory
  // serwera pogody, nie zwyklych kontrolek).
  //
  // ALE USLUGA JESZCZE NIC NIE LICZY. Sprawdzone tego samego dnia na zywym
  // sterowniku: wszystkie cztery odpowiadaja HTTP 200 i wartoscia ZERO, bo
  // `msInfo.latitude` i `msInfo.longitude` w projekcie nadal wynosza 0 —
  // czyli lokalizacja jest ustawiona w Loxone Config, ale nie doszla do
  // zapisanego projektu (albo usluga pogodowa nie jest aktywna w chmurze
  // Loxone). Punkty sa wiec PODLACZONE i widac je w Diagnostyce takie, jakie
  // sa; `server/src/weather.ts` osobno pilnuje, zeby te zera nie weszly na
  // kafelek pogody jako „0 °C na zewnatrz".
  //
  // WIATRU I NAPROMIENIENIA W TYM POKOJU NIE MA — zostaja niedostepne.
  // -------------------------------------------------------------------------
  {
    id: 'WEATHER_TEMP',
    uuid: '210b49cf-0286-88ec-ffff86611eeca57b', // Otoczenie · Temperatura
    label: 'Pogoda · temperatura zewnętrzna',
    unit: '°C',
    kind: 'temperature',
    group: 'ambient',
    precision: 1,
    available: true,
  },
  {
    id: 'WEATHER_HUMIDITY',
    uuid: '210b49cf-0286-88ef-ffff86611eeca57b', // Otoczenie · Wilgotność względna
    label: 'Pogoda · wilgotność względna',
    unit: '%',
    kind: 'state',
    group: 'ambient',
    precision: 0,
    available: true,
  },
  {
    id: 'WEATHER_PRESSURE',
    uuid: '210b49cf-0286-88fe-ffff86611eeca57b', // Otoczenie · Ciśnienie powietrza
    label: 'Pogoda · ciśnienie powietrza',
    unit: 'hPa',
    kind: 'state',
    group: 'ambient',
    precision: 0,
    available: true,
  },
  {
    // Pyl zawieszony nie ma zwiazku z bilansem ciepla i jest tu wylacznie
    // dlatego, ze sterownik go podaje — a Diagnostyka ma pokazywac to, co
    // sterownik naprawde oddaje, nie wybor redakcyjny.
    id: 'WEATHER_PM',
    uuid: '210b49cf-0287-8904-ffff86611eeca57b', // Otoczenie · Pył zawieszony
    label: 'Pogoda · pył zawieszony',
    unit: 'μg/m³',
    kind: 'state',
    group: 'ambient',
    precision: 1,
    available: true,
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
