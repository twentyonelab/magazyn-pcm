# Entalvia — sprzęt, automatyka i warstwa komunikacji

Spis tego, co fizycznie stoi na stanowisku badawczym, co z tego mierzy, a co
tylko jest narysowane. Zebrane ze struktury Miniservera (`data/loxone/`),
rejestru punktów (`server/src/points.config.ts`) i specyfikacji
(`docs/SPEC-magazyn-pcm.md`).

Stan na **2026-08-04**. Odczyty w sekcji 8 to jedna chwila, nie stan trwały —
sprzęt i konfiguracja zmieniają się szybciej niż ten plik, więc przy
rozbieżności wierz Miniserverowi, nie temu dokumentowi.

---

## 1. Sterownik

| Element | Model / identyfikator | Uwagi |
|---|---|---|
| Miniserver | **Loxone Miniserver Compact**, typ 4 | 4 wejścia cyfrowe, 2 wyjścia przekaźnikowe, **zero analogowych** |
| Firmware | **17.1.6.30** | przypięte, nie aktualizować bez decyzji |
| Numer seryjny | `504F94D0A3E3` | nazwa `Miniserver21`, projekt „Magazyn PCM" |
| Adres LAN | `192.168.1.27` | rezerwacja na routerze |
| Remote Connect | aktywny | `connect.loxonecloud.com/504F94D0A3E3` |
| Lokalizacja | **nieustawiona** (`lat`/`lon` = 0) | skutki w sekcji 6 |
| Konto odczytowe | `pcm-odczyt` | **nie administrator**, uprawnienia `17414` |

## 2. BOM Loxone

| Poz. | Element | Identyfikator | Ilość |
|---|---|---|---|
| 1 | Miniserver Compact | SN `504F94D0A3E3` | 1 |
| 2 | 1-Wire Extension | `05:D9:47:DF` | 1 |
| 3 | Modbus Extension (RS485) | `09:D8:FA:51` | 1 |
| 4 | Sonda temperatury **Loxone 200077** | DS18B20 | **6** |

Rozszerzenie 1-Wire obsługuje do 20 sond, w użyciu jest 6. Na jednej magistrali
Modbus RS485 siedzą **oba ciepłomierze** — pod różnymi adresami.

Cały pomiar analogowy idzie przez rozszerzenia, bo Compact nie ma ani jednego
wejścia analogowego. To ograniczenie sprzętu, nie wybór projektowy.

**Sonda 200077:** stal ⌀6 × 50 mm, IP68, przewód silikonowy 2,5 m, dokładność
±0,5 °C w zakresie −10…+85 °C. Zanurzone bezpośrednio w PCM, przywiązane do
prętów pozycjonujących.

## 3. Elementy obiegu

| Element | Model | Co o nim wiadomo |
|---|---|---|
| Pompa ciepła | **Fox Blue Line 8.1** | źródło ciepła, początek drogi |
| Bufor | **80 l** | między pompą ciepła a magazynem, **bez sond** |
| Magazyn PCM | zbiornik wymienny | jeden materiał naraz, 6 sond zanurzonych |
| Zawór odcinający | **AFRISO BEV 222**, art. `90 222 10` | kula DN20, Rp3/4", Kvs 45 m³/h, 24 V AC, sterowanie 2-punktowe, 12 s/90°, Pmax 10 bar, Tmax 110 °C, IP44 |
| Pompa obiegowa | — | na schemacie, bez modelu w dokumentacji |
| Podgrzewacz / zasobnik | z grzałką trójfazową | |
| Filtr | — | chroni wymiennik podgrzewacza przed kamieniem |
| Naczynie wzbiorcze | — | dwa na schemacie (lewe, prawe) |
| Zawór bezpieczeństwa | — | |
| Licznik mocy kWh | — | **nierozstrzygnięte:** Modbus czy impuls na wejście cyfrowe |

Żyły zaworu AFRISO: `czarny = ~`, `brązowy = L`, `niebieski = N`.

> **Zawór jest odcinający, nie regulacyjny.** Kvs 45 m³/h przy przepływach rzędu
> 0,5–1 m³/h daje zerową autorytatywność. W aplikacji reprezentuj go jako stan
> binarny otwarty/zamknięty — nie rysuj jako element modulowany.

