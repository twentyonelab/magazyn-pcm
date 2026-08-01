// WYCINARKA GRAFIK Z MAKIETY (v0.5).
//
// Zrodlem grafik schematu jest makieta projektanta (narzedzia/makieta-v03.png)
// — rury, zbiornik i karty urzadzen sa z niej WYCINANE, nie rysowane od nowa.
// Skrypt ma wlasny dekoder PNG (inflate + odfiltrowanie wierszy) i koder
// (ten sam co w generuj-rastry.mjs), wiec nie potrzebuje zadnych bibliotek.
//
// Operacje na wycinku:
//   inpaint  — zamalowanie krazka interpolacja pozioma (usuwa np. wypieczone
//              kropki sond ze zbiornika, zeby zywe kropki sie nie dublowaly)
//   wypelnij — prostokat kolorem pobranym z podanego punktu (usuwa wypieczone
//              wiersze tekstu z kart, w ktore aplikacja wpisuje zywe wartosci)
//   kluczTla — przezroczystosc dla tla ZALEWANA OD KRAWEDZI: piksel staje sie
//              przezroczysty tylko, gdy jest polaczony z brzegiem obszarem
//              podobnym do tla. Blik na rurze o kolorze zblizonym do tla
//              zostaje niedotkniety, bo nie styka sie z brzegiem; miekki cien
//              dostaje czesciowa alfe i dziala na obu motywach.
//
// Uruchomienie:  node narzedzia/wytnij-z-makiety.mjs
// Wyjscie:       web/public/schemat/*.png

import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TU = dirname(fileURLToPath(import.meta.url));
const ZRODLO = join(TU, 'makieta-v03.png');
const WYJSCIE = join(TU, '..', 'web', 'public', 'schemat');

// --- CRC / koder PNG (jak w generuj-rastry.mjs) --------------------------

const CRC_TAB = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TAB[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(typ, dane) {
  const t = Buffer.from(typ, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dane.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dane])));
  return Buffer.concat([len, t, dane, crc]);
}

