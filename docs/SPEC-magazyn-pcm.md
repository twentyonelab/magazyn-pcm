# SPEC — Wizualizacja stanowiska badawczego magazynu PCM

Dokument kontekstowy dla Claude Code. Zawiera pełny opis sprzętu, warstwy danych, kontraktu API
i wymagań interfejsu. Czytaj całość przed pierwszą linią kodu.

---

## 1. Czym to jest

Stanowisko badawcze R&D w hali laboratoryjnej Politechniki Śląskiej. Bada magazyn ciepła
i chłodu na materiale zmiennofazowym (PCM). Sterowanie i akwizycja danych stoją na **Loxone
Miniserver Compact**. Konfiguracja sprzętu pozostaje w Loxone Config — ta aplikacja jest
**wyłącznie warstwą odczytu i wizualizacji**.

Firma: 21 zmysłów — dwuosobowe studio projektowo-inżynieryjne. Produkty zeroemisyjne:
czyste powietrze, klimat wnętrz, odzysk energii, obieg zamknięty.

**Cel aplikacji:** narzędzie badawcze na czas prowadzenia testów oraz zalążek interfejsu,
który w przyszłości pokażemy klientowi. Warstwa wizualna ma być nasza, nie Loxone'owa.

---

## 2. Sprzęt

### Sterownik

| Element | Model | Uwagi |
|---|---|---|
| Miniserver | **Loxone Miniserver Compact** | 4 wejścia cyfrowe, 2 wyjścia przekaźnikowe, **zero analogowych** |
| Firmware / Config | **17.1.6.30** | wersja przypięta, nie aktualizować bez decyzji |
| Numer seryjny | `504F94D0A3E3` | |
| Adres w LAN | `192.168.1.27` | rezerwacja na routerze |
| Remote Connect | aktywny | `dns.loxonecloud.com/504F94D0A3E3` |
| 1-Wire Extension | `05:D9:47:DF` | do 20 sond, obecnie 6 w użyciu |
| Modbus Extension | `09:D8:FA:51` | RS485, ciepłomierz |

### Pomiar temperatury w magazynie

Sondy **Loxone 200077**, układ DS18B20, stal ⌀6 × 50 mm, IP68, przewód silikonowy 2,5 m.
Dokładność ±0,5 °C w zakresie −10…+85 °C. Zanurzone bezpośrednio w PCM, przywiązane
do prętów pozycjonujących.

**Siatka: dwie przekątne × trzy poziomy.**

| ID punktu | Przekątna | Poziom | Uwaga |
|---|---|---|---|
| `A1` | A | 1 (dolny) | |
| `A2` | A | 2 (środek) | |
| `A3` | A | 3 (górny) | |
| `B1` | B | 1 (dolny) | |
| `B2` | B | 2 (środek) | |
| `B3` | B | 3 (górny) | |

> **POTWIERDZONE 2026-07-29 (Krzysztof):** poziom 1 = dół zbiornika,
> 2 = środek, 3 = góra. Na każdym poziomie `A` i `B` to sondy na dwóch
> **różnych przekątnych** zbiornika. Otwarte pytanie nr 1 z sekcji 12
> jest zamknięte — historia pomiarów jest do tego przypisania przywiązana.

**Cykl odpytywania 1-Wire:** 15 s na sondę, magistrala odpytywana sekwencyjnie.
Realne odświeżanie wartości: kilkanaście sekund. Aplikacja nie może zakładać
częstszych zmian.

### Materiały PCM

Zbiornik pracuje z jednym materiałem naraz. **Materiał jest atrybutem sesji badawczej,
nie punktu pomiarowego.**

| Materiał | Topnienie | Krzepnięcie | Pojemność | Tmax | Skurcz przy krzepnięciu |
|---|---|---|---|---|---|
| **RT8HC** | 7–9 °C (szczyt 8) | 8–7 °C | 190 kJ/kg · 53 Wh/kg | 40 °C | ~12,5 % |
| **RT57HC** | 55–58 °C (szczyt 57) | 53–57 °C | 240 kJ/kg · 67 Wh/kg | 90 °C | ~11 % |

Przewodność cieplna obu: **0,2 W/(m·K)** — konwekcji praktycznie nie ma, front przemiany
posuwa się od wymiennika na zewnątrz. Stałe czasowe w minutach, nie sekundach.

**Konsekwencja dla wizualizacji:** plateau przemiany RT8HC ma szerokość **2 K**.
Skala barwna 0–100 °C sprawi, że cała przemiana fazowa będzie jednym kolorem.
**Zakres skali musi być konfigurowalny per materiał** — patrz sekcja 7.

