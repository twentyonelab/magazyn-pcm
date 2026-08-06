# Entalvia — notatka dla Claude Code

Ten plik wczytuje się sam na starcie każdej rozmowy w tym katalogu. Trzymamy tu
wiedzę, której **nie da się odczytać z kodu w rozsądnym czasie**: pułapki, które
już raz kosztowały, i decyzje, których powód nie jest widoczny w składni.
Wszystko, co widać z `git log` albo z komentarza w pliku, tu nie należy.

## Co to jest

Aplikacja do monitorowania magazynu ciepła/chłodu na materiale zmiennofazowym
(PCM). Jedno prawdziwe stanowisko badawcze — Politechnika Śląska, Gliwice,
ul. Kaszubska 26 — plus dwadzieścia **wymyślonych** punktów pokazowych na mapie
Śląska. Dane płyną z Miniservera Loxone.

Punkt pokazowy nigdy nie może wyglądać jak działający czujnik. To najgorszy
rodzaj kłamstwa w takim narzędziu i cały interfejs jest pod to podporządkowany.

## Układ

Monorepo na przestrzeniach roboczych npm:

- `server/` — Fastify, `tsx` uruchamia TypeScript bez kompilacji. Port **4000**.
- `web/` — Vite + React 18.
- `shared/` — wspólne typy, eksportowane jako **źródło `.ts`**, nie build.
- `narzedzia/` — skrypty pomocnicze (patrz niżej: schemat).

```bash
npm run dev --workspace @magazyn-pcm/server
```

## Pułapki, które już raz kosztowały

**Node 24 jest wymagany, nie zalecany.** `better-sqlite3` to moduł natywny i na
Node 20 wysypuje się przez SIGSEGV (kod wyjścia 139) — bez czytelnego błędu.
`engines.node` w korzeniu jest przypięty do `24.x`, bo Railpack czyta właśnie
stamtąd i sam wybrałby 20.

**Port 4000 podaje `web/dist`, nie źródła.** Po zmianie w `web/` trzeba
przebudować, inaczej w przeglądarce widać starą wersję i człowiek szuka błędu
w kodzie, który jeszcze nie działa:

```bash
npm run build --workspace @magazyn-pcm/web
```

**UUID-y Loxone zmieniają się przy przebudowie konfiguracji.** `points.config.ts`
jest jedynym źródłem prawdy dla mapowania punktów. Gdy punkty milkną, porównuj
**po nazwie kontrolki**, nie po UUID, i czytaj pole `valueUuid` z
`data/loxone/kontrolki.json` (nie `uuid` — takiego pola tam nie ma).

Najgorszy przypadek nie jest cichy: 2026-08-03 stare UUID-y ciepłomierza źródła
zaczęły należeć do ciepłomierza **odbioru**, więc dwa punkty dalej pokazywały
liczby — tylko z niewłaściwego obiegu. Zła dana udająca dobrą jest niewidoczna
na ekranie. Zawsze sprawdzaj, czy wartość jest **sensowna dla stanu instalacji**,
a nie tylko czy jest.

**„Heat storage capacity" z karty Rubitherm NIE JEST ciepłem utajonym.** Ta
pozycja to — karta mówi to wprost — *combination of latent and sensible heat*
w podanym przedziale temperatur (8HC: 190 kJ/kg w 1–15 °C, 57HC: 240 kJ/kg
w 49–64 °C). Model entalpii w `soc.ts` dokłada ciepło jawne osobno, z `cp`, więc
wstawienie tam pojemności całkowitej liczy je **dwa razy**. Utajone trzeba
wyliczyć: pojemność − `cp` × szerokość przedziału → 162 i 210 kJ/kg.

**Naładowanie ma JEDNO źródło i to nie jest oczywiste z kodu.** Ta sama liczba
pokazuje się w trzech miejscach (pinezka na mapie, belka nad schematem, pasek
pod zbiornikiem). Do 2026-08-04 config belki miał własne `cieploPrzemiany`
i `cp`, a profil z serwera własne — przy tej samej średniej 8,5 °C wychodziło
29 % i 31 %. Parametry entalpii idą teraz **wyłącznie** z `MaterialProfile`,
a procent liczy **wyłącznie** `procentSoc` (zaokrąglenie w dół; własny
`Math.round` w jednym miejscu dawał różnicę o punkt).

