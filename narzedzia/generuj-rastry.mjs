// GENERATOR GRAFIK RASTROWYCH SCHEMATU (v0.4).
//
// Zadne narzedzie graficzne nie bierze w tym udzialu: piksele sa liczone
// z matematyki (profil walca, pole odleglosci, szum szczotkowania), a PNG
// skladany recznie (sygnatura + IHDR + IDAT/deflate + IEND, CRC-32).
// Dzieki temu grafiki sa POWTARZALNE: ten sam skrypt zawsze da ten sam bajt
// w bajt wynik i mozna je regenerowac po zmianie palety.
//
// Uruchomienie (z korzenia repo albo skadkolwiek):
//   node narzedzia/generuj-rastry.mjs
//
// Wyjscie: web/public/schemat/*.png
//   rura-pozioma.png  pasek 8x26  — rozciagany wzdluz, gradient w poprzek
//   rura-pionowa.png  pasek 26x8  — jak wyzej, obrocony
//   zlaczka.png       36x36       — kolanko/trojnik, przykrywa styk rur
//   zbiornik.png      400x824     — plaszcz magazynu w 2x (wyswietlany 200x412)
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- PNG ---------------------------------------------------------------

const CRC_TAB = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TAB[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(typ, dane) {
  const t = Buffer.from(typ, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dane.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dane])));
  return Buffer.concat([len, t, dane, crc]);
}

function png(w, h, rgba, filtrUp = false) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    const wiersz = y * (w * 4 + 1);
    if (filtrUp && y > 0) {
      // Filtr „Up": zapisujemy roznice wzgledem wiersza wyzej. Obraz o niemal
      // stalych kolumnach (smugi szczotkowania) kompresuje sie wtedy
      // kilkadziesiat razy lepiej niz surowe piksele.
      raw[wiersz] = 2;
      for (let i = 0; i < w * 4; i += 1) {
        raw[wiersz + 1 + i] = (rgba[y * w * 4 + i] - rgba[(y - 1) * w * 4 + i] + 256) & 0xff;
      }
      continue;
    }
    raw[wiersz] = 0; // filtr: none
    rgba.copy(raw, wiersz + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // glebia
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Pomoce ------------------------------------------------------------

/** Gradient wielopunktowy: stops = [[t, r, g, b], ...] posortowane po t. */
function gradient(stops, t) {
  if (t <= stops[0][0]) return stops[0].slice(1);
  for (let i = 1; i < stops.length; i += 1) {
    if (t <= stops[i][0]) {
      const [t0, ...a] = stops[i - 1];
      const [t1, ...b] = stops[i];
      const u = (t - t0) / (t1 - t0);
      return a.map((v, k) => v + (b[k] - v) * u);
    }
  }
  return stops[stops.length - 1].slice(1);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Deterministyczny szum — bez Math.random, zeby wynik byl powtarzalny. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// --- Profil chromu rury --------------------------------------------------
// Walec oswietlony z gory-lewej: jasny blik przy 40% srednicy, ciemny pas
// odbicia przy 80% — to on robi „chrom" zamiast plaskiej szarosci.

const PROFIL_RURY = [
  [0.0, 0x7c, 0x7c, 0x76],
  [0.06, 0x9a, 0x9a, 0x94],
  [0.2, 0xd7, 0xd7, 0xd2],
  [0.34, 0xf4, 0xf4, 0xf0],
  [0.44, 0xff, 0xff, 0xff],
  [0.55, 0xe2, 0xe2, 0xdd],
  [0.72, 0xb0, 0xb0, 0xaa],
  [0.8, 0x8e, 0x8e, 0x88],
  [0.88, 0xa6, 0xa6, 0xa0],
  [1.0, 0x75, 0x75, 0x70],
];

const D = 26; // srednica rury w px

function rura(pozioma) {
  const w = pozioma ? 8 : D;
  const h = pozioma ? D : 8;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const wzdluzSrednicy = pozioma ? y : x;
      const t = (wzdluzSrednicy + 0.5) / D;
      const [r, g, b] = gradient(PROFIL_RURY, t);
      // Wygladzenie krawedzi: pelne krycie w srodku, 1 px przejscia na brzegu.
      const odKrawedzi = Math.min(wzdluzSrednicy + 0.5, D - wzdluzSrednicy - 0.5);
      const a = clamp(odKrawedzi / 1.1, 0, 1) * 255;
      const i = (y * w + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    }
  }
  return png(w, h, buf);
}

// --- Zlaczka (kolanko / trojnik) -----------------------------------------
// Zaokraglony metalowy klocek z gradientem po przekatnej. Przykrywa styk
// dwoch pasow rury, wiec zaden szew nie jest widoczny.

function zlaczka() {
  const S = 36, R = 11, POL = S / 2;
  const buf = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const dx = Math.max(Math.abs(x + 0.5 - POL) - (POL - R), 0);
      const dy = Math.max(Math.abs(y + 0.5 - POL) - (POL - R), 0);
      const dist = Math.hypot(dx, dy) - R;
      const a = clamp(0.5 - dist, 0, 1) * 255;
      const u = clamp(0.08 + ((x + y) / (2 * (S - 1))) * 0.84, 0, 1);
      let [r, g, b] = gradient(PROFIL_RURY, u);
      // Cien przy dolnej-prawej krawedzi — klocek dostaje objetosc.
      const kraw = clamp(-dist / 3, 0, 1);
      if (x + y > S) { r *= 1 - 0.12 * (1 - kraw); g *= 1 - 0.12 * (1 - kraw); b *= 1 - 0.12 * (1 - kraw); }
      const i = (y * S + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    }
  }
  return png(S, S, buf);
}