### Ciepłomierz

**AXIOMA QALCOSONIC E4**, ultradźwiękowy, certyfikacja MID.

| Parametr | Wartość |
|---|---|
| Numer seryjny | `04050842` |
| qp / qs / qi | 2,5 / 5,0 / 0,025 m³/h |
| Zakres temperatur | 0,1…90 °C |
| **ΔΘ minimum** | **3 K** — poniżej nie zsumuje energii, zgłasza kod błędu 4 |
| Czujniki | Pt500 |
| Klasa dokładności | 2 |
| Interfejs | **Modbus RTU** + wyjście impulsowe |
| Zasilanie | bateria 2 × 3,6 V **plus** zewnętrzne 24 VDC |

> **Krytyczne:** na samej baterii licznik udostępnia Modbusa tylko **80 sekund na godzinę**
> (limit 16 h/miesiąc). Musi być zasilony zewnętrznie z 24 VDC, inaczej odczyt ciągły
> jest niemożliwy.

Udostępnia: energię, objętość, przepływ, T1, T2, ΔT, moc chwilową.

> **Brakujący dokument:** mapa rejestrów Modbus — *Modbus RTU Slave Module for
> Qalcosonic E3/E4*. Bez niej adresy rejestrów są nieznane. Do czasu jej zdobycia
> punkty ciepłomierza w rejestrze mają `available: false`.

### Zawór odcinający

**AFRISO BEV 222**, art. `90 222 10`. Kula DN20, Rp3/4", Kvs 45 m³/h, **24 V AC**,
sterowanie 2-punktowe, 12 s/90°, Pmax 10 bar, Tmax 110 °C, IP44.
Żyły: `czarny = ~`, `brązowy = L`, `niebieski = N`.

> To zawór **odcinający, nie regulacyjny.** Kvs 45 przy przepływach rzędu 0,5 m³/h daje
> zerową autorytatywność. W aplikacji reprezentuj go jako stan binarny otwarty/zamknięty.
> Nie rysuj go jako element modulowany.

### Pozostałe elementy obiegu

Ze schematu instalacji: pompa ciepła **Fox Blue Line 8.1** → bufor **80 l** → magazyn PCM.
Dodatkowo w układzie: kocioł/zasobnik z grzałką trójfazową, pompa obiegowa, naczynie
wzbiorcze, zawór bezpieczeństwa, licznik mocy kWh.

> **Rozbieżność do wyjaśnienia:** rysunek wymienia zasobnik 200 l, opis mówi o buforze 80 l.
> Traktuj objętości jako wartości konfiguracyjne, nie zapisane na stałe w kodzie.

---

## 3. Punkty pomiarowe — rejestr

Jedno źródło prawdy dla całej aplikacji. Frontend **nigdy** nie odwołuje się do UUID Loxone.

```ts
// server/src/points.config.ts

export type PointKind =
  | 'temperature' | 'flow' | 'energy' | 'power'
  | 'volume' | 'delta' | 'state';

export interface PointDef {
  id: string;              // stabilny identyfikator logiczny — NIE zmieniać po starcie zbierania danych
  uuid: string | null;     // UUID z LoxAPP3.json; null = jeszcze niepodłączony
  label: string;           // etykieta dla człowieka
  unit: string;
  kind: PointKind;
  group: 'pcm' | 'buffer' | 'heatpump' | 'meter' | 'ambient' | 'actuator';
  precision: number;       // liczba miejsc po przecinku
  geometry?: {             // tylko dla punktów w magazynie
    diagonal: 'A' | 'B';
    level: 1 | 2 | 3;
  };
  available: boolean;      // false = punkt zadeklarowany, ale jeszcze nie mamy z niego danych
}
```

### Punkty na dziś