function zapiszPng(sciezka, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    const wiersz = y * (w * 4 + 1);
    if (y > 0) {
      raw[wiersz] = 2; // filtr Up — fotografie tez na tym zyskuja
      for (let i = 0; i < w * 4; i += 1) {
        raw[wiersz + 1 + i] = (rgba[y * w * 4 + i] - rgba[(y - 1) * w * 4 + i] + 256) & 0xff;
      }
    } else {
      raw[wiersz] = 0;
      rgba.copy(raw, wiersz + 1, 0, w * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  writeFileSync(
    sciezka,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

// --- Dekoder PNG ----------------------------------------------------------

function wczytajPng(sciezka) {
  const dane = readFileSync(sciezka);
  let poz = 8;
  let w = 0, h = 0, glebia = 0, kolor = 0, przeplot = 0;
  const idat = [];
  while (poz < dane.length) {
    const len = dane.readUInt32BE(poz);
    const typ = dane.toString('ascii', poz + 4, poz + 8);
    const tresc = dane.subarray(poz + 8, poz + 8 + len);
    if (typ === 'IHDR') {
      w = tresc.readUInt32BE(0);
      h = tresc.readUInt32BE(4);
      glebia = tresc[8];
      kolor = tresc[9];
      przeplot = tresc[12];
    } else if (typ === 'IDAT') idat.push(tresc);
    else if (typ === 'IEND') break;
    poz += 12 + len;
  }
  if (glebia !== 8 || (kolor !== 2 && kolor !== 6) || przeplot !== 0) {
    throw new Error(`nieobslugiwany PNG: glebia=${glebia} kolor=${kolor} przeplot=${przeplot}`);
  }
  const kanaly = kolor === 6 ? 4 : 3;
  const surowe = inflateSync(Buffer.concat(idat));
  const bpr = w * kanaly;
  const piksele = Buffer.alloc(w * h * 4, 255);

  const poprz = Buffer.alloc(bpr);
  for (let y = 0; y < h; y += 1) {
    const filtr = surowe[y * (bpr + 1)];
    const wiersz = surowe.subarray(y * (bpr + 1) + 1, (y + 1) * (bpr + 1));
    for (let i = 0; i < bpr; i += 1) {
      const lewy = i >= kanaly ? wiersz[i - kanaly] : 0;
      const gora = poprz[i];
      const lg = i >= kanaly ? poprz[i - kanaly] : 0;
      let v = wiersz[i];
      if (filtr === 1) v = (v + lewy) & 0xff;
      else if (filtr === 2) v = (v + gora) & 0xff;
      else if (filtr === 3) v = (v + ((lewy + gora) >> 1)) & 0xff;
      else if (filtr === 4) {
        const p = lewy + gora - lg;
        const pa = Math.abs(p - lewy), pb = Math.abs(p - gora), pc = Math.abs(p - lg);
        v = (v + (pa <= pb && pa <= pc ? lewy : pb <= pc ? gora : lg)) & 0xff;
      }
      wiersz[i] = v;
    }
    wiersz.copy(poprz);
    for (let x = 0; x < w; x += 1) {
      const s = y * (bpr + 1) + 1 + x * kanaly;
      const d = (y * w + x) * 4;
      piksele[d] = surowe[s];
      piksele[d + 1] = surowe[s + 1];
      piksele[d + 2] = surowe[s + 2];
      piksele[d + 3] = kanaly === 4 ? surowe[s + 3] : 255;
    }
  }
  return { w, h, piksele };
}

// --- Operacje ---------------------------------------------------------------

function wytnij(zrodlo, x, y, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let r = 0; r < h; r += 1) {
    zrodlo.piksele.copy(out, r * w * 4, ((y + r) * zrodlo.w + x) * 4, ((y + r) * zrodlo.w + x + w) * 4);
  }
  return { w, h, piksele: out };
}

/** Zamalowanie krazka interpolacja pozioma miedzy pikselami tuz za brzegiem. */
function inpaint(img, cx, cy, r) {
  for (let y = Math.max(0, cy - r); y <= Math.min(img.h - 1, cy + r); y += 1) {
    const dy = y - cy;
    const pol = Math.floor(Math.sqrt(r * r - dy * dy));
    const x0 = Math.max(1, cx - pol - 1);
    const x1 = Math.min(img.w - 2, cx + pol + 1);
    for (let x = x0 + 1; x < x1; x += 1) {
      const t = (x - x0) / (x1 - x0);
      for (let k = 0; k < 4; k += 1) {
        img.piksele[(y * img.w + x) * 4 + k] = Math.round(
          img.piksele[(y * img.w + x0) * 4 + k] * (1 - t) + img.piksele[(y * img.w + x1) * 4 + k] * t,
        );
      }
    }
  }
}

/** Prostokat kolorem pobranym z punktu (px, py). */
function wypelnij(img, x, y, w, h, px, py) {
  const s = (py * img.w + px) * 4;
  for (let r = y; r < y + h; r += 1) {
    for (let c = x; c < x + w; c += 1) {
      const d = (r * img.w + c) * 4;
      img.piksele[d] = img.piksele[s];
      img.piksele[d + 1] = img.piksele[s + 1];
      img.piksele[d + 2] = img.piksele[s + 2];
      img.piksele[d + 3] = img.piksele[s + 3];
    }
  }
}

/**
 * Przezroczystosc tla zalewana od krawedzi. `prog` — roznica koloru, ponizej
 * ktorej piksel uchodzi za tlo; alfa narasta liniowo do 2*prog (miekki cien).
 */
function kluczTla(img, tlo, prog = 10) {
  const roznica = (i) =>
    Math.max(
      Math.abs(img.piksele[i] - tlo[0]),
      Math.abs(img.piksele[i + 1] - tlo[1]),
      Math.abs(img.piksele[i + 2] - tlo[2]),
    );
  const odwiedzone = new Uint8Array(img.w * img.h);
  const kolejka = [];
  for (let x = 0; x < img.w; x += 1) { kolejka.push(x, (img.h - 1) * img.w + x); }
  for (let y = 0; y < img.h; y += 1) { kolejka.push(y * img.w, y * img.w + img.w - 1); }
  while (kolejka.length) {
    const p = kolejka.pop();
    if (odwiedzone[p]) continue;
    const d = roznica(p * 4);
    if (d >= prog * 2) continue;
    odwiedzone[p] = 1;
    const x = p % img.w, y = (p / img.w) | 0;
    if (x > 0) kolejka.push(p - 1);
    if (x < img.w - 1) kolejka.push(p + 1);
    if (y > 0) kolejka.push(p - img.w);
    if (y < img.h - 1) kolejka.push(p + img.w);
  }
  for (let p = 0; p < img.w * img.h; p += 1) {
    if (!odwiedzone[p]) continue;
    const d = roznica(p * 4);
    img.piksele[p * 4 + 3] = Math.round(Math.min(1, d / (prog * 2)) * 255);
  }
}

// --- Konfiguracja wycinkow --------------------------------------------------
// Wspolrzedne w pikselach ORYGINALU makiety (3433 x 2017). `dot` i `fill`
// dzialaja we wspolrzednych wycinka (po odjeciu x/y).

const zrodlo = wczytajPng(ZRODLO);
console.log(`makieta: ${zrodlo.w} x ${zrodlo.h}`);
// Kolor tla makiety — probka z pustego rogu.
const TLO = [
  zrodlo.piksele[(200 * zrodlo.w + 3000) * 4],
  zrodlo.piksele[(200 * zrodlo.w + 3000) * 4 + 1],
  zrodlo.piksele[(200 * zrodlo.w + 3000) * 4 + 2],
];
console.log('tlo makiety:', TLO.join(','));

// `replace` zdejmuje BOM — PowerShell dopisuje go przy zapisie UTF-8.
const WYCINKI = JSON.parse(readFileSync(join(TU, 'wycinki.json'), 'utf8').replace(/^﻿/, ''));

mkdirSync(WYJSCIE, { recursive: true });
for (const wyc of WYCINKI) {
  const img = wytnij(zrodlo, wyc.x, wyc.y, wyc.w, wyc.h);
  for (const d of wyc.inpaint ?? []) inpaint(img, d.cx, d.cy, d.r);
  for (const f of wyc.fill ?? []) wypelnij(img, f.x, f.y, f.w, f.h, f.px, f.py);
  if (wyc.klucz) kluczTla(img, TLO, wyc.prog ?? 10);
  zapiszPng(join(WYJSCIE, wyc.plik), img.w, img.h, img.piksele);
  console.log(`${wyc.plik}: ${img.w}x${img.h}`);
}
