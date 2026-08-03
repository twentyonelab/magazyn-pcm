// SPRAWDZENIE MIARY NALADOWANIA dla obu nosnikow — bez przegladarki.
//
// Powod istnienia: 2026-08-03 stanowisko przeszlo na zbiornik 8HC i mapa
// pokazala „100% naladowany" dla zbiornika o 24 °C, czyli calkiem pustego.
// Miara naladowania nie pytala o KIERUNEK — a dla magazynu chlodu naladowany
// znaczy zimny. Ten skrypt pilnuje, zeby taki blad nie wrocil.
//
// Uruchomienie:
//   npx esbuild narzedzia/sprawdz-naladowanie.mjs --bundle --platform=node \
//     --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs

import { naladowanieProcent, pozaSkalaMaterialu } from '../web/src/naladowanie.ts';

const P8 = {
  id: 'RT8HC', label: '8HC',
  scaleMin: 0, scaleMax: 20, phaseBandMin: 7, phaseBandMax: 9,
  peak: 8, latentHeat: 190, tMax: 40,
};
const P57 = {
  id: 'RT57HC', label: '57HC',
  scaleMin: 40, scaleMax: 75, phaseBandMin: 55, phaseBandMax: 58,
  peak: 57, latentHeat: 240, tMax: 90,
};

let bledy = 0;
const sprawdz = (opis, warunek, szczegol) => {
  if (warunek) {
    console.log(`  ✓ ${opis}${szczegol ? ' — ' + szczegol : ''}`);
  } else {
    console.error(`  ✗ ${opis}${szczegol ? ' — ' + szczegol : ''}`);
    bledy += 1;
  }
};

console.log('\nMAGAZYN CHŁODU (8HC): naładowany = ZIMNY');
{
  const cieply = naladowanieProcent(24.37, P8, 'chlod');
  sprawdz('zbiornik 24,4 °C jest PUSTY, nie pełny', cieply !== null && cieply <= 5, `${cieply}%`);
  sprawdz('i aplikacja wie, że to poza skalą materiału', pozaSkalaMaterialu(24.37, P8), 'skala 0–20 °C');

  const zimny = naladowanieProcent(1, P8, 'chlod');
  sprawdz('zbiornik 1 °C jest prawie pełny', zimny !== null && zimny >= 90, `${zimny}%`);

  const przemiana = naladowanieProcent(8, P8, 'chlod');
  sprawdz('w środku przemiany jest pomiędzy', przemiana > 20 && przemiana < 80, `${przemiana}%`);

  sprawdz(
    'zimniej znaczy bardziej naładowany (monotonicznie)',
    naladowanieProcent(3, P8, 'chlod') > naladowanieProcent(15, P8, 'chlod'),
  );
}

console.log('\nMAGAZYN CIEPŁA (57HC): naładowany = GORĄCY');
{
  const zimny = naladowanieProcent(41, P57, 'cieplo');
  sprawdz('zbiornik 41 °C jest pusty', zimny !== null && zimny <= 5, `${zimny}%`);

  const goracy = naladowanieProcent(74, P57, 'cieplo');
  sprawdz('zbiornik 74 °C jest prawie pełny', goracy !== null && goracy >= 90, `${goracy}%`);

  sprawdz(
    'cieplej znaczy bardziej naładowany (monotonicznie)',
    naladowanieProcent(70, P57, 'cieplo') > naladowanieProcent(50, P57, 'cieplo'),
  );

  sprawdz('24 °C w zbiorniku parafinowym to poza skalą', pozaSkalaMaterialu(24, P57), 'skala 40–75 °C');
}

console.log('\nBRAK DANYCH');
sprawdz('bez odczytu nie zmyślamy procentu', naladowanieProcent(null, P8, 'chlod') === null);
sprawdz('bez profilu materiału też nie', naladowanieProcent(10, null, 'chlod') === null);

console.log(bledy === 0 ? '\nmiara naładowania bez zastrzeżeń\n' : `\nZASTRZEŻEŃ: ${bledy}\n`);
process.exit(bledy === 0 ? 0 : 1);