**Pasmo przemiany na wykresach idzie za STANOWISKIEM, nigdy za sesją czy
stałą domyślną.** Reguła użytkownika (2026-08-06, po trzeciej poprawce tego
samego błędu): w magazynie ciepła pasmo ma być ZAWSZE 53–58 °C, w magazynie
chłodu ZAWSZE 7–9 °C. Hierarchia materiału w każdym widoku wewnątrz
stanowiska: `materialStanowiska` (z `otwarty.typ`) > sesja > detekcja sond >
domyślna. Błąd wracał, bo trzy wykresy (Przebiegi, WykresMagazynu,
Magazyn3D) liczyły materiał osobno i zaczynały od sesji — a niezamknięta
sesja z 8HC (D8) malowała pasmo chłodu na wykresach ciepła. Przy dodawaniu
NOWEGO wykresu z pasmem: nie licz materiału na miejscu, weź `profil`
z widoku-rodzica, który już ma stanowisko na szczycie.

**`web/src/schema/schema.svg` jest generowany.** Powstaje z wektora projektanta
przez `narzedzia/wepnij-kontrakt.mjs`, który nakłada na niego kontrakt aplikacji
(atrybuty `data-*`). Ręczna edycja ginie przy następnym uruchomieniu narzędzia.
Ten sam plik karmi scenę 3D przez `extractScene.ts`.

## Pułapki CSS w tym arkuszu

**`backdrop-filter` tworzy korzeń tła.** Dziecko elementu z filtrem nie ma już
czego rozmywać. Efekt szkła musi siedzieć na **rodzeństwie**, nie na potomku —
to zajęło trzy podejścia i za każdym razem wyglądało na „nie działa".

**Barwa idzie za nośnikiem przez `data-kierunek` na korzeniu dokumentu.**
`:root` bez tego atrybutu znaczy **przegląd** (mapa i lista) i jest neutralny.
Ciepło i chłód mają własne bloki. `[data-theme]` i `[data-kierunek]` mają tę samą
wagę (0,2,0), więc o wspólnych zmiennych decydowałaby kolejność w pliku —
potrzebne są selektory z **dwoma** atrybutami (0,3,0).

**Element siatki nie zwęża się sam.** Domyślne `min-width: auto` sprawia, że
karta z szeroką tabelą rozpycha tor siatki, a `overflow-x: auto` w środku nigdy
się nie włącza. Stąd `.stack > * { min-width: 0 }`.

**Nie da się przyciemnić podpisów miast w stylu Mapbox Standard.** Ten styl jest
*importem*: warstwy widać w `getStyle().imports[0].data.layers`, ale `getLayer()`
zwraca `undefined`, a `setPaintProperty` zgłasza błąd przez **zdarzenie**, nie
wyjątek — więc brak wyjątku nie znaczy sukcesu.

**Znak Mapboxa i atrybucja muszą zostać.** Licencja wymaga ich przy ich stylach
i danych. Ukrycie w dowolnej formie to naruszenie. Usunięcie legalnie = zmiana
źródła mapy na MapLibre z kaflami OSM.

## Wdrożenie

Railway, region EU West. **Push na `master` wdraża sam** — nie ma osobnego kroku.
Sonda żywotności to `/api`, nie `/api/health`: to drugie zwraca 503, gdy Loxone
nie odpowiada, co dla sondy liveness jest błędem (aplikacja żyje, źródło nie).

Adresy: strona o produkcie https://entalvia.eu, aplikacja https://app.entalvia.eu,
surowy adres Railway https://magazyn-pcmserver-production.up.railway.app.
DNS domeny obsługuje **Cloudflare**, nie home.pl — jak to jest spięte i dlaczego
wierzchołek domeny musi być proxowany, opisuje `docs/DOMENY-I-DNS.md`.

Brama hasła jest **włączona** (`AUTH_ENABLED` i `AUTH_PASSWORD_HASH` w zmiennych
Railway). Lokalnie zostaje wyłączona celowo: w sieci laboratorium dodatkowy ekran
przed pracą przy stanowisku tylko przeszkadza.

## Kody diagnostyczne (D1–D7)