// --- Zbiornik --------------------------------------------------------------
// Szczotkowana blacha: gradient walca w poprzek + pionowe smugi (szum na
// kolumne) + dekiel na gorze + winieta przy dnie. Render w 2x dla ostrosci.

function zbiornik() {
  const W = 400, H = 824, R = 56;
  const PAS = [
    [0.0, 0xa8, 0xa8, 0xa2],
    [0.13, 0xd8, 0xd8, 0xd3],
    [0.3, 0xf0, 0xf0, 0xeb],
    [0.42, 0xf8, 0xf8, 0xf3],
    [0.6, 0xdc, 0xdc, 0xd7],
    [0.82, 0xb8, 0xb8, 0xb2],
    [1.0, 0x9a, 0x9a, 0x94],
  ];
  const rnd = lcg(42);
  // Smugi szczotkowania: staly odchyl jasnosci na kolumne.
  const smuga = new Float64Array(W);
  for (let x = 0; x < W; x += 1) smuga[x] = (rnd() - 0.5) * 7 + Math.sin(x * 0.16) * 1.6;

  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      // Maska zaokraglonego prostokata.
      const dx = Math.max(Math.abs(x + 0.5 - W / 2) - (W / 2 - R), 0);
      const dy = Math.max(Math.abs(y + 0.5 - H / 2) - (H / 2 - R), 0);
      const dist = Math.hypot(dx, dy) - R;
      const a = clamp(0.5 - dist, 0, 1) * 255;
      if (a === 0) { continue; }

      let [r, g, b] = gradient(PAS, (x + 0.5) / W);

      // Szczotkowanie: smugi stale w kolumnie. Ziarna na piksel NIE dodajemy —
      // bylo ledwo widoczne, a rozdymalo plik dziesieciokrotnie.
      const n = smuga[x];
      r += n; g += n; b += n;

      // Dekiel: gorne 64 px ciemniejsze, pod nim ciemna spoina i blik.
      if (y < 64) { const f = 0.8 + 0.2 * (y / 64); r *= f; g *= f; b *= f; }
      else if (y < 70) { r *= 0.7; g *= 0.7; b *= 0.7; }
      else if (y < 75) { r = Math.min(255, r + 16); g = Math.min(255, g + 16); b = Math.min(255, b + 16); }

      // Lekki pionowy spadek jasnosci + winieta przy dnie.
      const pion = 1.03 - 0.06 * (y / H);
      r *= pion; g *= pion; b *= pion;
      if (y > H - 48) { const f = 1 - 0.14 * ((y - (H - 48)) / 48); r *= f; g *= f; b *= f; }

      const i = (y * W + x) * 4;
      buf[i] = clamp(r, 0, 255); buf[i + 1] = clamp(g, 0, 255); buf[i + 2] = clamp(b, 0, 255); buf[i + 3] = a;
    }
  }
  return png(W, H, buf, true);
}

// --- Zapis -------------------------------------------------------------

// Sciezka wzgledem POLOZENIA SKRYPTU, nie katalogu uruchomienia — skrypt
// dziala tak samo z korzenia repo i z dowolnego innego miejsca.
const katalog = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public', 'schemat');
mkdirSync(katalog, { recursive: true });
writeFileSync(`${katalog}/rura-pozioma.png`, rura(true));
writeFileSync(`${katalog}/rura-pionowa.png`, rura(false));
writeFileSync(`${katalog}/zlaczka.png`, zlaczka());
writeFileSync(`${katalog}/zbiornik.png`, zbiornik());
console.log('zapisane: rura-pozioma, rura-pionowa, zlaczka, zbiornik');