## 4. Ciepłomierze — są dwa

|  | Źródło | Odbiór |
|---|---|---|
| Pomieszczenie w Loxone | `Cieplomierz_zrodlo` | `Cieplomierz_odbior` |
| Numer seryjny | `04050842` | `04049506` |
| Kontrolek | 8 | 10 |

Model potwierdzony dla źródła: **AXIOMA QALCOSONIC E4**, ultradźwiękowy,
certyfikacja MID.

| Parametr | Wartość |
|---|---|
| qp / qs / qi | 2,5 / 5,0 / 0,025 m³/h |
| Zakres temperatur | 0,1…90 °C |
| **ΔΘ minimum** | **3 K** — poniżej nie sumuje energii, zgłasza kod błędu 4 |
| Czujniki | Pt500 |
| Klasa dokładności | 2 |
| Interfejs | Modbus RTU + wyjście impulsowe |
| Zasilanie | bateria 2 × 3,6 V **plus** zewnętrzne 24 VDC |

> **Zasilanie zewnętrzne jest warunkiem ciągłego odczytu.** Na samej baterii
> licznik udostępnia Modbusa tylko **80 sekund na godzinę** (limit 16 h/miesiąc).

**Błąd 0002 — montaż odwrotny.** Zgłoszony 2026-08-04 z wyświetlacza licznika.
Widać go też w danych: przy pracującym obiegu źródła moc chwilowa wychodzi
**ujemna**. Do wyprostowania po stronie instalacji.

## 5. Punkty pomiarowe — 28 kontrolek

Wszystkie typu `InfoOnlyAnalog`, czyli **czysty odczyt, zero sterowania**.

| Grupa | Ile | Kontrolki |
|---|---|---|
| Zbiornik PCM | 6 | `1A_8HC` … `3B_8HC` → w aplikacji `A1–A3`, `B1–B3` |
| Ciepłomierz źródła | 8 | `ZRODLO_` + `T_zasilanie`, `T_powrot`, `dT`, `Przeplyw`, `Moc`, `Energia_Grzania`, `Energia_Chlodzenia`, `Blad` |
| Ciepłomierz odbioru | 10 | `ODBIOR_` te same + `SN04049506`, `Cieplomierz_odbior_TEMP` |
| Otoczenie | 4 | temperatura, wilgotność względna, ciśnienie powietrza, pył zawieszony |

### Siatka sond w magazynie

| ID | Przekątna | Poziom |
|---|---|---|
| `A1` / `B1` | A / B | 1 — **dół** zbiornika |
| `A2` / `B2` | A / B | 2 — środek |
| `A3` / `B3` | A / B | 3 — góra |

Potwierdzone 2026-07-29. Na każdym poziomie `A` i `B` to sondy na dwóch
**różnych przekątnych**. Historia pomiarów jest do tego przypisania przywiązana
na zawsze — pól `level` i `diagonal` nie zmienia się bez powodu.

**Cykl 1-Wire:** 15 s na sondę, magistrala odpytywana sekwencyjnie. Realne
odświeżanie wartości to kilkanaście sekund i aplikacja nie może zakładać
częstszych zmian.

## 6. Automatyka — czego nie ma

Trzy punkty są w rejestrze **zadeklarowane, ale nieczynne** (`available: false`),
bo nic w Miniserverze ich nie wystawia:

| Punkt | Co miałby mówić |
|---|---|
| `HP_STATE` | czy pompa ciepła pracuje |
| `PUMP_STATE` | czy pompa obiegowa pracuje |
| `VALVE_STATE` | czy zawór jest otwarty |

> **Warstwa automatyki jest wyłącznie odczytowa.** Aplikacja nie wie, czy pompa
> pracuje ani czy zawór jest otwarty — wnioskuje to z temperatur i przepływu.
> Dlatego na schemacie istnieje przycisk „demo przepływu": rury animują się nie
> dlatego, że coś płynie, ale dlatego, że tak ustawiono — i mówi to wprost.

