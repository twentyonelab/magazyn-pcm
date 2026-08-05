/**
 * DANE POKAZOWE POJEDYNCZEGO PUNKTU Z MAPY.
 *
 * Dwadzieścia punktów na mapie było dotąd samymi znacznikami — dało się w nie
 * najechać, ale nie wejść. Ten moduł daje każdemu z nich komplet odczytów,
 * dzięki czemu z mapy można przejść do schematu i zobaczyć, jak wyglądałby ten
 * magazyn, gdyby stał i mierzył.
 *
 * TE LICZBY SĄ ZMYŚLONE — tak samo jak w `model.ts` i tak samo oznaczone
 * plakietką. Za tymi punktami nie stoi żadna instalacja.
 *
 * CO ODRÓŻNIA PUNKTY OD SIEBIE
 *
 *   nośnik           Magazyn ciepła pracuje parafiną 57HC (przemiana 55–58 °C,
 *                    zakres 44–66), magazyn chłodu materiałem 8HC (przemiana
 *                    7–9 °C, zakres 2–17). Cały interfejs bierze stąd barwę.
 *
 *   poziom           Każdy punkt ma w `lokalizacje.ts` wpisane naładowanie.
 *                    Doba pracy jest PRZESUNIĘTA W CZASIE tak, żeby „teraz"
 *                    wypadało dokładnie na tym poziomie — inaczej znacznik na
 *                    mapie pokazywałby co innego niż schemat po wejściu.
 *
 * Przesunięcie liczy się raz na punkt i jest zapamiętane: skanujemy dobę co
 * pięć minut i bierzemy chwilę najbliższą żądanemu poziomowi. Prościej byłoby
 * po prostu dodać stałą do temperatury, ale wtedy plateau przemiany wypadłoby
 * w złym miejscu skali i wykres przestałby mieć sens fizyczny.
 */

import type {
  Health,
  HistoryAvailable,
  MaterialsResponse,
  PcmMaterial,
  PointValues,
  Snapshot,
} from '@magazyn-pcm/shared';
import type { HistoryParams } from '../api.js';
import { socZTemperatury, type Kierunek } from '../soc.js';
import type { Lokalizacja } from '../map/lokalizacje.js';
import { fazaPracy, postepDoby, temperaturaZPostepu } from './model.js';
import { MATERIALY_POKAZOWE, PUNKTY_POKAZOWE } from './zrodlo.js';

/** Parametry cieplne nośnika — z profili materiałów, nie z powietrza. */
interface ParametryNosnika {
  material: PcmMaterial;
  /** Dolna i górna temperatura cyklu. */
  tDol: number;
  tGora: number;
  pasmoMin: number;
  pasmoMax: number;
}

const NOSNIK: Record<Kierunek, ParametryNosnika> = {
  cieplo: { material: 'RT57HC', tDol: 44, tGora: 66, pasmoMin: 55, pasmoMax: 58 },
  // 8HC topi się przy 7–9 °C. Zakres cyklu dobrany symetrycznie wokół pasma,
  // tak jak przy parafinie: kilkanaście stopni w jedną i drugą stronę.
  chlod: { material: 'RT8HC', tDol: 2, tGora: 17, pasmoMin: 7, pasmoMax: 9 },
};

/**
 * Przesunięcie doby, po którym „teraz" wypada na naładowaniu wpisanym
 * przy punkcie.
 *
 * MIARĄ JEST SOC, NIE POSTĘP CYKLU. Pierwsza wersja dopasowywała postęp doby
 * i rozjeżdżała się nawet o 25 punktów procentowych: między postępem a stanem
 * naładowania stoi plateau przemiany, które ściska temperaturę, oraz odwrócenie
 * znaku przy chłodzie (zamrożony = naładowany). Skanujemy więc tę samą funkcję,
 * którą liczy belka stanu — dzięki temu znacznik na mapie i belka po wejściu
 * w punkt pokazują tę samą liczbę z konstrukcji, a nie przez przypadek.
 *
 * Liczone raz na punkt i trzymane w pamięci: bez tego każde tyknięcie zegara
 * przeskanowałoby dobę od nowa, 288 razy, dla każdego widocznego punktu.
 */
