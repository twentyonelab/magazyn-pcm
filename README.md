# Magazyn PCM — wizualizacja stanowiska badawczego

Aplikacja odczytuje i pokazuje dane ze stanowiska badawczego magazynu ciepła
i chłodu na materiale zmiennofazowym (PCM). Dane pochodzą z **Loxone Miniserver
Compact** w sieci laboratorium.

> **Ta aplikacja tylko czyta.** Nie wysyła do Loxone żadnych komend sterujących.
> Konfiguracja sprzętu pozostaje w Loxone Config.

> **Kod musi leżeć na dysku lokalnym** (`C:\Users\...`), nigdy na Google Drive.
> Strumieniowany dysk psuje dowiązania monorepo, blokuje pliki przy instalacji
> i grozi uszkodzeniem bazy danych.

---

## Jak uruchomić

### Pierwszy raz

```bash
npm install
```

Potem skopiuj plik konfiguracyjny i uzupełnij go:

```bash
copy .env.example .env
```

### Praca bez laboratorium (dane syntetyczne)

W pliku `.env` zostaw `LOXONE_SOURCE=mock` i uruchom:

```bash
npm run dev
```

Startuje serwer **i** interfejs. W konsoli pojawi się tabela sześciu
temperatur odświeżana co 5 sekund, a pod adresem **http://localhost:5173**
zobaczysz widok Diagnostyka. Liczby są syntetyczne — służą do pracy nad
aplikacją, gdy nie ma dostępu do stanowiska.

Żeby uruchomić tylko serwer, bez interfejsu: `npm run dev:server`.

### Praca z prawdziwym Miniserverem

1. W **Loxone Config** założ **dwa** konta — patrz „Konta w Loxone" poniżej:
   `pcm-odczyt` (tylko odczyt, to ono idzie do `.env`) i `pcm-sterowanie`
   (na przyszłość, hasło zostaje poza projektem). Nie używaj konta `admin`.
   Uwaga: zapis konfiguracji **restartuje Miniserver** — zrób to, gdy nie
   trwa test, i załóż oba konta przy jednym podejściu.
2. Uzupełnij `.env`:
   ```
   LOXONE_SOURCE=http
   LOXONE_USER=nazwa_uzytkownika
   LOXONE_PASS=haslo
   ```
3. Będąc w sieci laboratorium, pobierz UUID-y punktów pomiarowych:
   ```bash
   npm run uuid
   ```
   Skrypt sprawdza uwierzytelnianie, wypisuje wszystkie kontrolki, zapisuje je
   do `data/loxone/` — i **dopasowuje sondy magazynu do punktów rejestru
   po nazwie**, pokazując przy każdej odczyt kontrolny.
4. Jeśli dopasowanie się zgadza, pozwól skryptowi wpisać UUID-y:
   ```bash
   npm run uuid -- --zapisz
   ```
   Kopia rejestru powstaje automatycznie przed zapisem. Ręczne wklejanie
   do [`server/src/points.config.ts`](server/src/points.config.ts) też działa.
5. Uruchom serwer:
   ```bash
   npm run dev
   ```

#### Konta w Loxone

| Konto | Uprawnienia | Gdzie jest hasło |
|---|---|---|
| `pcm-odczyt` | tylko odczyt (wizualizacja sond, bez sterowania) | w `.env`, na maszynie zbierającej |
| `pcm-sterowanie` | z prawem sterowania | **poza projektem** — do użycia, gdy sterowanie będzie potrzebne |

Oba zakłada się **przy jednym podejściu do Loxone Config**, bo zapis
konfiguracji restartuje Miniserver — drugi restart mógłby wypaść w środku
wielotygodniowego testu. Przejście na sterowanie będzie wtedy zmianą jednej
linii w `.env`, bez dotykania sterownika.

**Dlaczego aplikacja nie używa konta z prawem sterowania, choć ono istnieje.**
Ta aplikacja tylko czyta — `LoxoneClient` nie ma i nie może mieć metody
wysyłającej komendę. Konto sterujące w `.env` znaczyłoby, że literówka
w adresie albo błąd w kodzie mogą przestawić zawór lub pompę w trakcie testu.
To nie byłaby zepsuta aplikacja, a **nieważne wyniki badawcze bez śladu, skąd
się wzięły**. Różnica ciężaru wycieku też jest realna: hasło odczytu to ktoś,
kto widzi temperatury; hasło sterowania to ktoś, kto może ruszyć instalacją.

