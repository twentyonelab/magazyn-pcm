// SPRAWDZENIE MODELU DANYCH POKAZOWYCH — bez przeglądarki.
//
// Model punktów z mapy liczy temperatury dla dwóch nośników (parafina 57HC
// i materiał 8HC) i przesuwa dobę tak, żeby „teraz" wypadało na naładowaniu
// wpisanym przy punkcie. To jest arytmetyka, którą da się sprawdzić wprost —
// i lepiej ją sprawdzić tutaj niż oglądaniem wykresu.
//
// Uruchomienie:  node narzedzia/sprawdz-model-pokazowy.mjs

import { temperaturaSondyPunktu, wartosciPunktu } from '../web/src/demo/punkt.ts';
import { LOKALIZACJE } from '../web/src/map/lokalizacje.ts';
import { procentSoc, socZTemperatury } from '../web/src/soc.ts';
import { MATERIALY_POKAZOWE } from '../web/src/demo/zrodlo.ts';

const GRANICE = {
  cieplo: { dol: 44, gora: 66, pasmo: [55, 58] },
  chlod: { dol: 2, gora: 17, pasmo: [7, 9] },
};

let bledy = 0;
const zglos = (tekst) => {
  console.error('  ✗ ' + tekst);
  bledy += 1;
};

const teraz = Date.now();
const DOBA = 24 * 3600 * 1000;

console.log(`punktów: ${LOKALIZACJE.length}\n`);

for (const lok of LOKALIZACJE) {
  const g = GRANICE[lok.typ];
  const sondy = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];

  // 1. Wszystkie odczyty w zakresie nośnika (z zapasem na rozwarstwienie i szum).
  let min = Infinity;
  let max = -Infinity;
  let wPasmie = 0;
  let probek = 0;

  for (let i = 0; i <= 288; i += 1) {
    const t = teraz - DOBA + (DOBA * i) / 288;
    for (const id of sondy) {
      const v = temperaturaSondyPunktu(lok, id, t);
      if (!Number.isFinite(v)) zglos(`${lok.nazwa}/${id}: wartość nie jest liczbą`);
      min = Math.min(min, v);
      max = Math.max(max, v);
      if (v >= g.pasmo[0] && v <= g.pasmo[1]) wPasmie += 1;
      probek += 1;
    }
  }

  const zapas = 3;
  if (min < g.dol - zapas) zglos(`${lok.nazwa}: minimum ${min.toFixed(1)} poniżej zakresu ${g.dol}`);
  if (max > g.gora + zapas) zglos(`${lok.nazwa}: maksimum ${max.toFixed(1)} powyżej zakresu ${g.gora}`);

  // 2. Plateau przemiany musi być widoczne — inaczej cały sens progu przepada.
  const udzial = (100 * wPasmie) / probek;
  if (udzial < 8) zglos(`${lok.nazwa}: tylko ${udzial.toFixed(0)}% próbek w paśmie przemiany`);

  // 3. Naładowanie „teraz" ma zgadzać się z wartością wpisaną przy punkcie —
  //    inaczej znacznik na mapie mówiłby co innego niż schemat po wejściu.
  const srednia = sondy.reduce((s, id) => s + temperaturaSondyPunktu(lok, id, teraz), 0) / 6;
  const oczekiwane = lok.demoNaladowanie ?? null;

  // Liczymy DOKŁADNIE tak, jak belka stanu naładowania w aplikacji — inaczej
  // sprawdzian potwierdzałby coś innego, niż zobaczy człowiek na ekranie.
  const profil = MATERIALY_POKAZOWE.profiles[lok.typ === 'chlod' ? 'RT8HC' : 'RT57HC'];
  const odczyt = socZTemperatury(
    srednia,
    {
      tMin: profil.scaleMin,
      tMax: profil.scaleMax,
      solidus: profil.phaseBandMin,
      liquidus: profil.phaseBandMax,
      cieploPrzemiany: profil.latentHeat,
      cp: 2,
    },
    lok.typ,
  );
  const soc = odczyt.soc ?? 0;

  if (oczekiwane !== null && Math.abs(soc - oczekiwane) > 0.06) {
    zglos(
      `${lok.nazwa}: przy punkcie wpisano ${(oczekiwane * 100).toFixed(0)}%, ` +
        `a belka pokaże ${procentSoc(soc)}%`,
    );
  }

  // 4. Ciepłomierz: przy chłodzie zasilanie musi być ZIMNIEJSZE od zbiornika.
  const w = wartosciPunktu(lok, teraz);
  const t1 = w.METER_T1.v;
  const przeplyw = w.METER_FLOW.v;
  if (przeplyw > 0) {
    const zimniejsze = t1 < srednia;
    if (lok.typ === 'chlod' && !zimniejsze && w.HP_STATE.v === 1) {
      zglos(`${lok.nazwa}: chłód, a zasilanie ${t1} cieplejsze od zbiornika ${srednia.toFixed(1)}`);
    }
  }

  const znacznik =
    oczekiwane === null
      ? ''
      : ` · wpisano ${(oczekiwane * 100).toFixed(0)}%, belka ${procentSoc(soc)}%`;

  console.log(
    `${lok.typ === 'chlod' ? '❄' : '🔥'} ${lok.nazwa.padEnd(24)} ` +
    `${min.toFixed(1)}–${max.toFixed(1)} °C · w paśmie ${udzial.toFixed(0)}%${znacznik}`,
  );
}

console.log(bledy === 0 ? '\nmodel bez zastrzeżeń' : `\nZASTRZEŻEŃ: ${bledy}`);
process.exit(bledy === 0 ? 0 : 1);