Brakuje też **sond w buforze**. Nie było ich w planie.

**Pogoda z Loxone nie działa, choć odpowiada.** Pokój „Otoczenie" pojawił się
2026-08-04 z czterema kontrolkami usługi pogodowej; ich UUID-y są w rejestrze,
wszystkie zwracają HTTP 200 i **zero**. Powód: `msInfo.latitude`/`longitude`
w zapisanym projekcie nadal wynoszą 0, więc usługa nie ma dla czego liczyć
pogody. Do zrobienia: ustawić lokalizację (Gliwice, Kaszubska 26) i **zapisać**
konfigurację; w kodzie nic się nie zmieni, źródło przełączy się samo.

`weather.ts` odrzuca zestaw samych zer jawnie i schodzi na Open-Meteo, bo
sprawdzenie „czy punkt odpowiada" nie jest sprawdzeniem „czy mierzy".

## 7. Warstwa komunikacji

```
Miniserver (Gliwice)  ──HTTP Basic──>  serwer Node (Railway, EU West)  ──SSE──>  przeglądarka
   Compact, 1-Wire            /jdev/sps/io/{uuid}/state        /api/stream
   + Modbus RS485             przez Remote Connect
```

**Do Miniservera:** `GET /jdev/sps/io/{uuid}/state`, uwierzytelnianie HTTP Basic,
konto `pcm-odczyt`. Adres w postaci `cloud:504F94D0A3E3` rozwiązuje się przez
`https://dns.loxonecloud.com/{serial}`. Dzięki temu **kolektor nie musi stać
w laboratorium** — dziś działa z Amsterdamu.

**Do przeglądarki:** zdarzenia SSE na `/api/stream`. Historia w SQLite
(`better-sqlite3`), z awaryjnym zapisem NDJSON bez zależności natywnych.

| Parametr | Wartość | Zmienna |
|---|---|---|
| Cykl odpytywania | 5 000 ms | `POLL_INTERVAL_MS` |
| Timeout zapytania | 4 000 ms | `LOXONE_TIMEOUT_MS` |
| Próg przestarzałości | cykl × 3 = 15 s | `STALE_FACTOR` |
| Ponowne rozpoznanie zbiornika | 300 s | `BANK_RECHECK_S` |

### Trzy decyzje, których powodu nie widać z kodu

**Odczyty idą sekwencyjnie, nie równolegle.** Compact to słaby sprzęt, a
magistrala 1-Wire odświeża sondę raz na ~15 s — sześć równoległych zapytań co
5 s nie dałoby nic. Odpytujemy więc **częściej, niż dane się zmieniają**.

**Odrzucone logowanie (401/403 na logowaniu) zatrzymuje odpytywanie
całkowicie, bez ponowień.** Miniserver blokuje konto po serii nieudanych prób.
Literówka w haśle plus ponawianie co 5 s to 12 nieudanych logowań na minutę
i konto zablokowane na godziny. Błędy sieciowe i timeouty ponawiamy — z
backoffem wykładniczym — bo tam ponawianie jest bezpieczne i pożądane.

**Lista celów jest funkcją, nie stałą.** Zbiornik jest wymienny, a razem z nim
zestaw UUID-ów; gdyby listę ustalać raz przy starcie, wymiana zbiornika
wymagałaby restartu aplikacji. Do tego co kilka cykli sprawdzana jest wersja
struktury, co daje flagę `configChanged` — tak wykryta została wymiana sond
2026-08-03, zanim ktokolwiek o niej powiedział.

### Pułapka, która już raz kosztowała pół dnia

Milczące kanały Modbus **nie były problemem zasilania licznika.** Okazało się
2026-08-04, że to **uprawnienia konta `pcm-odczyt` do pomieszczeń** w Loxone.
Objaw był mylący: Miniserver zwracał **403 dla pojedynczych punktów**, a
aplikacja pokazywała je jako „przestarzałe", bo 403 na odczycie punktu nie jest
błędem logowania i nie zatrzymuje cyklu.

> Przy milczącym punkcie sprawdzaj **najpierw dostęp konta do pomieszczenia**,
> potem UUID, a zasilanie licznika na końcu.