Gdy sterowanie stanie się potrzebne, wchodzi ono nową ścieżką — osobnym
modułem obok `LoxoneClient`, z własnym kontem i jawnym potwierdzeniem
w interfejsie. Nie przez rozszerzenie warstwy odczytu.

#### Konwencja nazw sond w Loxone Config

Dopasowanie działa, gdy nazwa kontrolki zawiera **poziom i przekątną**.
Rozpoznawane są oba zapisy, a oznaczenie materiału jest pomijane:

| Nazwa w Loxone | Punkt |
|---|---|
| `1A_57HC`, `1A`, `A1`, `Zbiornik 1A` | `A1` |
| `3B_57HC`, `3B`, `B3` | `B3` |

Nazwa służy **tylko do dopasowania** — mapowanie trzyma UUID. Zmiana nazwy
w Loxone Config (np. przy przejściu na inny materiał: `1A_8HC`) nie zmienia
UUID-a, więc nie psuje mapowania. Gdyby aplikacja opierała się na nazwach,
przestałaby widzieć sondy po zwykłym przemianowaniu.

Skrypt odmówi zgadywania, gdy do jednej pozycji pasuje kilka kontrolek —
wypisze je i poprosi o rozstrzygnięcie.

Na Windowsie można też uruchomić dwuklikiem plik `start.cmd` — ustawia
kodowanie UTF-8, żeby polskie znaki i `°C` wyświetlały się poprawnie.

---

## Co już działa

- Rejestr 18 punktów pomiarowych — jedno źródło prawdy dla całej aplikacji
- Odczyt z Miniservera przez HTTP, co 5 s, z bezpieczną obsługą błędów
- Źródło syntetyczne do pracy bez laboratorium
- Tabela temperatur w konsoli
- Zapis pomiarów do SQLite (historia zbiera się od pierwszego dnia)
- Strumień zmian do przeglądarki (SSE) z automatycznym wznawianiem
- Widok **Magazyn PCM**: schemat instalacji, sondy barwione według temperatury,
  zaznaczone pasmo przemiany fazowej
- Widok **Magazyn 3D**: ta sama instalacja przestrzennie (Three.js), układ
  czytany z tego samego pliku schematu
- Widok **Przebiegi**: wykres historii z pasmem przemiany i znacznikami
  zdarzeń sesji, tabela statystyk, eksport CSV