| id | label | unit | kind | group | available |
|---|---|---|---|---|---|
| `A1` | Magazyn · przekątna A · poziom 1 | °C | temperature | pcm | ✅ |
| `A2` | Magazyn · przekątna A · poziom 2 | °C | temperature | pcm | ✅ |
| `A3` | Magazyn · przekątna A · poziom 3 | °C | temperature | pcm | ✅ |
| `B1` | Magazyn · przekątna B · poziom 1 | °C | temperature | pcm | ✅ |
| `B2` | Magazyn · przekątna B · poziom 2 | °C | temperature | pcm | ✅ |
| `B3` | Magazyn · przekątna B · poziom 3 | °C | temperature | pcm | ✅ |
| `METER_FLOW` | Ciepłomierz · przepływ | m³/h | flow | meter | ✅ |
| `METER_POWER` | Ciepłomierz · moc | kW | power | meter | ✅ |
| `METER_ENERGY_HEAT` | Ciepłomierz · energia grzania | — ¹ | energy | meter | ✅ |
| `METER_ENERGY_COOL` | Ciepłomierz · energia chłodzenia | — ¹ | energy | meter | ✅ |
| `METER_T1` | Ciepłomierz · zasilanie | °C | temperature | meter | ✅ |
| `METER_T2` | Ciepłomierz · powrót | °C | temperature | meter | ✅ |
| `METER_DT` | Ciepłomierz · ΔT | K | delta | meter | ✅ |
| `METER_ERROR` | Ciepłomierz · kod błędu | — | state | meter | ✅ |
| `BUFFER_TOP` | Bufor · góra | °C | temperature | buffer | ❌ |
| `BUFFER_BOTTOM` | Bufor · dół | °C | temperature | buffer | ❌ |
| `HP_STATE` | Pompa ciepła · praca | — | state | heatpump | ❌ |
| `PUMP_STATE` | Pompa obiegowa · praca | — | state | actuator | ❌ |
| `VALVE_STATE` | Zawór AFRISO · otwarty | — | state | actuator | ❌ |
| `WEATHER_TEMP` | Pogoda · temperatura zewnętrzna | °C | temperature | ambient | ❌ ² |
| `WEATHER_HUMIDITY` | Pogoda · wilgotność względna | % | state | ambient | ❌ ² |
| `WEATHER_WIND` | Pogoda · prędkość wiatru | km/h | state | ambient | ❌ ² |
| `WEATHER_RADIATION` | Pogoda · natężenie napromienienia | W/m² | power | ambient | ❌ ² |
| `AMBIENT_HALL` | Hala · powietrze | °C | temperature | ambient | ❌ |

Punkty z `available: false` muszą się renderować jako **wyraźnie nieaktywne** —
nie jako zero i nie jako puste. Zero na wykresie temperatury to kłamstwo.

**Ciepłomierz — podłączony 2026-07-30.** Modbus RTU czyta Miniserver i wystawia
odczyty jako kontrolki `InfoOnlyAnalog` o nazwach `ZRODLO_*`. Po stronie
aplikacji są to więc zwykłe punkty pomiarowe, a mapa rejestrów Modbus przestała
być potrzebna — cała wiedza o rejestrach siedzi w Loxone Config.

¹ **Jednostka energii nieznana.** Loxone deklaruje dla obu liczników energii
format `%.3f` bez jednostki (dla pozostałych punktów jednostki są: `m³/h`,
`kW`, `°C`, `K`). Dopóki nie jest ustawiona w Loxone Config, pokazujemy samą
liczbę bez podpisu — zamiast zgadywać między kWh a MWh.

² **Pogoda — moduł Loxone jest, ale nie oddaje danych.** Sprawdzone 2026-07-31
na Miniserverze21: w strukturze projektu jest `weatherServer` z UUID-ami stanów
`actual` i `forecast`, ale odczyt `actual` po HTTP zwraca `"0"`, a `forecast`
odpowiada błędem 404. Powody są trzy i każdy wystarcza:

1. Miniserver **nie ma ustawionej lokalizacji** (`latitude` i `longitude` = 0),
   więc usługa pogodowa nie ma dla czego liczyć pogody.
2. Usługa pogodowa Loxone wymaga aktywnej licencji.
3. Stan pogody w Loxone to złożona struktura wysyłana **po WebSockecie**,
   a nasz klient rozmawia ze sterownikiem po HTTP.

Żeby pogoda przyszła ze sterownika, po stronie Loxone Config trzeba: ustawić
lokalizację projektu (Gliwice), włączyć usługę pogodową i wystawić wartości
jako kontrolki `POGODA_*` — dokładnie tak, jak zrobiono z ciepłomierzem
(`ZRODLO_*`). Potem `npm run uuid -- --zapisz` i `available: true`.

Do tego czasu aplikacja pokazuje pogodę z **Open-Meteo** (darmowa, bez klucza)
i **zawsze pisze, z którego źródła korzysta** — bo „22 °C przy instalacji"
i „22 °C w prognozie dla Gliwic" to dwie różne informacje. Gdy punkty
`POGODA_*` dostaną UUID-y, źródło przełączy się samo; Loxone ma pierwszeństwo.

