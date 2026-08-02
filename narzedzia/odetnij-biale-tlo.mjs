// ODCIĘCIE BIAŁEJ MATY OD LOGOTYPU.
//
// Plik `tauron-cieplo.png` przyszedł z wypalonym białym prostokątem w tle —
// zero przezroczystości, 88% pikseli białych. Dopóki tam był, logo musiało
// siedzieć na białej pastylce, bo inaczej rysowałby się biały kafelek na
// kremowym tle aplikacji. Prośba brzmiała: pokazać logo wprost na tle.
//
// CO ROBI SKRYPT. Odwraca składanie z bielą. Piksel widoczny na ekranie
// powstał jako  widoczny = kolor·α + 255·(1−α),  więc przy założeniu, że tłem
// była czysta biel:
//
//     α     = 255 − min(r, g, b)
//     kolor = (widoczny − 255·(1−α)) / α
//
// Dla magenty (230, 0, 126) minimum wynosi 0, więc α = 255 i barwa zostaje
// nietknięta. Dla szarości liter alfa wychodzi pośrednia i litera staje się
// półprzezroczysta zamiast szarej — dokładnie tak, jak wyglądałaby, gdyby
// projektant oddał plik z kanałem alfa.
//
// CZEGO NIE ROBI. Nie zmienia kształtu ani barw znaku. Oryginał zostaje obok
// jako `*-na-bieli.png`, więc operacja jest odwracalna.
//
// Uruchomienie:  node narzedzia/odetnij-biale-tlo.mjs <plik.png>

import { deflateSync, inflateSync } from 'node:zlib';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const PODPIS = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function czytajKawalki(buf) {
  if (!buf.subarray(0, 8).equals(PODPIS)) throw new Error('to nie jest PNG');
  const out = [];
  let p = 8;
  while (p < buf.length) {
    const dlugosc = buf.readUInt32BE(p);
    const typ = buf.toString('ascii', p + 4, p + 8);
    out.push({ typ, dane: buf.subarray(p + 8, p + 8 + dlugosc) });
    p += 12 + dlugosc;
  }
  return out;
}

