/**
 * Panel elementu instalacji — ciepłomierz, bufor, pompa, zawór, magazyn.
 *
 * Otwiera się kliknięciem elementu na schemacie. Pokazuje wszystkie punkty
 * pomiarowe należące do tego urządzenia, jego stan i to, czego brakuje,
 * żeby zaczęło raportować.
 *
 * Dlaczego osobno od panelu sondy: sonda ma jedną wartość i historię, a
 * urządzenie ma zestaw punktów i własny kontekst sprzętowy. Wspólny komponent
 * musiałby udawać oba naraz.
 */

import type { LiveData } from '../useLiveData.js';
import {
  FALLBACK_STALE_AFTER_MS,
  NO_DATA,
  POINT_STATE_LABEL,
  formatAge,
  formatValue,
  pointState,
} from '../format.js';

/** Opis elementu instalacji: jakie punkty ma i co warto o nim wiedzieć. */
interface ElementInfo {
  title: string;
  subtitle: string;
  pointIds: string[];
  /**
   * Uwagi sprzętowe — TYLKO DLA MAGAZYNU. Wszystkie pozostałe elementy
   * straciły opisy 2026-08-04 na wyraźną prośbę: panel bufora, naczynia czy
   * manometru ma powiedzieć, czym element jest (tytuł i podtytuł), i tyle.
   * Akapity w rodzaju „Przejmuje przyrost objętości wody…" przenosiły
   * dokumentację instalacji na ekran, na którym nikt jej nie szukał.
   */
  notes?: string[];
}

const ELEMENTS: Record<string, ElementInfo> = {
  storage: {
    title: 'Magazyn PCM',
    subtitle: 'Zbiornik z materiałem zmiennofazowym',
    pointIds: ['A3', 'B3', 'A2', 'B2', 'A1', 'B1'],
    notes: [
      'Sześć sond Loxone 200077 (DS18B20) zanurzonych bezpośrednio w parafinie, przywiązanych do dwóch prętów na przekątnych zbiornika.',
      'Przewodność cieplna parafiny to 0,2 W/(m·K) — konwekcji praktycznie nie ma, więc front przemiany posuwa się od wymiennika na zewnątrz, a stałe czasowe są w minutach.',
      'Kliknij pojedynczą sondę, żeby zobaczyć jej historię.',
    ],
  },
  buffer: {
    title: 'Bufor',
    subtitle: 'Zbiornik buforowy między pompą ciepła a magazynem · bez pomiaru',
    /*
     * BUFOR NIE JEST MONITOROWANY i panel mówi to wprost, zamiast pokazywać
     * dwa puste wiersze „Bufor · góra / dół". Stały tu wcześniej punkty
     * BUFFER_TOP i BUFFER_BOTTOM z wiecznym „—”: element, który wygląda jak
     * zepsuty czujnik, choć czujnika nigdy nie było. Usunięte 2026-08-04.
     */
    pointIds: [],
  },
  meter: {
    title: 'Ciepłomierz',
    subtitle: 'AXIOMA QALCOSONIC E4 · ultradźwiękowy, certyfikacja MID',
    pointIds: [
      'METER_T1',
      'METER_T2',
      'METER_DT',
      'METER_FLOW',
      'METER_POWER',
      'METER_ENERGY_HEAT',
      'METER_ENERGY_COOL',
      'METER_ERROR',
    ],
  },
  heatpump: {
    title: 'Pompa ciepła',
    subtitle: 'Fox Blue Line 8.1',
    pointIds: ['HP_STATE'],
  },
  pump: {
    title: 'Pompa obiegowa',
    subtitle: 'Obieg magazynu',
    pointIds: ['PUMP_STATE'],
  },
  valve: {
    title: 'Zawór odcinający',
    subtitle: 'AFRISO BEV 222 · kula DN20, 24 V AC',
    pointIds: ['VALVE_STATE'],
  },
  ambient: {
    title: 'Hala',
    subtitle: 'Temperatura powietrza wokół stanowiska',
    pointIds: ['AMBIENT_HALL'],
  },

  // --- Elementy z rysunku technicznego bez własnych punktów pomiarowych ----
  // Są klikalne, bo są częścią instalacji i badacz musi móc się o nie zapytać.
  // Żaden nie udaje, że coś mierzy.
  //
  // PODGRZEWACZA TU NIE MA — 2026-08-04 został wygaszony na schemacie
  // (30 % krycia, bez `data-element`), więc jego panel stał się nieosiągalny.
  // Wpis wróci razem z aktywacją strony wody użytkowej.
  filtr: {
    title: 'Filtr odkamieniający',
    subtitle: 'Na wlocie wody wodociągowej',
    pointIds: [],
  },
  woda: {
    title: 'Woda wodociągowa',
    subtitle: 'Wlot zimnej wody',
    pointIds: [],
  },
  'naczynie-lewe': {
    title: 'Naczynie przeponowe · obieg odbioru',
    subtitle: 'Kompensacja rozszerzalności cieplnej',
    pointIds: [],
  },
  'naczynie-prawe': {
    title: 'Naczynie przeponowe · obieg ładowania',
    subtitle: 'Kompensacja rozszerzalności cieplnej',
    pointIds: [],
  },
  'zawor-bezp-lewy': {
    title: 'Zaworek bezpieczeństwa · obieg odbioru',
    subtitle: 'Zabezpieczenie przed nadciśnieniem',
    pointIds: [],
  },
  'zawor-bezp-prawy': {
    title: 'Zaworek bezpieczeństwa · obieg ładowania',
    subtitle: 'Zabezpieczenie przed nadciśnieniem',
    pointIds: [],
  },
  'manometr-lewy': {
    title: 'Manometr · obieg odbioru',
    subtitle: 'Ciśnienie w obiegu',
    pointIds: [],
  },
  'manometr-prawy': {
    title: 'Manometr · obieg ładowania',
    subtitle: 'Ciśnienie w obiegu',
    pointIds: [],
  },
  'cieplomierz-odbior': {
    title: 'Ciepłomierz · obieg odbioru',
    subtitle: 'Drugi ciepłomierz, po stronie wody użytkowej',
    pointIds: [],
  },
};