- Widok **Sesje**: start/koniec sesji badawczej, parafina, notatki, znaczniki
  zdarzeń („napełniono", „start ładowania", „zauważono kawernę")
- Przełącznik parafiny **8HC / 57HC** — decyduje o skali barwnej i pasmie
  przemiany; w trakcie sesji zablokowany, bo parafina należy do sesji
- Logowanie do aplikacji (domyślnie wyłączone, na dostęp z zewnątrz)
- Widok **Bilans**: świadoma zaślepka — mówi, czego brakuje (mapa rejestrów
  Modbus, zasilanie 24 VDC) i policzy COP, gdy ciepłomierz zacznie raportować
- Widok **Diagnostyka**: stany łączności, surowe wartości, punkty przestarzałe
- Widok **Ustawienia**: konfiguracja serwera (odczyt), mapowanie id → UUID,
  profile materiałów, przełączniki opcji interfejsu
- Bariera błędów: awaria jednego widoku nie wygasza aplikacji
- Endpointy: `/api/points`, `/api/snapshot`, `/api/stream`, `/api/materials`,
  `/api/health`, `/api/config`, `/api/session` (+ `end`, `events`),
  `/api/sessions`, `/api/history`, `/api/history.csv`

### Plan bazowy — zrealizowany w całości

| # | Krok | Stan |
|---|---|---|
| 1 | Middleware — 6 temperatur w konsoli | gotowe |
| 2 | `/api/points` i `/api/snapshot` | gotowe |
| 3 | `/api/stream` (SSE) | gotowe |
| 4 | Zapis do SQLite | gotowe |
| 5 | Widok Diagnostyka | gotowe |
| 6 | Warstwa wiążąca SVG i widok Magazyn PCM | gotowe |
| 7 | Pozostałe widoki | gotowe |
| 8 | `/api/history` | gotowe (odczyt z SQLite, nie zaślepka) |

Do pierwszych prawdziwych danych brakuje wyłącznie kroków w laboratorium:
konto tylko-do-odczytu w Loxone Config, `npm run uuid`, wpisanie UUID-ów
do rejestru punktów.

### Sesje badawcze

Materiał (RT8HC / RT57HC) jest atrybutem **sesji**, nie punktu pomiarowego.
Sesje i ich znaczniki zapisują się w `data/sesje.json` (osobno od bazy
pomiarów, celowo — plik czyta się i naprawia ręcznie). Znaczniki zdarzeń
pojawiają się na wykresach w Przebiegach.

### Jak podmienić schemat instalacji

Rysunek to **zewnętrzny plik** [`web/src/schema/schema.svg`](web/src/schema/schema.svg).
Można go przerysować w dowolnym narzędziu graficznym i podmienić — logika
aplikacji się nie zmienia. Warunek jest jeden: zachować atrybuty `data-*`.

| Atrybut | Co robi |
|---|---|
| `data-point="A1"` | element pokazuje wartość punktu jako tekst |
| `data-unit="°C"` | jednostka dopisywana po wartości |
| `data-fill-point="A1"` | element barwi się według temperatury |
| `data-flow="pcm-supply"` | ścieżka animuje przepływ |
| `data-flow-source="METER_FLOW"` | prędkość animacji z tej wartości |
| `data-state="VALVE_STATE"` | element dostaje klasę `is-active` / `is-inactive` / `is-unknown` |
| `data-stale-hide` | element chowany, gdy wartość jest przestarzała |
| `data-sensor="A1"` | grupa reaguje na kursor i pokazuje podpowiedź |

Warstwa wiążąca ([`web/src/schema/bindSchema.ts`](web/src/schema/bindSchema.ts))
po każdym zdarzeniu SSE odnajduje te elementy i aktualizuje im tekst,
wypełnienie i klasy. Rysunek nie jest przerysowywany.

#### Widok 3D czyta ten sam plik

Scena trójwymiarowa **nie ma własnego układu** — bierze współrzędne z tego
samego SVG ([`web/src/schema/extractScene.ts`](web/src/schema/extractScene.ts)),
więc oba widoki nie mogą się rozjechać. Bryły opisują dodatkowe atrybuty:

| Atrybut | Co robi |
|---|---|
| `data-object="storage"` | prostokąt staje się bryłą w scenie 3D |
| `data-label="Magazyn PCM"` | podpis bryły |
| `data-h="8"` | wysokość bryły w jednostkach świata |
| `data-vessel="true"` | zbiornik: przejrzysty, z sondami w środku |

Prostokąt bez `data-object` jest w 3D pomijany — jest tylko dekoracją rysunku.

Jedno celowe odstępstwo: rysunek 2D jest **przekrojem**, więc pionowa pozycja
sondy oznacza tam poziom. W 3D pion jest prawdziwą wysokością, dlatego sondy
w zbiorniku dostają wysokość z poziomu (1 dół, 3 góra), a położenie w rzucie
z przekątnej A/B — dokładnie jak we wstawce „rzut z góry". Rozmieszczenie
urządzeń i przebieg rur pozostają wierne rysunkowi.

> **Uwaga przy edycji SVG:** widok 3D czyta plik **ścisłym parserem XML**.
> Rzecz, która wywróciła to raz: `<!-- ---- opis ---- -->` jest w XML błędem,
> bo podwójny dywiz w komentarzu jest zabroniony. Widok 2D to tolerował,
> a scena 3D po cichu gubiła połowę obiektów. Teraz przy takim błędzie
> w konsoli przeglądarki pojawia się ostrzeżenie — ale lepiej go nie tworzyć.

Skala barwna i pasmo przemiany pochodzą z profilu materiału
w [`server/src/materials.config.ts`](server/src/materials.config.ts) — nie
z kodu widoku. Zmiana zakresu to zmiana jednej liczby w konfiguracji.

### Zbieranie danych bez przerw

Uśpiony laptop nie odpytuje Miniservera. Każde uśpienie to **dziura
w danych badawczych**, a dziura nie zgłasza się sama — zostaje w bazie i wychodzi
dopiero przy analizie. Poniżej cztery kroki, żeby zbierać dane także przy
zamkniętej pokrywie.

**1. Zasilanie.** Podłącz laptopa do zasilacza i uruchom (dwuklik):

```
narzedzia\zasilanie-tryb-pomiarowy.cmd
```

Skrypt pokazuje, co zmieni, i czeka na potwierdzenie. Ustawia: uśpienie
i hibernacja **nigdy**, zamknięcie pokrywy **nic nie rób** — wszystko tylko
na zasilaczu, na baterii nic się nie zmienia. Ekran dalej gaśnie po 10 minutach,
bo to nie przerywa pracy. Po zakończeniu testu przywróć zwykłe ustawienia:
`narzedzia\zasilanie-tryb-zwykly.cmd`.

**2. Sieć.** Karta Wi-Fi bywa usypiana niezależnie od reszty komputera.
Menedżer urządzeń → karta sieciowa → Właściwości → Zarządzanie energią →
odznacz „Zezwalaj komputerowi na wyłączanie tego urządzenia". W laboratorium
najpewniejszy jest **kabel Ethernet** — jedno mniej źródło przerw.

**3. Autostart.** Żeby zbieranie wstawało samo:

```
narzedzia\autostart-wlacz.cmd
```

Wkłada skrót do folderu Autostart — nie wymaga uprawnień administratora.
Ograniczenie, które trzeba znać: po restarcie komputera (na przykład po
aktualizacji Windows) zbieranie ruszy dopiero **po zalogowaniu**. Jeśli test
ma przeżyć restart bez obecnosci człowieka, zarejestruj zadanie systemowe —
w terminalu **uruchomionym jako administrator**:

```bash
schtasks /create /tn "Magazyn PCM - zbieranie" /tr "\"C:\Users\kbogo\dev\magazyn-pcm\narzedzia\zbieranie.cmd\"" /sc onstart /ru SYSTEM /rl HIGHEST /f
```

Usunięcie: `schtasks /delete /tn "Magazyn PCM - zbieranie" /f`.

Do samego zbierania (bez przeładowywania po zmianie plików, z automatycznym
podniesieniem serwera po awarii) służy:

```
narzedzia\zbieranie.cmd
```

**4. Sprawdź, czy zadziałało.** Po dobie:

```bash
npm run przerwy
```

Skrypt wypisuje wszystkie przerwy w danych, ich długość i **dostępność
w procentach**. To jedyny sposób, żeby wiedzieć, że zbieranie naprawdę było
ciągłe — zamiast zakładać, że było.

> **Uczciwie o granicach.** Laptop z zamkniętą pokrywą wystarczy na test
> kilkudniowy. Do wielotygodniowych zostaw w laboratorium tani mini-PC albo
> Raspberry Pi na stałe: nie ma pokrywy, nie ma baterii, nie ma pytania,
> czy ktoś go nie zabrał na spotkanie.

### Dostęp z zewnątrz i logowanie

W sieci laboratorium aplikacja **nie ma logowania** — celowo, bo dodatkowy ekran
przed danymi dostępnymi tylko z LAN byłby przeszkodą bez zysku. Zanim udostępnisz
ją z zewnątrz (tunel, publiczny adres IP), **włącz bramę**:

```bash
npm run haslo -- "twoje hasło"
```

Skrypt wypisze dwie linie do wklejenia w `.env`. Hasła nie zapisujemy nigdzie —
w pliku trafia wyłącznie hash `scrypt`, z którego nie da się go odtworzyć.
Przy dostępie po HTTPS dodaj jeszcze `AUTH_COOKIE_SECURE=true`.

Co brama obejmuje i dlaczego tak:

- **Całe `/api`, także strumień SSE.** Gdyby chronione były tylko zwykłe
  endpointy, strumień wartości oddawałby wszystkie pomiary bez hasła.
- **Jedno hasło, nie konta użytkowników.** Stanowisko obsługuje dwuosobowe
  studio; baza użytkowników z rolami byłaby tu aparaturą bez zastosowania.
- **Token sesji jest podpisany, nie przechowywany.** Restart serwera w trakcie
  tygodniowego testu nikogo nie wylogowuje.
- **Opóźnienie po nieudanej próbie rośnie wykładniczo** (1 s, 2 s, 4 s… do 60 s)
  osobno dla każdego adresu. Nie blokujemy na stałe — odcięcie sobie dostępu
  do własnych danych w środku testu byłoby gorsze niż samo zgadywanie.
- **Zbieranie danych działa niezależnie od logowania.** Serwer odpytuje
  Miniserver i zapisuje pomiary także wtedy, gdy nikt nie patrzy.

> Nawet przełamanie tej bramy nie daje sterowania instalacją — aplikacja
> fizycznie nie potrafi wysłać komendy do Loxone. Logowanie chroni dane
> badawcze i metadane sesji.

#### Sieć laboratorium: router z kartą SIM

Stanowisko ma własny router z kartą SIM, na stałe na miejscu. Co to znaczy
praktycznie:

- **Zbieranie danych nie zużywa transmisji.** Serwer odpytuje Miniserver
  po sieci lokalnej — pakiety nie wychodzą do operatora. Nawet przy odczycie
  co 5 sekund przez miesiąc rachunek za SIM się nie ruszy.
- **Karta SIM jest potrzebna tylko do Twojego zdalnego wglądu**, nie do pracy
  stanowiska. Zerwany zasięg zatrzymuje podglądanie, nie pomiary.
- **Dostęp z zewnątrz zwykle nie zadziała wprost.** Operatorzy komórkowi
  najczęściej dają adres za wspólnym NAT-em, więc nie da się „wejść" do
  routera z internetu bez publicznego adresu IP albo tunelu. Do samego
  Miniservera zostaje Loxone Remote Connect
  (`dns.loxonecloud.com/504F94D0A3E3`), bo to on wychodzi na zewnątrz, nie
  odwrotnie. Podgląd tej aplikacji zdalnie wymagałby osobnej decyzji —
  wtedy dochodzi uwierzytelnianie, którego dziś celowo nie ma.

### Kopia zapasowa danych

Baza pomiarów i plik sesji leżą na jednym dysku lokalnym i celowo **nie są
w repozytorium** (to dane, nie kod). Dla wielotygodniowego testu jedyny
egzemplarz to żaden egzemplarz:

```
narzedzia\kopia-danych.cmd "G:\Mój dysk\kopie magazyn PCM"
```

Bez argumentu kopiuje do katalogu `kopie\` w projekcie. Bazę kopiuje
poleceniem SQLite `.backup`, nie zwykłym kopiowaniem pliku — w trybie WAL
część świeżych zapisów siedzi w pliku `-wal`, więc skopiowanie samego `.db`
mogłoby dać bazę bez ostatnich pomiarów.

### Podglądanie zebranych danych

```bash
npm run baza
```

Wypisuje, ile pomiarów jest w bazie, z jakiego okresu i w jakim zakresie
wartości — osobno dla każdego punktu. Można to uruchomić w trakcie trwającego
testu, odczyt nie blokuje zapisu.

---

## Struktura projektu

```
shared/          typy wspólne dla serwera i frontendu (kontrakt API)
server/
  src/
    points.config.ts     REJESTR PUNKTÓW — tu wpisuje się UUID-y
    materials.config.ts  profile PCM: zakresy skal, pasma przemiany
    config.ts            walidacja .env
    registry.ts          dostęp do rejestru + kontrola spójności
    cache.ts             bieżące wartości i wykrywanie przestarzałych
    health.ts            stan łączności ze źródłem
    console-view.ts      tabela temperatur w konsoli
    stream.ts            strumień zmian do przeglądarki (SSE)
    loxone/
      source.ts            INTERFEJS źródła danych — granica wymienności
      client.ts            komunikacja i uwierzytelnianie (jedyne miejsce)
      http-poll-source.ts  odpytywanie HTTP (v1)
      mock-source.ts       dane syntetyczne
    history/
      store.ts             interfejs zapisu historii
      sqlite-store.ts      zapis do bazy SQLite
      ndjson-store.ts      zapis do pliku (wyjście awaryjne)
    api/routes.ts        endpointy REST i SSE
    scripts/
      fetch-uuids.ts       pobiera UUID-y z Miniservera
      db-summary.ts        podsumowanie zebranych pomiarów
web/
  src/
    useLiveData.ts     dane na żywo: snapshot + SSE + wznawianie
    api.ts             dostęp do /api/*
    format.ts          formatowanie liczb, wiek i stan wartości
    views/Diagnostyka.tsx
docs/            specyfikacja, schemat instalacji, język wizualny
data/            dane pomiarowe i zrzuty z Miniservera (poza repozytorium)
```

---

## Rzeczy, które łatwo zepsuć

- **Nie zmieniaj pól `id` w rejestrze punktów** po rozpoczęciu zbierania
  danych — historia jest do nich przypisana na zawsze.
- **Nie uruchamiaj `npm run uuid` w pętli** przy błędnym haśle. Miniserver
  blokuje konto po serii nieudanych logowań. Serwer sam się zatrzymuje przy
  odrzuconym logowaniu właśnie dlatego.
- **Brak wartości to `null`, nigdy `0`.** Zero na wykresie temperatury
  to kłamstwo.
- **Plik `.env` nie trafia do repozytorium.** Hasło do Miniservera nie ma
  prawa znaleźć się ani w kodzie, ani na dysku współdzielonym.