Widok Diagnostyka pokazuje usterki jednym zdaniem z kodem — kod służy
rozmowie („mam D6"), pełny mechanizm jest tu. Numeracja jest STAŁA: kod raz
nadany nie zmienia znaczenia; nowe komunikaty dostają kolejne numery.

- **D1** — Miniserver zgłasza błąd; treść przychodzi z serwera (`health.message`).
- **D2** — zbiornik nierozpoznany: `BankDetector` nie umie wskazać zestawu sond,
  skala barwna może nie pasować do parafiny.
- **D3** — zbiornik wymuszony przez `FORCE_BANK` w `.env` — po wymianie
  zbiornika trzeba zmienić ręcznie.
- **D4** — punkty bez UUID-ów: uruchom `npm run uuid` w sieci laboratorium
  i uzupełnij `server/src/points.config.ts`.
- **D5** — konfiguracja Loxone zmieniła się od startu aplikacji; UUID-y mogą
  wskazywać inne kontrolki (patrz pułapka wyżej: zła dana udająca dobrą).
- **D6** — pogoda ze sterownika zwraca same zera (także 0 hPa, które nie
  istnieje): usługa pogodowa Loxone nie ma zapisanej lokalizacji projektu
  w Miniserverze. Ustawić lokalizację w Loxone Config i ZAPISAĆ do sterownika;
  aplikacja przełączy źródło sama. Do tego czasu kafelek używa Open-Meteo.
- **D7** — przeglądarka nie ma łączności z serwerem aplikacji.
- **D8** — **sesja deklaruje inną parafinę niż rozpoznały sondy.** Sesja ma
  pierwszeństwo nad detekcją (badacz deklaruje, co bada), więc niezamknięta
  sesja po wymianie zbiornika przestawia cały bilans na złą pojemność i złą
  skalę barwną. Wykryte 2026-08-05: sesja z 3.08 mówiła 8HC (3,25 kWh), gdy
  sondy siedziały już w 57HC (4,28 kWh). Naprawa: zakończyć sesję w widoku
  Sesje. To ten sam gatunek błędu co podmienione UUID-y — liczba wygląda
  poprawnie i opisuje inny obiekt.

## Zasada weryfikacji

Brak wyjątku **nie jest** dowodem, że coś zadziałało. W tym projekcie ta pomyłka
powtórzyła się kilka razy: rozmycie szkła, przyciemnianie podpisów mapy, tło za
nośnikiem. Sprawdzaj skutek na ekranie albo pomiarem w żywej stronie, a gdy nie
możesz — powiedz to wprost, zamiast domykać zdanie słowem „gotowe".

## Do zrobienia

- Osobny token Mapbox: tylko do czytania, ograniczony do adresu (teraz również
  do `entalvia.eu` i `app.entalvia.eu`).
- Kopie zapasowe z wolumenu Railway.
- **Lokalizacja Miniservera do zapisania.** 2026-08-04 w projekcie pojawił się
  pokój „Otoczenie" z czterema kontrolkami usługi pogodowej Loxone (temperatura,
  wilgotność, ciśnienie, pył); ich UUID-y są już w `points.config.ts`. Wszystkie
  odpowiadają HTTP 200 i **zerem**, bo `msInfo.latitude`/`longitude` w zapisanym
  projekcie nadal wynoszą 0 — usługa nie ma dla czego liczyć pogody. Zostaje
  ustawić lokalizację (Gliwice, Kaszubska 26) i **zapisać** konfigurację; w
  kodzie nic się wtedy nie zmienia, źródło przełączy się samo. `weather.ts`
  odrzuca zestaw zer jawnie: sprawdzenie „czy punkt odpowiada" nie jest
  sprawdzeniem „czy mierzy".
- **Ciepłomierz odbioru jest już kompletny** (2026-08-04): doszły kanały
  `ODBIOR_Przeplyw`, `ODBIOR_Moc`, dwie energie i kod błędu. Doszła też
  `ZRODLO_Moc`, czyli `METER_POWER` przestał być pusty. Otwarte zostaje jedno:
  **oba liczniki energii odbioru zwracają −0,640**, a ujemna energia zsumowana
  to objaw odwrotnego montażu (AXIOMA 0002), nie wynik pomiaru. Nie licz na
  tych punktach bilansu, dopóki znak się nie wyprostuje.
- Ciepłomierz AXIOMA: błąd 0002 (montaż odwrotny). Milczące kanały Modbus już
  nie milczą — 2026-08-04 okazało się, że to były **uprawnienia konta
  `pcm-odczyt` do pomieszczeń** w Loxone, nie zasilanie licznika. Objaw był
  mylący: Miniserver zwracał 403 dla pojedynczych punktów, a aplikacja
  pokazywała je jako „przestarzałe", bo 403 nie jest błędem logowania.
  Przy milczącym punkcie sprawdzaj najpierw dostęp konta do pomieszczenia.