## 8. Odczyty kontrolne — 2026-08-04

Stan `source: ok`, zero milczących punktów, wszystkie 28 kontrolek odpowiadają.

| Punkt | Źródło | Odbiór |
|---|---|---|
| Zasilanie | 6,7 °C | 25,5 °C |
| Powrót | 13,2 °C | 25,8 °C |
| ΔT | −6,53 K | −0,27 K |
| Przepływ | 0,973 m³/h | 0 m³/h |
| Moc | −7,41 kW | 0 kW |
| Energia grzania | 0 | **−0,27** |
| Energia chłodzenia | 0,02 | **−0,27** |

Sondy magazynu: A1 8,5 · A2 8,6 · A3 8,9 · B1 8,8 · B2 8,9 · B3 9,4 °C.
Pogoda z Loxone: cztery zera (patrz sekcja 6).

### Jak to czytać

**Źródło pracuje sensownie.** Zbiornik siedzi w pasmie przemiany RT8HC
(7–9 °C), zasilanie 6,7 °C jest zimniejsze od powrotu 13,2 °C, a licznik
naliczył 0,02 na kanale **chłodzenia** przy zerze na grzaniu. Dla magazynu
chłodu w trakcie ładowania to jest właśnie ten obraz, którego się oczekuje.
Ujemne ΔT i ujemna moc to skutek tego, że licznik liczy „energię dostarczoną"
i przy obiegu chłodniczym wychodzi mu wartość z przeciwnym znakiem — do
rozstrzygnięcia razem z błędem 0002.

**Odbiór stoi** (przepływ 0) i to samo w sobie nie jest usterką.

> **Podejrzenie konfiguracji, nie pomiaru:** oba liczniki energii odbioru
> pokazują **−0,27**, czyli dokładnie tyle, ile ΔT tego obiegu. Energia jest
> licznikiem narastającym — nie może być ujemna, nie może maleć i nie może być
> równa różnicy temperatur. To wygląda na dwa rejestry Modbus wskazujące na
> rejestr ΔT. **Nie licz na tych punktach bilansu**, dopóki się nie wyjaśni.

## 9. Materiały PCM

Zbiornik pracuje z jednym materiałem naraz. **Materiał jest atrybutem sesji
badawczej, nie punktu pomiarowego** — w identyfikatorach punktów go nie ma
i nie może być.

| Materiał | Topnienie | Krzepnięcie | Pojemność | Tmax | Skurcz |
|---|---|---|---|---|---|
| **RT8HC** | 7–9 °C (szczyt 8) | 8–7 °C | 190 kJ/kg · 53 Wh/kg | 40 °C | ~12,5 % |
| **RT57HC** | 55–58 °C (szczyt 57) | 53–57 °C | 240 kJ/kg · 67 Wh/kg | 90 °C | ~11 % |

Przewodność cieplna obu: **0,2 W/(m·K)** — konwekcji praktycznie nie ma, front
przemiany posuwa się od wymiennika na zewnątrz, stałe czasowe liczy się
w minutach, nie sekundach.

**Konsekwencja dla wizualizacji:** plateau przemiany RT8HC ma szerokość **2 K**.
Skala barwna 0–100 °C zamieniłaby całą przemianę fazową w jeden odcień, dlatego
zakres skali jest konfigurowalny per materiał.

## 10. Nierozstrzygnięte

- **Mapa rejestrów Modbus** dla Qalcosonica E3/E4 — dokument *Modbus RTU Slave
  Module*. Bez niej nie da się potwierdzić, na co wskazują rejestry energii
  odbioru (patrz sekcja 8).
- Oba liczniki energii odbioru zwracają wartość równą ΔT i ujemną.
- Błąd **0002** na AXIOMA źródła — montaż odwrotny.
- Licznik mocy kWh: Modbus czy impuls na wejście cyfrowe?
- Lokalizacja Miniservera do ustawienia i **zapisania** — cztery kontrolki
  pogodowe czekają na to, żeby zacząć mierzyć.
- `solidus 53` w belce naładowania wobec `phaseBandMin: 55` w konfiguracji
  serwera dla RT57HC.