**Otwarte: oba kanały energii pokazują tę samą wartość co ΔT.** Odczyt
2026-07-30: `ZRODLO_Energia_Grzania` = `ZRODLO_Energia_Chlodzenia` = `-0.41`,
przy `ZRODLO_dT` = `-0.41 K`. Licznik energii nie może być ujemny ani
identyczny dla grzania i chłodzenia, więc najprawdopodobniej oba rejestry
energii są w Loxone Config wpięte pod rejestr różnicy temperatur. Do
sprawdzenia po stronie konfiguracji Modbusa.

---

## 4. Jak wyjąć dane z Loxone

### Struktura instalacji

```
GET http://192.168.1.27/data/LoxAPP3.json
```

Zwraca pełną strukturę: pomieszczenia, kategorie, kontrolki, UUID-y, stany.
Stąd bierzemy UUID-y do rejestru punktów. Pole `lastModified` mówi, kiedy zmieniono
konfigurację — porównuj z `jdev/sps/LoxAPPversion3`, żeby wykryć zmianę w Config.

### Odczyt wartości — wariant v1, odpytywanie

```
GET http://192.168.1.27/jdev/sps/io/{uuid}/state
→ { "LL": { "control": "...", "value": "8.4", "Code": "200" } }
```

Proste, wystarczające. Sondy i tak odświeżają się co ~15 s, więc **odpytywanie co 5 s
jest z zapasem**. Uwierzytelnianie Basic po LAN dopuszczalne w v1.

### Odczyt wartości — wariant v2, WebSocket

```
ws://192.168.1.27/ws/rfc6455
```

Push w czasie rzeczywistym. Handshake: `jdev/cfg/api` → `jdev/cfg/getPublicKey` →
RSA-2048 na klucz sesji AES256 → `jdev/sys/gettoken/...` (HMAC z hasła) → subskrypcja
zdarzeń binarnych → keepalive.

> **Nie implementuj tego od zera.** Użyj biblioteki: `loxone-ts-api`, `lxcommunicator`
> albo `node-lox-ws-api`. Oficjalna dokumentacja:
> https://www.loxone.com/wp-content/uploads/datasheets/CommunicatingWithMiniserver.pdf

### Bezpieczeństwo

- **Załóż w Loxone osobnego użytkownika tylko do odczytu.** Nie używaj `admin`.
- Dane logowania **wyłącznie** w middleware, w `.env`, nigdy w kodzie frontendu.
- Miniserver blokuje po serii nieudanych logowań — obsłuż to w retry, nie zapętlaj.
- Aplikacja nie wysyła żadnych komend sterujących. Tylko odczyt.

---

## 5. Architektura

```
┌──────────────────┐
│  Miniserver      │
│  192.168.1.27    │
└────────┬─────────┘
         │ HTTP poll 5 s  (v1)
         │ WebSocket      (v2, wymiana jednego modułu)
         ▼
┌──────────────────────────────────────────┐
│  middleware — Node 20 + TypeScript       │
│                                          │
│  LoxoneSource (interfejs)                │
│   ├── HttpPollSource      ← v1           │
│   └── WebSocketSource     ← v2           │
│                                          │
│  PointRegistry  ·  Cache  ·  HealthTrack │
│  HistoryStore (SQLite, pisze od dnia 1)  │
└────────┬─────────────────────────────────┘
         │ REST + SSE
         ▼
┌──────────────────────────────────────────┐
│  frontend — Vite + React + TypeScript    │
│  SVG wiązany atrybutami data-*           │
└──────────────────────────────────────────┘
```

### Zasady nienaruszalne

1. **Frontend nie wie, że Loxone istnieje.** Zna wyłącznie `/api/*`.
2. **Sposób pobierania danych jest wymienny.** `LoxoneSource` to interfejs; podmiana
   HTTP → WebSocket nie dotyka niczego poza jednym plikiem.
3. **Historia zapisuje się od pierwszego dnia**, nawet gdy UI jeszcze jej nie pokazuje.
   Czego nie zapiszemy, tego nie odzyskamy.
4. **Mapowanie id → UUID w jednym pliku.** Zmiana nazwy w Loxone Config dotyka
   jednego miejsca.

---

## 6. Kontrakt API

### `GET /api/points`

```json
[
  { "id": "A1", "label": "Magazyn · przekątna A · poziom 1", "unit": "°C",
    "kind": "temperature", "group": "pcm", "precision": 1,
    "geometry": { "diagonal": "A", "level": 1 }, "available": true }
]
```