const przesuniecia = new Map<string, number>();

function przesuniecieDoby(lok: Lokalizacja): number {
  const zapamietane = przesuniecia.get(lok.id);
  if (zapamietane !== undefined) return zapamietane;

  const poziom = lok.demoNaladowanie ?? 0.5;
  const n = NOSNIK[lok.typ];
  const profil = MATERIALY_POKAZOWE.profiles[n.material];
  const parametry = {
    tMin: profil.scaleMin,
    tMax: profil.scaleMax,
    solidus: profil.phaseBandMin,
    liquidus: profil.phaseBandMax,
    cieploPrzemiany: profil.latentHeat,
    cp: profil.cp,
  };

  const teraz = Date.now();
  const krok = 5 * 60 * 1000;
  let najlepsze = 0;
  let bladNajlepszego = Infinity;

  // Zapisujemy przesunięcie ZANIM zaczniemy skanować: funkcje niżej są czyste,
  // ale gdyby ktoś kiedyś wpiął tu taką, która sięga po przesunięcie, powstałaby
  // nieskończona rekurencja. Zero jest neutralne.
  przesuniecia.set(lok.id, 0);

  for (let i = 0; i < 288; i += 1) {
    const przesun = i * krok;
    // ŚREDNIA Z SOND, nie temperatura bazowa — belka liczy właśnie ze średniej,
    // więc tylko tak przesunięcie trafia w zadany poziom.
    const t = sredniaSondDlaCzasu(n, teraz + przesun);
    const odczyt = socZTemperatury(t, parametry, lok.typ);
    if (odczyt.soc === null) continue;
    const blad = Math.abs(odczyt.soc - poziom);
    if (blad < bladNajlepszego) {
      bladNajlepszego = blad;
      najlepsze = przesun;
    }
  }

  przesuniecia.set(lok.id, najlepsze);
  return najlepsze;
}

function nosnikPunktu(lok: Lokalizacja): ParametryNosnika {
  return NOSNIK[lok.typ];
}

const SONDY = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'] as const;

/**
 * Temperatura jednej sondy dla czasu JUŻ PRZESUNIĘTEGO.
 *
 * Wydzielone z `temperaturaSondyPunktu`, żeby dobieranie przesunięcia mogło
 * liczyć ŚREDNIĄ Z SZEŚCIU SOND, a nie samą temperaturę bazową. Przy wąskiej
 * skali 8HC (0–20 °C) różnica między jednym a drugim to około 0,1 K, co przy
 * plateau przemiany przekłada się na kilka punktów procentowych naładowania —
 * i właśnie tyle rozjazdu pokazał sprawdzian dla punktów chłodu.
 *
 * Funkcja jest czysta: nie sięga po zapamiętane przesunięcie, więc skan może
 * ją wołać bez ryzyka rekurencji.
 */
function temperaturaSondyDlaCzasu(n: ParametryNosnika, id: string, czas: number): number {
  const poziom = Number(id[1]) as 1 | 2 | 3;
  const przekatna = id[0] === 'B' ? 1 : 0;

  const bazowa = temperaturaZPostepu(postepDoby(czas), n);

  const faza = fazaPracy(czas);
  const ruch = faza === 'postoj' || faza === 'spoczynek' ? 0.35 : 1;
  // Rozwarstwienie skalowane rozpiętością cyklu: przy 8HC cały zakres jest
  // o dwie trzecie węższy, więc te same 1,9 K byłyby tam ogromne.
  const rozpietosc = (n.tGora - n.tDol) / 22;
  const rozwarstwienie = (poziom - 2) * 1.9 * ruch * rozpietosc;

  const szum = Math.sin(czas * 0.0000123 + poziom * 31 + przekatna * 7) * 0.05;
  return bazowa + rozwarstwienie - przekatna * 0.28 * rozpietosc + szum;
}

/** Średnia z sześciu sond — dokładnie ta wielkość, z której liczy się belka. */
function sredniaSondDlaCzasu(n: ParametryNosnika, czas: number): number {
  let suma = 0;
  for (const id of SONDY) suma += temperaturaSondyDlaCzasu(n, id, czas);
  return suma / SONDY.length;
}

