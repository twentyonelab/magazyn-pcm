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

Adres: https://magazyn-pcmserver-production.up.railway.app

## Zasada weryfikacji

Brak wyjątku **nie jest** dowodem, że coś zadziałało. W tym projekcie ta pomyłka
powtórzyła się kilka razy: rozmycie szkła, przyciemnianie podpisów mapy, tło za
nośnikiem. Sprawdzaj skutek na ekranie albo pomiarem w żywej stronie, a gdy nie
możesz — powiedz to wprost, zamiast domykać zdanie słowem „gotowe".

## Do zrobienia

- **Hasło na Railway.** Brama i ekran startowy stoją na `master`, hash leży
  w lokalnym `.env`. Adres publiczny zostaje OTWARTY, dopóki `AUTH_ENABLED`,
  `AUTH_PASSWORD_HASH` i `AUTH_COOKIE_SECURE=true` nie zostaną ustawione
  w panelu Railway — plik `.env` tam nie dochodzi. Lokalnie brama jest
  wyłączona celowo: w sieci laboratorium tylko przeszkadza.
- Osobny token Mapbox: tylko do czytania, ograniczony do adresu.
- Kopie zapasowe z wolumenu Railway.
- `METER_POWER` nie istnieje w Miniserverze — mocy chwilowej nie ma czym podać.
- Ciepłomierz **odbioru** ma w Loxone tylko dwie temperatury i ΔT. Brakuje
  przepływu i energii — do dołożenia jako kanały Modbus w Loxone Config.
- Ciepłomierz AXIOMA: błąd 0002 (montaż odwrotny) i milczące kanały Modbus —
  sprawdzić zasilanie 24 VDC, bo na baterii licznik wystawia Modbusa 80 s/godz.
