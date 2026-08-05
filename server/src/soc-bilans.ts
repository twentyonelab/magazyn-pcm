/**
 * NALADOWANIE Z BILANSU ENERGII — kotwica plus calka mocy.
 *
 * PROBLEM, KTORY TEN MODUL ROZWIAZUJE. W pasmie przemiany temperatura stoi
 * godzinami, wiec szacunek naladowania z temperatury jest tam interpolacja
 * bez tresci: 2026-08-05 po calej nocy ladowania pokazywal 60 %, podczas gdy
 * bilans energii (7,5 kWh wyjete przy 7,9 mozliwych) mowil ~90 %. Termometr
 * w plateau nie wie, ile zamarzlo — wie to tylko licznik energii.
 *
 * METODA: HYBRYDA.
 *   1. KOTWICA. Cofamy sie w historii do ostatniej chwili, gdy srednia sond
 *      byla POZA pasmem przemiany — tam temperatura niesie pelna informacje
 *      i szacunek z niej jest wiarygodny.
 *   2. CALKA. Od kotwicy do teraz sumujemy moc wymiany zbiornika:
 *      zrodlo F x (T1 - T2) x 1,163 (dodatnie = grzeje zbiornik), odbior
 *      z licznika ODBIOR_Moc, plus staly doplyw ciepla z hali. Znak wkladu
 *      w naladowanie zalezy od nosnika: chlod laduje sie ODBIEDANIEM ciepla.
 *
 * KANALU MOCY ZRODLA (METER_POWER) CELOWO NIE UZYWAMY: pokazywal -17 kW przy
 * zerowym przeplywie (2026-08-04). Moc liczymy z przeplywu i pary temperatur,
 * dokladnie tak jak w recznych analizach, z ktorych ta metoda wyrosla.
 *
 * UCZCIWOSC. Kubelki bez danych (serwer nie dzialal) wnosza do calki ZERO
 * i obnizaja `pokrycie`. Ponizej 50 % pokrycia bilans jest odrzucany i wraca
 * szacunek z temperatury — lepiej przyznac sie do dziury, niz doliczyc
 * energie, ktorej nikt nie zmierzyl. Na produkcji (Railway) serwer chodzi
 * bez przerwy i pokrycie jest pelne; dziury to przypadlosc pracy lokalnej.
 */

import type { MaterialProfile, PcmMaterial, SocState } from '@magazyn-pcm/shared';
import type { ValueCache } from './cache.js';
import type { SqliteHistoryStore } from './history/sqlite-store.js';
import type { PointRegistry } from './registry.js';

/** Krok siatki calkowania. 5 min gladko znosi taktowanie pompy ciepla. */
const KROK_MS = 5 * 60 * 1000;

/** Jak daleko wstecz szukamy kotwicy. Dluzej niz tydzien = brak kotwicy. */
const OKNO_KOTWICY_MS = 7 * 24 * 3600 * 1000;

/**
 * Margines wokol pasma przemiany. Kotwica wymaga wyjscia POZA pasmo o tyle,
 * zeby szum sond (0,06 K rozdzielczosci DS18B20) nie robil kotwic na granicy.
 */
const MARGINES_K = 0.15;

/** Dziura w probkach dluzsza niz to = danych nie ma (heartbeat pisze co 5 min). */
const MAKS_DZIURA_MS = 45 * 60 * 1000;

/** Ponizej tego pokrycia bilans klamie bardziej niz termometr. */
const MIN_POKRYCIE = 0.5;

/**
 * Doplyw ciepla z otoczenia, kW. Zmierzony z dryfu zbiornika przy postoju
 * (0,3 K/h w strefie jawnej = ~29 W). Dla ciepla znak sie odwraca — magazyn
 * 57HC jest cieplejszy od hali i traci.
 */
const PRZECIEK_KW = 0.03;

/** kW na (m3/h x K) dla wody. */
const STALA_WODY = 1.163;

/** Cache wyniku — bilans liczy sie z historii, nie ma po co mielic co zadanie. */
const CACHE_MS = 30 * 1000;

interface Probka {
  ms: number;
  v: number;
}