### `GET /api/snapshot`

```json
{
  "ts": "2026-07-29T18:04:12.000Z",
  "session": { "material": "RT8HC", "label": "Test 01 — ładowanie", "startedAt": "..." },
  "values": {
    "A1": { "v": 8.4, "ts": "2026-07-29T18:04:07.000Z", "stale": false },
    "A2": { "v": 8.9, "ts": "2026-07-29T18:04:08.000Z", "stale": false },
    "METER_FLOW": { "v": null, "ts": null, "stale": true }
  },
  "health": { "source": "ok", "latencyMs": 38, "lastOkAt": "...", "staleIds": ["METER_FLOW"] }
}
```

### `GET /api/stream` — SSE

```
event: values
data: {"ts":"...","values":{"A1":{"v":8.41,"ts":"...","stale":false}}}

event: health
data: {"source":"ok","latencyMs":41,"staleIds":[]}
```

Wysyłaj **tylko zmienione punkty**. Klient scala z lokalnym stanem.
Reconnect z backoffem, po odzyskaniu połączenia pobierz `/api/snapshot`.

### `GET /api/history`

```
GET /api/history?ids=A1,A2,B1&from=2026-07-29T00:00:00Z&to=...&resolution=1m
```

**W wersji 1 zwraca:**

```json
{ "available": false, "reason": "not_implemented",
  "message": "Zbieranie historii działa, odczyt jeszcze nie" }
```

Frontend **musi już teraz obsługiwać ten kontrakt** — z przyciskiem, stanem ładowania
i stanem „niedostępne". Włączenie historii ma być zmianą wyłącznie po stronie serwera.

### `GET /api/session` · `POST /api/session`

Metadane sesji badawczej: materiał, etykieta, czas startu, notatka.
To tutaj żyje informacja `RT8HC` vs `RT57HC` — **nie w identyfikatorach punktów**.

### `GET /api/health`

Stan połączenia z Loxone, opóźnienie, lista punktów przestarzałych, czas działania.

---

## 7. Frontend — wymagania

### Widok główny: Magazyn PCM

Centralny obiekt to **przekrój zbiornika PCM z sześcioma punktami** w rozmieszczeniu
odpowiadającym rzeczywistości: dwie przekątne A i B, po trzy poziomy.

Po lewej: **pompa ciepła → bufor → magazyn**. Przepływy pokazane w czasie rzeczywistym.

### Wiązanie SVG atrybutami — decyzja architektoniczna

Schemat jest **zewnętrznym plikiem SVG**, nie kodem React. Rysunek powstaje w narzędziu
graficznym i podmienia się bez dotykania logiki.

Kontrakt wiązania:

| Atrybut | Znaczenie |
|---|---|
| `data-point="A1"` | element pokazuje wartość tego punktu (`textContent`) |
| `data-fill-point="A1"` | element barwi się według wartości punktu |
| `data-flow="pcm-loop"` | ścieżka animuje przepływ |
| `data-flow-source="METER_FLOW"` | prędkość animacji proporcjonalna do tej wartości |
| `data-state="VALVE_STATE"` | element przełącza klasę `is-active` / `is-inactive` |
| `data-stale-hide` | element chowany, gdy powiązany punkt jest przestarzały |

Implementacja: wczytaj SVG jako tekst (`import schema from './schema.svg?raw'`),
wstrzyknij, potem warstwa wiążąca robi `querySelectorAll('[data-point]')`
i aktualizuje przy każdym zdarzeniu SSE. **Bez przerysowywania całego SVG.**

Dzięki temu przebudowa grafiki to podmiana jednego pliku.

### Skala barwna — uwaga krytyczna

Zakres skali **musi pochodzić z konfiguracji sesji**, nie być zapisany na stałe.

| Materiał | Zakres skali | Pasmo przemiany |
|---|---|---|
| RT8HC | 0…20 °C | 7–9 °C |
| RT57HC | 40…75 °C | 55–58 °C |

**Zaznacz pasmo przemiany osobnym oznaczeniem** — to jest najważniejsza informacja
na całym ekranie. Punkt wewnątrz plateau znaczy coś zupełnie innego niż punkt poza nim.

Przy skali 0–100 °C cała przemiana RT8HC to jeden odcień. To błąd, który zniweczy
sens wizualizacji.

### Animacja przepływu

