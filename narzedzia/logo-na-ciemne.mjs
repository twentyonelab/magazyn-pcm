// WERSJA LOGOTYPU NA CIEMNE TŁO.
//
// DLACZEGO NIE FILTREM CSS. Nocą logo trzeba rozjaśnić, bo litery są prawie
// czarne i na ciemnym tle znikają. Pierwsze podejście robiło to filtrem
// (`invert` + `hue-rotate` + `saturate`) i to jest ślepa uliczka: `hue-rotate`
// nie obraca barwy, tylko przybliża obrót macierzą, więc magenta wychodziła
// jako #e9a6e9 — bladoróżowa, nie firmowa. Barwy marki nie da się trafić
// przypadkiem; trzeba ją wpisać.
//
// CO ROBI SKRYPT. Rozdziela piksele na dwie rodziny (w pliku nie ma innych):
//   magenta ≈ (228, 0, 123)  → dokładnie MAGENTA_DOCELOWA
//   litery  ≈ (0, 0, 4)      → biel
// Kanał alfa zostaje nietknięty, więc kształt, wygładzenie krawędzi i miękkie
// przejścia liter są takie same jak w wersji dziennej.
//
// Uruchomienie:  node narzedzia/logo-na-ciemne.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dekoduj, zapiszPng } from './png.mjs';

const ZRODLO = 'web/public/tauron-cieplo.png';
const CEL = 'web/public/tauron-cieplo-ciemny.png';

/** Magenta marki — wartość podana przez projektanta. */
const MAGENTA_DOCELOWA = [0xe4, 0x00, 0x7b];

/**
 * Próg rozdziału. Magenta ma czerwony powyżej 200, litery poniżej 40 —
 * połowa tego dystansu jest bezpieczna także dla pikseli krawędziowych.
 */
const PROG_CZERWONEGO = 100;

const { szerokosc, wysokosc, rgba } = dekoduj(readFileSync(ZRODLO));

let magenty = 0;
let liter = 0;

for (let i = 0; i < szerokosc * wysokosc; i += 1) {
  const d = i * 4;
  if (rgba[d + 3] === 0) continue;

  if (rgba[d] > PROG_CZERWONEGO) {
    [rgba[d], rgba[d + 1], rgba[d + 2]] = MAGENTA_DOCELOWA;
    magenty += 1;
  } else {
    rgba[d] = rgba[d + 1] = rgba[d + 2] = 255;
    liter += 1;
  }
}

writeFileSync(CEL, zapiszPng(szerokosc, wysokosc, rgba));
console.log(`${CEL}: ${szerokosc}x${wysokosc}`);
console.log(`magenta #${MAGENTA_DOCELOWA.map((k) => k.toString(16).padStart(2, '0')).join('')}: ${magenty} px`);
console.log(`litery na biel: ${liter} px`);
