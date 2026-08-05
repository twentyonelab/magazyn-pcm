/**
 * ŹRÓDŁO DANYCH POKAZOWYCH — podstawia się pod odpowiedzi serwera.
 *
 * Moduł odpowiada dokładnie tymi samymi typami co `/api/*`, więc widoki nie
 * wiedzą, że pracują na wymyślonych liczbach, i nie ma w nich ani jednego
 * `if (tryb pokazowy)`. Cała nieprawda jest zamknięta tutaj i w `model.ts`.
 *
 * Liczby są zmyślone — patrz nagłówek `model.ts`.
 */

import type {
  Health,
  HistoryAvailable,
  MaterialsResponse,
  PointValues,
  PublicPoint,
  Snapshot,
  WeatherReading,
} from '@magazyn-pcm/shared';
import type { HistoryParams } from '../api.js';
import {
  energia,
  fazaPracy,
  moc,
  napromienienie,
  przeplyw,
  przeplywOdbioru,
  temperaturaSondy,
  temperaturaZewnetrzna,
  temperaturyObiegu,
  temperaturyOdbioru,
} from './model.js';

/**
 * Rejestr punktów — odpowiednik `server/src/points.config.ts` bez UUID-ów.
 *
 * Powielenie jest świadome: rejestr serwerowy niesie UUID-y Miniservera,
 * których nie wolno wysyłać do przeglądarki, a przeniesienie go do `shared`
 * po to, żeby pokaz miał listę punktów, przeciągnęłoby konfigurację sprzętu
 * do paczki publicznej. Lista jest krótka i zmienia się rzadko.
 */
const SONDY: Array<{ id: string; poziom: 1 | 2 | 3; przekatna: 'A' | 'B' }> = [
  { id: 'A1', poziom: 1, przekatna: 'A' },
  { id: 'A2', poziom: 2, przekatna: 'A' },
  { id: 'A3', poziom: 3, przekatna: 'A' },
  { id: 'B1', poziom: 1, przekatna: 'B' },
  { id: 'B2', poziom: 2, przekatna: 'B' },
  { id: 'B3', poziom: 3, przekatna: 'B' },
];

const OPIS_POZIOMU: Record<1 | 2 | 3, string> = { 1: 'poziom 1', 2: 'poziom 2', 3: 'poziom 3' };