`stroke-dasharray` plus animowany `stroke-dashoffset`, prędkość proporcjonalna
do przepływu. **Zerowy przepływ = brak ruchu**, nie wolny ruch.
Respektuj `prefers-reduced-motion`.

### Stan przestarzały

Wartość starsza niż **3 × interwał odpytywania** oznaczana jako przestarzała.
Nie pokazuj ostatniej znanej wartości jako aktualnej. Awaria czujnika w trakcie
tygodniowego testu musi być widoczna od razu, nie odkryta przy analizie.

### Typografia i liczby

- Temperatura: jedno miejsce po przecinku
- Przepływ: trzy miejsca
- Liczby czcionką **o stałej szerokości cyfr** — inaczej wartości drgają przy zmianie
- Zawsze z jednostką

---

## 8. Widoki

### 1. Magazyn PCM — pełna implementacja

Opis powyżej. To jedyny widok zbudowany w całości.

### 2. Przebiegi — zaślepka z działającym przyciskiem

Wybór punktów, zakres czasu, **przycisk „Pobierz dane historyczne"**.
Woła `/api/history`, obsługuje odpowiedź `available: false` czytelnym komunikatem.
Cała ścieżka gotowa, brakuje tylko implementacji po stronie serwera.

### 3. Bilans energii — zaślepka

Energia z ciepłomierza, energia elektryczna z licznika kWh, wyliczony COP.
Wymaga mapy rejestrów Modbus.

### 4. Diagnostyka — implementacja lekka

Stan połączenia, opóźnienie odpytywania, lista punktów przestarzałych, czas działania,
surowe wartości w tabeli. **Zbuduj ten widok wcześnie** — będzie potrzebny do debugowania
całej reszty.

### 5. Sesje badawcze — zaślepka

Start i koniec sesji, materiał, notatki, znaczniki zdarzeń („napełniono", „start ładowania",
„zauważono kawernę"). To jest realna wartość dla R&D — bez adnotacji dane po dwóch
tygodniach są nieczytelne.

### 6. Ustawienia — implementacja lekka

Podgląd rejestru punktów, mapowanie id → UUID, zakresy skal, interwał odpytywania.
Tylko do odczytu w wersji 1.

---

## 9. Stos technologiczny

**Middleware:** Node 20+, TypeScript, Fastify, `better-sqlite3`, `zod` do walidacji
konfiguracji, `pino` do logów.

**Frontend:** Vite, React 18, TypeScript. Bez ciężkiego frameworka UI.
Wykresy dopiero wtedy, gdy będzie historia — nie dokładaj biblioteki na zapas.

**Monorepo:** `server/` i `web/`, wspólne typy w `shared/`.

---

## 10. Kolejność budowy

1. **Middleware wypisujący 6 temperatur do konsoli.** Dopóki to nie działa, nic innego
   nie ma sensu.
2. `/api/points` i `/api/snapshot`
3. `/api/stream` (SSE)
4. Zapis do SQLite
5. **Widok Diagnostyka** — surowa tabela wartości
6. Warstwa wiążąca SVG i widok główny
7. Zaślepki pozostałych widoków
8. `/api/history` — dopiero na końcu

---

## 11. Czego nie robić

- **Nie umieszczaj danych logowania do Loxone w kodzie frontendu.** Nigdy, także w prototypie.
- **Nie pisz obsługi WebSocket Loxone od zera.** Dzień pisania, tydzień debugowania.
- **Nie zaczynaj od schematu.** Zacznij od liczb w konsoli.
- **Nie pokazuj zera dla brakującej wartości.** Brak danych to brak danych.
- **Nie zapisuj identyfikatorów punktów z nazwą materiału.** Materiał należy do sesji.
- **Nie wysyłaj żadnych komend do Loxone.** Ta aplikacja tylko czyta.
- **Nie zapisuj na stałe objętości zbiorników ani zakresów skal.** Konfiguracja.
- **Nie dodawaj biblioteki wykresów, dopóki nie ma danych historycznych.**

---

## 12. Otwarte pytania

1. Czy poziom 1 to dół zbiornika?
2. Objętość magazynu: 200 l czy 80 l — który element jest który?
3. Mapa rejestrów Modbus ciepłomierza — kiedy będzie?
4. Czy licznik mocy kWh idzie po Modbus, czy impulsowo na wejście cyfrowe?
5. Czy aplikacja ma kiedyś być dostępna zdalnie, czy tylko w LAN laboratorium?
   To wpływa na uwierzytelnianie — na razie zakładam LAN.
