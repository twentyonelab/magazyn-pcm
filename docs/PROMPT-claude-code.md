# Prompt do Claude Code

Wklej treść poniżej. Wcześniej wrzuć do repozytorium `SPEC-magazyn-pcm.md`
oraz swój plik `schema.svg` (może być szkic — struktura ważniejsza niż rysunek).

---

Buduję aplikację do wizualizacji stanowiska badawczego magazynu ciepła na materiale
zmiennofazowym. Dane pochodzą z Loxone Miniserver Compact w sieci lokalnej.
Pełna specyfikacja jest w `SPEC-magazyn-pcm.md` — **przeczytaj ją całą przed
napisaniem pierwszej linii kodu.**

## Zasady pracy

Zanim zaczniesz kodować, przedstaw mi **plan i decyzje architektoniczne**, które
podejmujesz za mnie — osobno wskaż te drogie w zmianie później. Poczekaj na moją
akceptację. Nie generuj całej aplikacji w jednym kroku.

Jestem projektantem wzornictwa przemysłowego, nie programistą. W designie i UX
poruszam się swobodnie, w architekturze kodu potrzebuję prowadzenia. Wyjaśniaj
po ludzku, na czym polegają kompromisy. Kwestionuj moje założenia, jeśli widzisz
lepszą drogę.

## Zakres pierwszego kroku

Nie buduj wszystkiego. Zrób **wyłącznie to**:

1. Monorepo: `server/` (Node 20 + TypeScript + Fastify) i `web/` (Vite + React + TS),
   wspólne typy w `shared/`
2. `server/src/points.config.ts` — rejestr punktów według sekcji 3 specyfikacji,
   UUID-y jako `null` do czasu, gdy je odczytam z Miniservera
3. `LoxoneSource` jako **interfejs**, z jedyną implementacją `HttpPollSource`
   (odpytywanie co 5 s). Podmiana na WebSocket później nie może dotykać niczego innego.
4. Endpointy `/api/points`, `/api/snapshot`, `/api/health`
5. Skrypt pomocniczy, który pobiera `LoxAPP3.json` z Miniservera i wypisuje listę
   dostępnych kontrolek z UUID-ami, żebym mógł uzupełnić rejestr punktów
6. `.env.example` z adresem, użytkownikiem i hasłem — **nigdy w kodzie**

**Kryterium ukończenia kroku pierwszego:** uruchamiam serwer i widzę w konsoli
sześć temperatur z magazynu, odświeżanych co 5 sekund.

Zatrzymaj się w tym miejscu i pokaż mi wynik. Frontend, SSE, SQLite i schemat SVG
robimy w następnych krokach, w kolejności z sekcji 10 specyfikacji.

## Rzeczy, w których łatwo popełnić błąd

- Loxone blokuje po serii nieudanych logowań — retry z backoffem, bez zapętlania
- Brak wartości to `null`, nigdy `0`
- Wartość starsza niż 3 × interwał odpytywania oznaczaj jako przestarzałą
- Ta aplikacja **tylko czyta**. Żadnych komend sterujących do Loxone.