interface Props {
  elementId: string;
  data: LiveData;
  onClose: () => void;
  onOpenInPrzebiegi: (pointId: string) => void;
}

export function PanelElementu({ elementId, data, onClose, onOpenInPrzebiegi }: Props) {
  const info = ELEMENTS[elementId];
  if (!info) return null;

  const staleAfterMs = data.health?.staleAfterMs ?? FALLBACK_STALE_AFTER_MS;
  const now = Date.now();
  const channelAlive = data.link === 'live';

  const rows = info.pointIds
    .map((id) => data.points.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const anyData = rows.some((p) => data.values[p.id]?.v !== null && data.values[p.id]);

  return (
    <aside className="probe-panel" role="dialog" aria-label={info.title}>
      <header className="probe-panel__head">
        <div>
          <p className="probe-panel__id">{info.title}</p>
          <p className="probe-panel__label">{info.subtitle}</p>
        </div>
        <button type="button" className="probe-panel__close" onClick={onClose} aria-label="Zamknij">
          ×
        </button>
      </header>

      {rows.length > 0 ? (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>punkt</th>
                <th>opis</th>
                <th className="num">wartość</th>
                <th className="num">wiek</th>
                <th>stan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((point) => {
                const value = data.values[point.id];
                const state = pointState(point, value, staleAfterMs, now, channelAlive);
                const clickable = state === 'ok' || state === 'stale';
                return (
                  <tr key={point.id} className={`row is-${state}`}>
                    <td className="mono">
                      {clickable ? (
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => onOpenInPrzebiegi(point.id)}
                          title="Pokaż historię w Przebiegach"
                        >
                          {point.id}
                        </button>
                      ) : (
                        point.id
                      )}
                    </td>
                    <td className="muted">{point.label}</td>
                    <td className="num mono strong">
                      {value ? formatValue(value, point) : NO_DATA}
                    </td>
                    <td className="num mono muted">{value ? formatAge(value, now) : NO_DATA}</td>
                    <td>
                      <span className={`badge is-${state}`}>{POINT_STATE_LABEL[state]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Uwaga o braku wartości tylko tam, gdzie punkty W OGÓLE SĄ — element
          bez ani jednego punktu (naczynie, manometr) niczego nie „nie
          raportuje", on po prostu nie mierzy i panel nie ma czego tłumaczyć. */}
      {info.pointIds.length > 0 && !anyData ? (
        <div className="note">
          Ten element nie raportuje jeszcze żadnych wartości — punkty są zadeklarowane
          w rejestrze, ale nie mają przypisanych UUID-ów albo brakuje sprzętu.
        </div>
      ) : null}

      {info.notes && info.notes.length > 0 ? (
        <ul className="blockers">
          {info.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