export interface SocBilansDeps {
  /** null = backend NDJSON — bilansu nie ma z czego policzyc. */
  reader: SqliteHistoryStore | null;
  registry: PointRegistry;
  cache: ValueCache;
  getMaterial: () => MaterialProfile;
  masaKg: Record<PcmMaterial, number>;
}

/** Entalpia wzgledem dolnego kranca skali materialu, kJ/kg. */
function entalpia(t: number, p: MaterialProfile): number {
  const doSolidusu = p.cp * (Math.min(t, p.phaseBandMin) - p.scaleMin);
  if (t <= p.phaseBandMin) return doSolidusu;
  const szerokosc = p.phaseBandMax - p.phaseBandMin;
  const wPasmie =
    t <= p.phaseBandMax
      ? (p.latentHeat * (t - p.phaseBandMin)) / szerokosc
      : p.latentHeat + p.cp * (t - p.phaseBandMax);
  return doSolidusu + wPasmie;
}

function przytnij01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Interpolacja liniowa w obrebie probek; null poza nimi i przez duze dziury. */
function interpoluj(probki: Probka[], ms: number): number | null {
  if (probki.length === 0) return null;
  if (ms < probki[0]!.ms || ms > probki[probki.length - 1]!.ms) return null;

  let lo = 0;
  let hi = probki.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (probki[mid]!.ms <= ms) lo = mid;
    else hi = mid;
  }
  const a = probki[lo]!;
  const b = probki[hi]!;
  if (b.ms - a.ms > MAKS_DZIURA_MS) return null;
  if (b.ms === a.ms) return a.v;
  return a.v + ((b.v - a.v) * (ms - a.ms)) / (b.ms - a.ms);
}

export class SocBilans {
  private wynik: SocState | null = null;
  private wynikAtMs = 0;

  constructor(private readonly deps: SocBilansDeps) {}

  current(): SocState | null {
    const teraz = Date.now();
    if (this.wynik && teraz - this.wynikAtMs < CACHE_MS) return this.wynik;
    this.wynik = this.policz(teraz);
    this.wynikAtMs = teraz;
    return this.wynik;
  }

  private profilICieplo(): {
    profil: MaterialProfile;
    kierunek: 'cieplo' | 'chlod';
    pojemnoscKWh: number;
  } {
    const profil = this.deps.getMaterial();
    const kierunek = profil.id === 'RT8HC' ? 'chlod' : 'cieplo';
    const masa = this.deps.masaKg[profil.id];
    const pojemnoscKWh = (masa * entalpia(profil.scaleMax, profil)) / 3600;
    return { profil, kierunek, pojemnoscKWh };
  }

  /** SOC z samej temperatury — kotwica i tryb awaryjny. */
  private socZTemperatury(t: number, profil: MaterialProfile, kierunek: 'cieplo' | 'chlod'): number {
    const udzial = przytnij01(entalpia(t, profil) / entalpia(profil.scaleMax, profil));
    return kierunek === 'chlod' ? 1 - udzial : udzial;
  }