function zapiszPng(szerokosc, wysokosc, rgba) {
  const kawalek = (typ, dane) => {
    const naglowek = Buffer.alloc(8);
    naglowek.writeUInt32BE(dane.length, 0);
    naglowek.write(typ, 4, 'ascii');
    const suma = Buffer.alloc(4);
    suma.writeUInt32BE(crc32(Buffer.concat([Buffer.from(typ, 'ascii'), dane])), 0);
    return Buffer.concat([naglowek, dane, suma]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(szerokosc, 0);
  ihdr.writeUInt32BE(wysokosc, 4);
  ihdr[8] = 8; // głębia
  ihdr[9] = 6; // RGBA
  // Filtr 0 w każdym wierszu: logo jest małe, a prostota liczy się bardziej
  // niż kilka kilobajtów.
  const surowe = Buffer.alloc(wysokosc * (1 + szerokosc * 4));
  for (let y = 0; y < wysokosc; y += 1) {
    surowe[y * (1 + szerokosc * 4)] = 0;
    rgba.copy(surowe, y * (1 + szerokosc * 4) + 1, y * szerokosc * 4, (y + 1) * szerokosc * 4);
  }

  return Buffer.concat([
    PODPIS,
    kawalek('IHDR', ihdr),
    kawalek('IDAT', deflateSync(surowe, { level: 9 })),
    kawalek('IEND', Buffer.alloc(0)),
  ]);
}

/** Rozwija filtry PNG do surowej tablicy RGBA. */
function dekoduj(buf) {
  const kawalki = czytajKawalki(buf);
  const ihdr = kawalki.find((k) => k.typ === 'IHDR').dane;
  const szerokosc = ihdr.readUInt32BE(0);
  const wysokosc = ihdr.readUInt32BE(4);
  const typKoloru = ihdr[9];
  if (ihdr[8] !== 8) throw new Error('obsługuję tylko 8 bitów na kanał');

  const kanalow = { 0: 1, 2: 3, 4: 2, 6: 4 }[typKoloru];
  if (!kanalow) throw new Error('nieobsługiwany typ koloru: ' + typKoloru);

  const dane = inflateSync(
    Buffer.concat(kawalki.filter((k) => k.typ === 'IDAT').map((k) => k.dane)),
  );

  const wiersz = szerokosc * kanalow;
  const piksele = Buffer.alloc(wysokosc * wiersz);
  let p = 0;
  for (let y = 0; y < wysokosc; y += 1) {
    const filtr = dane[p];
    p += 1;
    for (let i = 0; i < wiersz; i += 1) {
      const x = dane[p + i];
      const a = i >= kanalow ? piksele[y * wiersz + i - kanalow] : 0;
      const b = y > 0 ? piksele[(y - 1) * wiersz + i] : 0;
      const c = y > 0 && i >= kanalow ? piksele[(y - 1) * wiersz + i - kanalow] : 0;
      let wartosc;
      switch (filtr) {
        case 0: wartosc = x; break;
        case 1: wartosc = x + a; break;
        case 2: wartosc = x + b; break;
        case 3: wartosc = x + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a);
          const pb = Math.abs(pp - b);
          const pc = Math.abs(pp - c);
          wartosc = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error('nieznany filtr ' + filtr);
      }
      piksele[y * wiersz + i] = wartosc & 0xff;
    }
    p += wiersz;
  }

  // Do RGBA
  const rgba = Buffer.alloc(szerokosc * wysokosc * 4);
  for (let i = 0; i < szerokosc * wysokosc; i += 1) {
    const z = i * kanalow;
    const d = i * 4;
    if (kanalow === 1) { rgba[d] = rgba[d + 1] = rgba[d + 2] = piksele[z]; rgba[d + 3] = 255; }
    else if (kanalow === 2) { rgba[d] = rgba[d + 1] = rgba[d + 2] = piksele[z]; rgba[d + 3] = piksele[z + 1]; }
    else if (kanalow === 3) { rgba[d] = piksele[z]; rgba[d + 1] = piksele[z + 1]; rgba[d + 2] = piksele[z + 2]; rgba[d + 3] = 255; }
    else { piksele.copy(rgba, d, z, z + 4); }
  }

  return { szerokosc, wysokosc, rgba };
}

// --- Praca -----------------------------------------------------------------
const sciezka = process.argv[2];
if (!sciezka) {
  console.error('podaj plik: node narzedzia/odetnij-biale-tlo.mjs <plik.png>');
  process.exit(1);
}

const kopia = sciezka.replace(/\.png$/i, '-na-bieli.png');
if (!existsSync(kopia)) copyFileSync(sciezka, kopia);

const { szerokosc, wysokosc, rgba } = dekoduj(readFileSync(sciezka));

let zdjete = 0;
for (let i = 0; i < szerokosc * wysokosc; i += 1) {
  const d = i * 4;
  const r = rgba[d], g = rgba[d + 1], b = rgba[d + 2];
  const alfa = 255 - Math.min(r, g, b);

  if (alfa === 0) {
    rgba[d + 3] = 0;
    zdjete += 1;
    continue;
  }

  // Odwrócenie składania z bielą.
  const k = alfa / 255;
  rgba[d] = Math.min(255, Math.max(0, Math.round((r - 255 * (1 - k)) / k)));
  rgba[d + 1] = Math.min(255, Math.max(0, Math.round((g - 255 * (1 - k)) / k)));
  rgba[d + 2] = Math.min(255, Math.max(0, Math.round((b - 255 * (1 - k)) / k)));
  rgba[d + 3] = alfa;
}

writeFileSync(sciezka, zapiszPng(szerokosc, wysokosc, rgba));
console.log(`${sciezka}: ${szerokosc}x${wysokosc}, zdjęto ${(100 * zdjete / (szerokosc * wysokosc)).toFixed(1)}% tła`);
console.log(`oryginał zachowany jako ${kopia}`);