export const PUNKTY_POKAZOWE: PublicPoint[] = [
  ...SONDY.map((s) => ({
    id: s.id,
    label: `Magazyn · przekątna ${s.przekatna} · ${OPIS_POZIOMU[s.poziom]}`,
    unit: '°C',
    kind: 'temperature' as const,
    group: 'pcm' as const,
    precision: 1,
    geometry: { diagonal: s.przekatna, level: s.poziom },
    available: true,
  })),
  { id: 'METER_FLOW', label: 'Źródło · przepływ', unit: 'm³/h', kind: 'flow', group: 'meter', precision: 3, available: true },
  { id: 'METER_POWER', label: 'Ciepłomierz · moc', unit: 'kW', kind: 'power', group: 'meter', precision: 2, available: true },
  { id: 'METER_ENERGY_HEAT', label: 'Ciepłomierz · energia grzania', unit: 'kWh', kind: 'energy', group: 'meter', precision: 2, available: true },
  { id: 'METER_ENERGY_COOL', label: 'Ciepłomierz · energia chłodzenia', unit: 'kWh', kind: 'energy', group: 'meter', precision: 2, available: true },
  { id: 'METER_T1', label: 'Źródło · zasilanie', unit: '°C', kind: 'temperature', group: 'meter', precision: 1, available: true },
  { id: 'METER_T2', label: 'Źródło · powrót', unit: '°C', kind: 'temperature', group: 'meter', precision: 1, available: true },
  { id: 'METER_DT', label: 'Źródło · ΔT', unit: 'K', kind: 'delta', group: 'meter', precision: 2, available: true },
  // Cieplomierz ODBIORU — lewa strona schematu. Od 2026-08-04 ma w Miniserverze
  // takze wlasny przeplyw i moc, wiec pokaz podaje je tak samo jak zrodlo.
  // Bufora tu nie ma: nie jest monitorowany (patrz points.config.ts).
  { id: 'ODBIOR_T_ZASILANIE', label: 'Odbiór · zasilanie', unit: '°C', kind: 'temperature', group: 'meter', precision: 1, available: true },
  { id: 'ODBIOR_T_POWROT', label: 'Odbiór · powrót', unit: '°C', kind: 'temperature', group: 'meter', precision: 1, available: true },
  { id: 'ODBIOR_DT', label: 'Odbiór · ΔT', unit: 'K', kind: 'delta', group: 'meter', precision: 2, available: true },
  { id: 'ODBIOR_FLOW', label: 'Odbiór · przepływ', unit: 'm³/h', kind: 'flow', group: 'meter', precision: 3, available: true },
  { id: 'ODBIOR_POWER', label: 'Odbiór · moc', unit: 'kW', kind: 'power', group: 'meter', precision: 2, available: true },
  { id: 'HP_STATE', label: 'Pompa ciepła · praca', unit: '', kind: 'state', group: 'heatpump', precision: 0, available: true },
  { id: 'PUMP_STATE', label: 'Pompa obiegowa · praca', unit: '', kind: 'state', group: 'actuator', precision: 0, available: true },
  { id: 'WEATHER_TEMP', label: 'Pogoda · temperatura zewnętrzna', unit: '°C', kind: 'temperature', group: 'ambient', precision: 1, available: true },
  { id: 'WEATHER_HUMIDITY', label: 'Pogoda · wilgotność względna', unit: '%', kind: 'state', group: 'ambient', precision: 0, available: true },
  { id: 'WEATHER_WIND', label: 'Pogoda · prędkość wiatru', unit: 'km/h', kind: 'state', group: 'ambient', precision: 0, available: true },
  { id: 'WEATHER_RADIATION', label: 'Pogoda · natężenie napromienienia', unit: 'W/m²', kind: 'power', group: 'ambient', precision: 0, available: true },
  { id: 'AMBIENT_HALL', label: 'Hala · powietrze', unit: '°C', kind: 'temperature', group: 'ambient', precision: 1, available: true },
];

/** Wartość każdego punktu w danej chwili. */
export function wartosciPokazowe(ms: number): PointValues {
  const ts = new Date(ms).toISOString();
  const swiezy = (v: number | null) => ({ v, ts, stale: false });
  const { t1, t2 } = temperaturyObiegu(ms);
  const faza = fazaPracy(ms);
  const pracuje = faza === 'ladowanie' || faza === 'rozladowanie';

  const values: PointValues = {};
  for (const s of SONDY) values[s.id] = swiezy(Number(temperaturaSondy(s.id, ms).toFixed(2)));

  values.METER_FLOW = swiezy(Number(przeplyw(ms).toFixed(3)));
  values.METER_POWER = swiezy(Number(moc(ms).toFixed(2)));
  values.METER_T1 = swiezy(Number(t1.toFixed(1)));
  values.METER_T2 = swiezy(Number(t2.toFixed(1)));
  values.METER_DT = swiezy(Number((t1 - t2).toFixed(2)));
  values.METER_ENERGY_HEAT = swiezy(Number(energia(ms, 'grzanie').toFixed(2)));
  values.METER_ENERGY_COOL = swiezy(Number(energia(ms, 'chlodzenie').toFixed(2)));

  const odbior = temperaturyOdbioru(ms);
  values.ODBIOR_T_ZASILANIE = swiezy(Number(odbior.zasilanie.toFixed(1)));
  values.ODBIOR_T_POWROT = swiezy(Number(odbior.powrot.toFixed(1)));
  values.ODBIOR_DT = swiezy(Number((odbior.zasilanie - odbior.powrot).toFixed(2)));
  const odbiorPrzeplyw = przeplywOdbioru(ms);
  values.ODBIOR_FLOW = swiezy(Number(odbiorPrzeplyw.toFixed(3)));
  values.ODBIOR_POWER = swiezy(
    Number((odbiorPrzeplyw * (odbior.zasilanie - odbior.powrot) * 1.163).toFixed(2)),
  );

  values.HP_STATE = swiezy(faza === 'ladowanie' ? 1 : 0);
  values.PUMP_STATE = swiezy(pracuje ? 1 : 0);

  values.WEATHER_TEMP = swiezy(Number(temperaturaZewnetrzna(ms).toFixed(1)));
  values.WEATHER_HUMIDITY = swiezy(Math.round(62 - temperaturaZewnetrzna(ms)));
  values.WEATHER_WIND = swiezy(Math.round(4 + 3 * Math.abs(Math.sin(ms / 7_000_000))));
  values.WEATHER_RADIATION = swiezy(napromienienie(ms));
  values.AMBIENT_HALL = swiezy(Number((19.5 + temperaturaZewnetrzna(ms) * 0.12).toFixed(1)));

  return values;
}

