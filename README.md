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

W konsoli pojawi się tabela sześciu temperatur, odświeżana co 5 sekund.
Liczby są syntetyczne — służą do pracy nad aplikacją, gdy nie ma dostępu
do stanowiska.

### Praca z prawdziwym Miniserverem

1. W **Loxone Config** założ osobnego użytkownika **tylko do odczytu**
   (nie używaj konta `admin`) i nadaj mu uprawnienia wizualizacji do sond.
   Uwaga: zapis konfiguracji **restartuje Miniserver** — zrób to, gdy nie
   trwa test.
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
   Skrypt wypisze wszystkie kontrolki z Miniservera i zapisze je do
   `data/loxone/`. Sprawdza też, czy uwierzytelnianie HTTP Basic działa
   na tym firmware.
4. Wklej UUID-y do [`server/src/points.config.ts`](server/src/points.config.ts)
   w miejsce `null`.
5. Uruchom serwer:
   ```bash
   npm run dev
   ```

Na Windowsie można też uruchomić dwuklikiem plik `start.cmd` — ustawia
kodowanie UTF-8, żeby polskie znaki i `°C` wyświetlały się poprawnie.

---

## Co już działa (krok 1)

- Rejestr 18 punktów pomiarowych — jedno źródło prawdy dla całej aplikacji
- Odczyt z Miniservera przez HTTP, co 5 s, z bezpieczną obsługą błędów
- Źródło syntetyczne do pracy bez laboratorium
- Tabela temperatur w konsoli
- Zapis pomiarów do plików (historia zbiera się od pierwszego dnia)
- Endpointy: `/api/points`, `/api/snapshot`, `/api/health`

### Kolejne kroki

| # | Krok | Stan |
|---|---|---|
| 1 | Middleware — 6 temperatur w konsoli | gotowe |
| 2 | `/api/points` i `/api/snapshot` | gotowe |
| 3 | `/api/stream` (SSE) | — |
| 4 | Zapis do SQLite | — |
| 5 | Widok Diagnostyka | — |
| 6 | Warstwa wiążąca SVG i widok Magazyn PCM | — |
| 7 | Zaślepki pozostałych widoków | — |
| 8 | `/api/history` | — |

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
    loxone/
      source.ts            INTERFEJS źródła danych — granica wymienności
      client.ts            komunikacja i uwierzytelnianie (jedyne miejsce)
      http-poll-source.ts  odpytywanie HTTP (v1)
      mock-source.ts       dane syntetyczne
    history/
      store.ts             interfejs zapisu historii
      ndjson-store.ts      zapis do pliku (do czasu SQLite)
    api/routes.ts        endpointy REST
    scripts/fetch-uuids.ts  skrypt pobierający UUID-y
web/             szkielet frontendu (Vite + React)
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
