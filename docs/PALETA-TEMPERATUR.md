# Paleta temperatur — Entalvia A2

Specyfikacja od projektanta (2026-08-03), przepisana **bez zmian**. Jest
obowiązująca dla każdego miejsca, w którym barwa koduje temperaturę.

Implementacja: [`web/src/paleta-temperatur.ts`](../web/src/paleta-temperatur.ts).
Jeden moduł, żeby nie dało się zejść z tych wartości w drugim miejscu — patrz
sekcja „Gdzie to działa" na końcu.

---

## Specyfikacja

> PALETA TEMPERATUR — Entalvia A2. Używaj jej ZAWSZE, gdy kolorujesz
> temperaturę: ciepłomierze, wykresy, przekroje zasobników, wskaźniki,
> tabele, mapy cieplne, badge'e ze stanem.
>
> SKALA GLOBALNA (0–70 °C, interpolacja liniowa między punktami):
>
> ```
>   0 °C  #3E5F8C
>   8 °C  #6E8FBA
>  20 °C  #A9BFD4
>  30 °C  #D8DEE2
>  36 °C  #E9E4DC
>  45 °C  #EFD2B4
>  55 °C  #EBB184
>  63 °C  #DC8F5C
>  70 °C  #B96A3E
> ```
>
> Poza zakresem: <0 °C → `#2A4266`, >70 °C → `#8C4B29`.
>
> STREFY PRZEMIANY FAZOWEJ — zawsze oznaczaj, jeśli wykres obejmuje
> ten zakres:
>
> ```
>   RT8HC  krzepnięcie 8→7 °C, topnienie 7→9 °C, pik 8 °C
>   RT57HC krzepnięcie 57→53 °C, topnienie 55→58 °C, pik 57 °C
> ```
>
> Oznaczenie cienkim pasem lub delikatnym sztrychem, NIE zmianą
> koloru wypełnienia.
>
> ZASADY:
>
> 1. Kolor = temperatura. Nigdy stopień naładowania. Podczas przemiany
>    fazowej temperatura stoi na plateau godzinami — kolor też stanie.
>    Energię/SOC pokazuj osobnym kanałem (słupek, pierścień, liczba).
> 2. Jasność jest monotoniczna od środka na zewnątrz. Nie wstawiaj
>    pośrednich kolorów jaśniejszych niż `#E9E4DC`.
> 3. Tekst na tle z tej palety: na stopniach 20–63 °C używaj `#1C1C1B`,
>    na końcach (0–8 i 70 °C) używaj `#F2EFEA`. Nigdy czystej czerni
>    ani białej.
> 4. Ta paleta jest pastelowa i ma niską rozdzielczość barwną.
>    Jeśli zakres danych jest węższy niż 15 K, NIE rozciągaj jej —
>    użyj skali lokalnej poniżej.
> 5. Nie dodawaj poświat, cieni ani gradientów dekoracyjnych.
>    Płaskie wypełnienia.
>
> SKALE LOKALNE (zoom na strefę przemiany, pełne nasycenie — używaj
> gdy zakres danych < 15 K):
>
> ```
>   Chłód 5–12 °C:   #16406E → #2E6BA8 → #5A97CC → #93BDDC → #C8DAE7
>   Ciepło 50–62 °C: #9A4517 → #C4652A → #E28A45 → #EFB57E → #F5DCC0
> ```
>
> Gdy nie wiesz, której skali użyć: rozpiętość danych ≥ 15 K → globalna,
> < 15 K → lokalna.

---

## Rozstrzygnięcia przy wdrożeniu

Rzeczy, których specyfikacja nie mówi wprost, a kod musi rozstrzygnąć. Każde
z nich jest do zmiany jednym miejscem w `paleta-temperatur.ts`.

**Wybór skali lokalnej.** Rozpiętość < 15 K wybiera lokalną, ale nie mówi
której. Rozstrzyga ŚRODEK zakresu danych: poniżej 30 °C — chłód, od 30 °C
w górę — ciepło. 30 °C to punkt, w którym globalna paleta przechodzi przez
neutralną szarość, więc dzieli ją na połowę zimną i ciepłą.

**Barwa poza skalą lokalną.** Skale lokalne mają wąskie zakresy (5–12,
50–62 °C), a dane potrafią z nich wyjść w trakcie ładowania. Kolor się wtedy
ZATRZYMUJE na skrajnym przystanku, tak jak w skali globalnej poza 0–70 °C.
Przełączanie w locie na globalną dawałoby skok barwy przy przekroczeniu progu.

**Tekst między 8 a 20 °C.** Zasada 3 opisuje 0–8 i 20–63, o przedziale
8–20 °C nie mówi. Tam tło jest już jasnym błękitem (`#6E8FBA`→`#A9BFD4`),
więc obowiązuje ciemny tusz `#1C1C1B`. Próg: `≤ 8 °C` i `> 63 °C` — tusz
jasny, pomiędzy — ciemny.

**Skala lokalna ciepła jaśnieje z temperaturą** (`#9A4517` przy 50 °C →
`#F5DCC0` przy 62 °C), czyli ODWROTNIE niż globalna, gdzie gorętsze jest
ciemniejsze. Wpisane dokładnie tak, jak w specyfikacji — ale to jedyne
miejsce, w którym dwie skale mówią barwą co innego. Do potwierdzenia przy
pierwszym prawdziwym rozładowaniu 57HC.

**Pasmo przemiany 57HC to 53–58 °C.** Ze specyfikacji wynika suma obu
kierunków: krzepnięcie 57→53, topnienie 55→58. Zamyka to pytanie otwarte
z `CLAUDE.md` (solidus 53 wobec `phaseBandMin: 55` w konfiguracji serwera).

## Gdzie to działa

- **Kropki sond na schemacie 2D** — `web/src/schema/bindSchema.ts`
- **Sondy w scenie 3D** — `web/src/views/Magazyn3D.tsx`
- **Pinezki na mapie** (wypełnienie; obrys i podpis dalej kodują RODZAJ
  magazynu, bo mapa musi odróżniać ciepło od chłodu na pierwszy rzut oka)
  — `web/src/views/Mapa.tsx`
- **Podziałka temperatury w belce naładowania** — `web/src/components/belka/`
- **Pasmo przemiany na wykresach** — sztrych, nie wypełnienie:
  `web/src/components/Wykres.tsx`

Paleta NIE dotyczy barw rodzaju magazynu (`web/src/kolory-magazynu.ts`):
pomarańcz „ciepło" i stal „chłód" kodują, CZYM jest instalacja, a nie ile ma
stopni. To dwa różne pytania i dwa różne systemy barwne.