/** Temperatura jednej sondy w punkcie pokazowym. */
export function temperaturaSondyPunktu(lok: Lokalizacja, id: string, ms: number): number {
  return temperaturaSondyDlaCzasu(nosnikPunktu(lok), id, ms + przesuniecieDoby(lok));
}

export function wartosciPunktu(lok: Lokalizacja, ms: number): PointValues {
  const n = nosnikPunktu(lok);
  const przesun = przesuniecieDoby(lok);
  const faza = fazaPracy(ms + przesun);
  const pracuje = faza === 'ladowanie' || faza === 'rozladowanie';
  const ts = new Date(ms).toISOString();
  const swiezy = (v: number | null) => ({ v, ts, stale: false });

  const values: PointValues = {};
  for (const id of SONDY) {
    values[id] = swiezy(Number(temperaturaSondyPunktu(lok, id, ms).toFixed(2)));
  }

  const srednia =
    (temperaturaSondyPunktu(lok, 'A3', ms) + temperaturaSondyPunktu(lok, 'A1', ms)) / 2;

  // Przy chłodzie ładowanie ZABIERA ciepło, więc zasilanie jest zimniejsze od
  // zbiornika, nie cieplejsze. Znak idzie za nośnikiem.
  const znak = lok.typ === 'chlod' ? -1 : 1;
  const rozpietosc = (n.tGora - n.tDol) / 22;
  const t1 = srednia + (faza === 'ladowanie' ? 4.2 : faza === 'rozladowanie' ? -3.8 : 0.1) * znak * rozpietosc;
  const t2 = srednia + (faza === 'ladowanie' ? 0.5 : faza === 'rozladowanie' ? -0.4 : -0.1) * znak * rozpietosc;
  const przeplyw = pracuje ? 0.55 : 0;

  values.METER_FLOW = swiezy(Number(przeplyw.toFixed(3)));
  values.METER_T1 = swiezy(Number(t1.toFixed(1)));
  values.METER_T2 = swiezy(Number(t2.toFixed(1)));
  values.METER_DT = swiezy(Number((t1 - t2).toFixed(2)));
  values.METER_POWER = swiezy(Number((przeplyw * (t1 - t2) * 1.163).toFixed(2)));
  // Liczników energii nie zmyślamy: punkt pokazowy nie ma ciepłomierza,
  // z którego dałoby się je odczytać, a wpisanie liczby sugerowałoby pomiar.
  values.METER_ENERGY_HEAT = { v: null, ts: null, stale: true };
  values.METER_ENERGY_COOL = { v: null, ts: null, stale: true };

  /*
   * CIEPŁOMIERZ ODBIORU — lewa strona schematu.
   *
   * Drugi obieg pracuje w PRZECIWNEJ fazie niż źródło: źródło ładuje magazyn,
   * odbiór go rozładowuje. Przy ładowaniu odbiór stoi, więc obie jego sondy
   * widzą temperaturę zbiornika i ΔT siada na zerze — dokładnie tak, jak
   * wygląda prawdziwe stanowisko, gdy nikt ciepła nie pobiera.
   *
   * Kierunek różnicy wynika ze strzałek na rysunku: rurą przy x=694 płyn
   * WYCHODZI ze zbiornika, przy x=672 WRACA. Wychodzący jest więc bliżej
   * temperatury magazynu, wracający — o kilka kelwinów dalej, bo odbiorca
   * zdążył ciepło zabrać (przy chłodzie: dogrzać).
   */
  const odbiorPracuje = faza === 'rozladowanie';
  const odbiorZasilanie = srednia - 0.3 * znak * rozpietosc;
  const odbiorPowrot = odbiorPracuje
    ? srednia - 3.7 * znak * rozpietosc
    : srednia - 0.4 * znak * rozpietosc;
  values.ODBIOR_T_ZASILANIE = swiezy(Number(odbiorZasilanie.toFixed(1)));
  values.ODBIOR_T_POWROT = swiezy(Number(odbiorPowrot.toFixed(1)));
  values.ODBIOR_DT = swiezy(Number((odbiorZasilanie - odbiorPowrot).toFixed(2)));
  // Obieg odbioru ma od 2026-08-04 wlasny przeplyw i moc w Miniserverze,
  // wiec punkt pokazowy tez je podaje. Bufora nie — nie jest monitorowany.
  const odbiorPrzeplyw = odbiorPracuje ? 0.42 : 0;
  values.ODBIOR_FLOW = swiezy(Number(odbiorPrzeplyw.toFixed(3)));
  values.ODBIOR_POWER = swiezy(
    Number((odbiorPrzeplyw * (odbiorZasilanie - odbiorPowrot) * 1.163).toFixed(2)),
  );

  values.HP_STATE = swiezy(faza === 'ladowanie' ? 1 : 0);
  values.PUMP_STATE = swiezy(pracuje ? 1 : 0);

  // Pogoda i hala są wspólne dla całego regionu — punkty leżą na Śląsku,
  // kilkadziesiąt kilometrów od siebie.
  const godzina = new Date(ms).getHours() + new Date(ms).getMinutes() / 60;
  const zewnetrzna = 9.5 + 6 * Math.sin(((godzina - 9) / 24) * 2 * Math.PI);
  values.WEATHER_TEMP = swiezy(Number(zewnetrzna.toFixed(1)));
  values.AMBIENT_HALL = swiezy(Number((19.5 + zewnetrzna * 0.12).toFixed(1)));

  return values;
}