/** Stan zdrowia — wszystko sprawne, bo pokaz nie ma czego zgubić. */
export function zdrowiePokazowe(startMs: number): Health {
  return {
    source: 'ok',
    // Pokaz nie liczy bilansu energii — front spadnie na szacunek z temperatury.
    soc: null,
    // `mock` jest tu prawdą: widok Diagnostyka pokazuje ten rodzaj źródła
    // wprost, więc nawet tam nikt nie zobaczy „Miniserver".
    sourceKind: 'mock',
    bank: {
      active: 'RT57HC',
      detection: 'manual',
      alive: { RT57HC: 6 },
      message: 'Zestaw ustawiony na sztywno przez tryb pokazowy.',
    },
    latencyMs: 42,
    lastOkAt: new Date().toISOString(),
    staleIds: [],
    pendingUuidIds: [],
    uptimeS: Math.round((Date.now() - startMs) / 1000),
    pollIntervalMs: 2000,
    staleAfterMs: 10_000,
    message: 'Dane pokazowe — wartości wyliczone, nie zmierzone.',
    configChanged: false,
  };
}

export const MATERIALY_POKAZOWE: MaterialsResponse = {
  defaultMaterial: 'RT57HC',
  profiles: {
    // Liczby jak w `server/src/materials.config.ts` — z kart Rubitherm.
    // `latentHeat` to CIEPŁO UTAJONE (pojemność z karty minus ciepło jawne
    // w podanym przedziale), `capacityKJkg` to pozycja „Heat storage capacity"
    // wprost z dokumentu. Pasmo 57HC to 53–58: suma topnienia (55–58)
    // i krzepnięcia (53–57), tak jak w konfiguracji serwera.
    RT8HC: { id: 'RT8HC', label: '8HC', scaleMin: 0, scaleMax: 20, phaseBandMin: 7, phaseBandMax: 9, peak: 8, latentHeat: 162, capacityKJkg: 190, capacityFromC: 1, capacityToC: 15, cp: 2, tMax: 40 },
    RT57HC: { id: 'RT57HC', label: '57HC', scaleMin: 40, scaleMax: 75, phaseBandMin: 53, phaseBandMax: 58, peak: 57, latentHeat: 210, capacityKJkg: 240, capacityFromC: 49, capacityToC: 64, cp: 2, tMax: 90 },
  },
  volumesL: { buffer: 80, storage: 200 },
  flowFullSpeed: 0.8,
};

export function migawkaPokazowa(startMs: number): Snapshot {
  const teraz = Date.now();
  return {
    ts: new Date(teraz).toISOString(),
    session: null,
    values: wartosciPokazowe(teraz),
    health: zdrowiePokazowe(startMs),
  };
}

export function pogodaPokazowa(): WeatherReading {
  const teraz = Date.now();
  const naslonecznienie = napromienienie(teraz);
  return {
    source: 'open-meteo',
    ts: new Date(teraz).toISOString(),
    place: 'Gliwice, ul. Kaszubska 26',
    tempC: Number(temperaturaZewnetrzna(teraz).toFixed(1)),
    humidity: Math.round(62 - temperaturaZewnetrzna(teraz)),
    windKmh: Math.round(4 + 3 * Math.abs(Math.sin(teraz / 7_000_000))),
    radiationWm2: naslonecznienie,
    cloudCover: naslonecznienie > 300 ? 20 : 75,
    text: naslonecznienie > 300 ? 'słonecznie' : 'zachmurzenie',
  };
}