  private policz(terazMs: number): SocState | null {
    const { profil, kierunek, pojemnoscKWh } = this.profilICieplo();

    const sondy = this.deps.registry
      .all()
      .filter((p) => p.group === 'pcm' && p.geometry)
      .map((p) => p.id);

    // Biezaca srednia z zywych odczytow — bez niej nie ma zadnego wyniku.
    const zywe = sondy
      .map((id) => this.deps.cache.get(id).v)
      .filter((v): v is number => typeof v === 'number');
    if (zywe.length === 0) return null;
    const sredniaTeraz = zywe.reduce((a, b) => a + b, 0) / zywe.length;

    const awaryjnie = (): SocState => {
      const soc = this.socZTemperatury(sredniaTeraz, profil, kierunek);
      return {
        soc,
        energiaKWh: soc * pojemnoscKWh,
        pojemnoscKWh,
        zrodlo: 'temperatura',
        kotwicaTs: null,
        pokrycie: null,
      };
    };

    // Poza pasmem temperatura mowi prawde — bilans nie ma czego poprawiac.
    const wPasmie =
      sredniaTeraz > profil.phaseBandMin - MARGINES_K &&
      sredniaTeraz < profil.phaseBandMax + MARGINES_K;
    if (!wPasmie) return awaryjnie();

    const reader = this.deps.reader;
    if (!reader) return awaryjnie();

    // --- Probki z historii -------------------------------------------------
    const odMs = terazMs - OKNO_KOTWICY_MS;
    const czytaj = (id: string): Probka[] =>
      reader
        .queryBuckets(id, odMs, terazMs, KROK_MS)
        .filter((p) => p.v !== null)
        .map((p) => ({ ms: Date.parse(p.ts), v: p.v as number }));

    const serieSond = sondy.map(czytaj);
    const przeplyw = czytaj('METER_FLOW');
    const t1 = czytaj('METER_T1');
    const t2 = czytaj('METER_T2');
    const odbiorMoc = czytaj('ODBIOR_POWER');
    const odbiorPrzeplyw = czytaj('ODBIOR_FLOW');

    const sredniaSond = (ms: number): number | null => {
      const w = serieSond
        .map((s) => interpoluj(s, ms))
        .filter((v): v is number => v !== null);
      // Cztery z szesciu wystarcza na srednia; mniej znaczy dziure w zapisie.
      return w.length >= 4 ? w.reduce((a, b) => a + b, 0) / w.length : null;
    };

    // --- Kotwica: ostatnia chwila poza pasmem ------------------------------
    let kotwicaMs: number | null = null;
    let kotwicaSoc = 0;
    for (let ms = terazMs - KROK_MS; ms >= odMs; ms -= KROK_MS) {
      const sr = sredniaSond(ms);
      if (sr === null) continue;
      if (sr > profil.phaseBandMax + MARGINES_K || sr < profil.phaseBandMin - MARGINES_K) {
        kotwicaMs = ms;
        kotwicaSoc = this.socZTemperatury(sr, profil, kierunek);
        break;
      }
    }
    if (kotwicaMs === null) return awaryjnie();

    // --- Calka mocy od kotwicy ---------------------------------------------
    let cieploDoZbiornikaKWh = 0;
    let krokiPokryte = 0;
    let krokiRazem = 0;

    for (let ms = kotwicaMs; ms < terazMs; ms += KROK_MS) {
      krokiRazem += 1;
      const dtH = KROK_MS / 3600e3;
      let pokryty = false;

      const f = interpoluj(przeplyw, ms);
      const a = interpoluj(t1, ms);
      const b = interpoluj(t2, ms);
      if (f !== null && f > 0.05 && a !== null && b !== null) {
        // Dodatnie = zasilanie cieplejsze od powrotu = zrodlo GRZEJE zbiornik.
        cieploDoZbiornikaKWh += f * (a - b) * STALA_WODY * dtH;
        pokryty = true;
      }

      const fo = interpoluj(odbiorPrzeplyw, ms);
      const po = interpoluj(odbiorMoc, ms);
      if (fo !== null && fo > 0.05 && po !== null && po > 0.05) {
        // Odbior ZABIERA nosnik: przy chlodzie wklada cieplo do zbiornika,
        // przy cieple je wyjmuje.
        cieploDoZbiornikaKWh += (kierunek === 'chlod' ? po : -po) * dtH;
        pokryty = true;
      }

      // Przeciek z hali dziala zawsze, takze przez dziury w danych — to
      // fizyka zbiornika, nie zapis. Chlod: hala grzeje; cieplo: hala chlodzi.
      cieploDoZbiornikaKWh += (kierunek === 'chlod' ? PRZECIEK_KW : -PRZECIEK_KW) * dtH;

      if (pokryty) krokiPokryte += 1;
    }

    const pokrycie = krokiRazem > 0 ? krokiPokryte / krokiRazem : 0;
    if (pokrycie < MIN_POKRYCIE) return awaryjnie();

    // Chlod laduje sie ODBIERANIEM ciepla, wiec cieplo dodane zmniejsza SOC.
    const delta =
      (kierunek === 'chlod' ? -cieploDoZbiornikaKWh : cieploDoZbiornikaKWh) / pojemnoscKWh;
    const soc = przytnij01(kotwicaSoc + delta);

    return {
      soc,
      energiaKWh: soc * pojemnoscKWh,
      pojemnoscKWh,
      zrodlo: 'bilans-energii',
      kotwicaTs: new Date(kotwicaMs).toISOString(),
      pokrycie: Number(pokrycie.toFixed(2)),
    };
  }
}