export function materialyPunktu(lok: Lokalizacja): MaterialsResponse {
  return { ...MATERIALY_POKAZOWE, defaultMaterial: nosnikPunktu(lok).material };
}

export function zdrowiePunktu(lok: Lokalizacja, startMs: number): Health {
  const n = nosnikPunktu(lok);
  return {
    source: 'ok',
    // Pokaz nie liczy bilansu energii — front spadnie na szacunek z temperatury.
    soc: null,
    sourceKind: 'mock',
    bank: {
      active: n.material,
      detection: 'manual',
      alive: { [n.material]: 6 },
      message: `Punkt pokazowy „${lok.nazwa}" — wartości wyliczone, nie zmierzone.`,
    },
    latencyMs: 38,
    lastOkAt: new Date().toISOString(),
    staleIds: ['METER_ENERGY_HEAT', 'METER_ENERGY_COOL'],
    pendingUuidIds: [],
    uptimeS: Math.round((Date.now() - startMs) / 1000),
    pollIntervalMs: 2000,
    staleAfterMs: 10_000,
    message: `Punkt pokazowy „${lok.nazwa}" — za tymi liczbami nie stoi instalacja.`,
    configChanged: false,
  };
}

export function migawkaPunktu(lok: Lokalizacja, startMs: number): Snapshot {
  const teraz = Date.now();
  return {
    ts: new Date(teraz).toISOString(),
    session: null,
    values: wartosciPunktu(lok, teraz),
    health: zdrowiePunktu(lok, startMs),
  };
}

export const PUNKTY_PUNKTU = PUNKTY_POKAZOWE;

/** Historia punktu — ta sama funkcja co odczyt bieżący, próbkowana wstecz. */
export function historiaPunktu(lok: Lokalizacja, params: HistoryParams): HistoryAvailable {
  const odMs = Date.parse(params.from);
  const doMs = Date.parse(params.to);
  const krok = Math.max(Math.ceil((doMs - odMs) / 720), 1000);

  const series = params.ids.map((id) => {
    const points: Array<{ ts: string; v: number | null }> = [];
    for (let t = odMs; t <= doMs; t += krok) {
      const v = /^[AB][123]$/.test(id)
        ? Number(temperaturaSondyPunktu(lok, id, t).toFixed(2))
        : (wartosciPunktu(lok, t)[id]?.v ?? null);
      points.push({ ts: new Date(t).toISOString(), v });
    }
    return { id, points };
  });

  const opis = krok >= 3_600_000 ? `${Math.round(krok / 3_600_000)}h`
    : krok >= 60_000 ? `${Math.round(krok / 60_000)}m`
    : `${Math.round(krok / 1000)}s`;

  return {
    available: true,
    from: new Date(odMs).toISOString(),
    to: new Date(doMs).toISOString(),
    resolution: opis,
    series,
  };
}