/**
 * Historia dla dowolnego zakresu.
 *
 * Liczba próbek jest ograniczona do `MAKS_PROBEK`, bo model liczy każdą
 * wartość osobno, a licznik energii sumuje kwadranse od północy — przy dobie
 * surowych próbek co dwie sekundy przeglądarka stanęłaby na kilka sekund.
 * Krok dobierany jest tak, żeby zakres zawsze zmieścił się w tym limicie.
 */
const MAKS_PROBEK = 720;

export function historiaPokazowa(params: HistoryParams): HistoryAvailable {
  const odMs = Date.parse(params.from);
  const doMs = Date.parse(params.to);
  const zadany = KROKI[params.resolution] ?? 0;
  const minimalny = Math.ceil((doMs - odMs) / MAKS_PROBEK);
  const krok = Math.max(zadany, minimalny, 1000);

  const series = params.ids.map((id) => {
    const points: Array<{ ts: string; v: number | null }> = [];
    for (let t = odMs; t <= doMs; t += krok) {
      points.push({ ts: new Date(t).toISOString(), v: wartoscHistoryczna(id, t) });
    }
    return { id, points };
  });

  return {
    available: true,
    from: new Date(odMs).toISOString(),
    to: new Date(doMs).toISOString(),
    resolution: opisKroku(krok),
    series,
  };
}

const KROKI: Record<string, number> = {
  raw: 2000,
  '30s': 30_000,
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  auto: 0,
};

function opisKroku(ms: number): string {
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

/** Pojedyncza wartość historyczna — ta sama funkcja co dla odczytu bieżącego. */
function wartoscHistoryczna(id: string, ms: number): number | null {
  if (/^[AB][123]$/.test(id)) return Number(temperaturaSondy(id, ms).toFixed(2));

  const { t1, t2 } = temperaturyObiegu(ms);
  switch (id) {
    case 'METER_FLOW':
      return Number(przeplyw(ms).toFixed(3));
    case 'METER_POWER':
      return Number(moc(ms).toFixed(2));
    case 'METER_T1':
      return Number(t1.toFixed(1));
    case 'METER_T2':
      return Number(t2.toFixed(1));
    case 'METER_DT':
      return Number((t1 - t2).toFixed(2));
    case 'ODBIOR_T_ZASILANIE':
      return Number(temperaturyOdbioru(ms).zasilanie.toFixed(1));
    case 'ODBIOR_T_POWROT':
      return Number(temperaturyOdbioru(ms).powrot.toFixed(1));
    case 'ODBIOR_DT': {
      const o = temperaturyOdbioru(ms);
      return Number((o.zasilanie - o.powrot).toFixed(2));
    }
    case 'ODBIOR_FLOW':
      return Number(przeplywOdbioru(ms).toFixed(3));
    case 'ODBIOR_POWER': {
      const o = temperaturyOdbioru(ms);
      return Number((przeplywOdbioru(ms) * (o.zasilanie - o.powrot) * 1.163).toFixed(2));
    }
    case 'WEATHER_TEMP':
      return Number(temperaturaZewnetrzna(ms).toFixed(1));
    case 'WEATHER_RADIATION':
      return napromienienie(ms);
    case 'AMBIENT_HALL':
      return Number((19.5 + temperaturaZewnetrzna(ms) * 0.12).toFixed(1));
    case 'HP_STATE':
      return fazaPracy(ms) === 'ladowanie' ? 1 : 0;
    case 'PUMP_STATE': {
      const f = fazaPracy(ms);
      return f === 'ladowanie' || f === 'rozladowanie' ? 1 : 0;
    }
    // Liczniki energii pomijamy w historii: model całkuje je od północy, więc
    // na wykresie tygodniowym co dobę spadałyby do zera i wyglądałyby na awarię.
    default:
      return null;
  }
}
