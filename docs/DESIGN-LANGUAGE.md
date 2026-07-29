# Język wizualny

Notatka kierunkowa na krok 6 (widok Magazyn PCM). Powstała z dwóch referencji
interfejsu wskazanych przez Krzysztofa oraz z wymagań sekcji 7 specyfikacji.

## Charakter

Spokojne, jasne, laboratoryjne — ale nie „przemysłowe". Wrażenie takie, jak
w referencjach: dużo powietrza, jeden mocny akcent, wszystko inne wycofane.
Warstwa wizualna ma być **nasza, nie Loxone'owa**.

## Kolor

| Rola | Wartość | Uwaga |
|---|---|---|
| Tło | `#f2f2f0` | ciepła jasna szarość, nie biel |
| Karta / powierzchnia | `#ffffff` | miękki cień, bez obramowań |
| Tekst główny | `#0d0d0d` | prawie czarny |
| Tekst drugoplanowy | `#6b6b68` | etykiety, jednostki, opisy |
| Akcent | `#ffe14d` | żółty — tylko akcje i stan aktywny |
| Stan spełniony | `#e8f3e4` | delikatna zieleń |

**Akcent jest jeden.** Pojawia się na elemencie aktywnym i na wezwaniu do
działania, nigdy jako dekoracja.

### Skala barwna temperatury — osobny system

Skala temperatury **nie należy** do palety interfejsu i nie może z nią
konkurować. Jej zakres pochodzi z konfiguracji sesji badawczej
(`server/src/materials.config.ts`), nigdy z kodu widoku:

| Materiał | Zakres skali | Pasmo przemiany |
|---|---|---|
| RT8HC | 0…20 °C | 7–9 °C |
| RT57HC | 40…75 °C | 55–58 °C |

**Pasmo przemiany fazowej ma osobne oznaczenie** — to najważniejsza informacja
na całym ekranie. Punkt wewnątrz plateau znaczy coś zupełnie innego niż punkt
poza nim. Przy skali 0–100 °C cała przemiana RT8HC byłaby jednym odcieniem;
to błąd, który zniweczyłby sens wizualizacji.

## Typografia

- Nagłówki: gruby krój bezszeryfowy, mocno zbite światło (`letter-spacing: -0.03em`),
  duże skoki wielkości — jak „Level 01: Ideation" w referencji
- Etykiety sekcji: małymi literami, drobne, wycofany kolor
- **Liczby: krój o stałej szerokości cyfr** (`font-variant-numeric: tabular-nums`).
  Bez tego wartości drgają przy każdym odświeżeniu — przy odczycie co 5 s
  to męczy oko.
- Temperatura: jedno miejsce po przecinku. Przepływ: trzy. Zawsze z jednostką.

## Forma

- Karty o dużym promieniu (18–28 px), cień rozmyty i nisko kontrastowy
- Nawigacja jako pigułka z podświetlonym elementem aktywnym
- Elementy nakładające się na siebie z lekkim przesunięciem (jak powiadomienia
  w referencji) — dają głębię bez ramek
- Stany: wypełnienie tłem, nie obwódka

## Schemat instalacji

Rysunek jest **zewnętrznym plikiem SVG**, nie kodem React
(`docs/Schemat-instalacji.pdf` to podkład wstępny — docelowy rysunek
ma być estetyczny i realistyczny). Powstaje w narzędziu graficznym
i podmienia się bez dotykania logiki.

Kontrakt wiązania przez atrybuty `data-*`:

| Atrybut | Znaczenie |
|---|---|
| `data-point="A1"` | element pokazuje wartość punktu (`textContent`) |
| `data-fill-point="A1"` | element barwi się według wartości punktu |
| `data-flow="pcm-loop"` | ścieżka animuje przepływ |
| `data-flow-source="METER_FLOW"` | prędkość animacji proporcjonalna do wartości |
| `data-state="VALVE_STATE"` | element przełącza klasę `is-active` / `is-inactive` |
| `data-stale-hide` | element chowany, gdy punkt jest przestarzały |

## Ruch

- Przepływ: `stroke-dasharray` plus animowany `stroke-dashoffset`,
  prędkość proporcjonalna do przepływu
- **Zerowy przepływ = brak ruchu**, nie wolny ruch
- Respektować `prefers-reduced-motion`

## Stan przestarzały i brak danych

To wymóg badawczy, nie estetyczny: awaria czujnika w trakcie tygodniowego
testu musi być widoczna od razu, a nie odkryta przy analizie danych.

- Wartość starsza niż 3 × interwał odpytywania → wyraźnie oznaczona jako
  przestarzała. **Nie pokazywać ostatniej znanej wartości jako aktualnej.**
- Punkt niedostępny (`available: false`) → wyraźnie nieaktywny.
  **Nie zero i nie puste miejsce.**
