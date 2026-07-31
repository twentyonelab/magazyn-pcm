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
  /** Uwagi sprzętowe — to, co inaczej ginie w dokumentacji. */
  notes: string[];
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
    subtitle: 'Zbiornik buforowy między pompą ciepła a magazynem',
    pointIds: ['BUFFER_TOP', 'BUFFER_BOTTOM'],
    notes: [
      'Objętość jest wartością konfiguracyjną — rysunek instalacji wymienia zasobnik 200 l, opis mówi o buforze 80 l (otwarte pytanie nr 2 ze specyfikacji).',
      'Sondy bufora nie są jeszcze podłączone do Miniservera.',
    ],
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
    notes: [
      'Modbus czyta Miniserver i wystawia odczyty jako kontrolki ZRODLO_* — po naszej stronie to zwykłe punkty pomiarowe, więc mapa rejestrów nie jest już potrzebna.',
      'Loxone nie deklaruje jednostki dla obu liczników energii, dlatego pokazujemy samą liczbę bez podpisu. Po ustawieniu jednostki w Loxone Config dopiszemy ją tutaj.',
      'Na samej baterii licznik udostępnia Modbusa tylko 80 sekund na godzinę. Odczyt ciągły wymaga zasilania zewnętrznego 24 VDC.',
      'Poniżej ΔT = 3 K licznik nie sumuje energii i zgłasza kod błędu 4 — przy małych różnicach temperatur bilans będzie zaniżony z przyczyn metrologicznych.',
    ],
  },
  heatpump: {
    title: 'Pompa ciepła',
    subtitle: 'Fox Blue Line 8.1',
    pointIds: ['HP_STATE'],
    notes: ['Stan pracy nie jest jeszcze podłączony do Miniservera.'],
  },
  pump: {
    title: 'Pompa obiegowa',
    subtitle: 'Obieg magazynu',
    pointIds: ['PUMP_STATE'],
    notes: ['Stan pracy nie jest jeszcze podłączony do Miniservera.'],
  },
  valve: {
    title: 'Zawór odcinający',
    subtitle: 'AFRISO BEV 222 · kula DN20, 24 V AC',
    pointIds: ['VALVE_STATE'],
    notes: [
      'To zawór ODCINAJĄCY, nie regulacyjny. Kvs 45 m³/h przy przepływach rzędu 0,5 m³/h daje zerową autorytatywność — dlatego pokazujemy go jako stan otwarty/zamknięty, nigdy jako element modulowany.',
      'Czas przestawienia: 12 s na 90°.',
    ],
  },
  ambient: {
    title: 'Hala',
    subtitle: 'Temperatura powietrza wokół stanowiska',
    pointIds: ['AMBIENT_HALL'],
    notes: ['Punkt zadeklarowany, ale jeszcze niepodłączony.'],
  },

  // --- Elementy z rysunku technicznego bez własnych punktów pomiarowych ----
  // Są klikalne, bo są częścią instalacji i badacz musi móc się o nie zapytać.
  // Żaden nie udaje, że coś mierzy.
  podgrzewacz: {
    title: 'Podgrzewacz wody wodociągowej',
    subtitle: 'Odbiór ciepła z magazynu na wodę użytkową',
    pointIds: [],
    notes: [
      'To ODBIORNIK ciepła z magazynu PCM: woda wodociągowa przechodzi przez wymiennik i odbiera ciepło zmagazynowane w parafinie.',
      'Bez sond temperatury po tej stronie nie da się policzyć, ile ciepła faktycznie trafia do wody — na razie mierzymy tylko sam magazyn.',
    ],
  },
  filtr: {
    title: 'Filtr odkamieniający',
    subtitle: 'Na wlocie wody wodociągowej',
    pointIds: [],
    notes: [
      'Chroni wymiennik podgrzewacza przed osadem wapiennym. Bez niego kamień odkłada się na ściankach i z każdym tygodniem pogarsza przejmowanie ciepła — co przy badaniu wyglądałoby jak spadek sprawności magazynu.',
    ],
  },
  woda: {
    title: 'Woda wodociągowa',
    subtitle: 'Wlot zimnej wody',
    pointIds: [],
    notes: [
      'Strona odbioru. Temperatura wody wlotowej nie jest mierzona, a bez niej nie policzymy energii oddanej do wody — to pierwszy punkt do dołożenia, gdy dojdą kolejne sondy.',
    ],
  },
  'naczynie-lewe': {
    title: 'Naczynie przeponowe · obieg odbioru',
    subtitle: 'Kompensacja rozszerzalności cieplnej',
    pointIds: [],
    notes: [
      'Przejmuje przyrost objętości wody przy nagrzewaniu. Element bezpieczeństwa, nie pomiarowy.',
    ],
  },
  'naczynie-prawe': {
    title: 'Naczynie przeponowe · obieg ładowania',
    subtitle: 'Kompensacja rozszerzalności cieplnej',
    pointIds: [],
    notes: [
      'Przejmuje przyrost objętości wody przy nagrzewaniu. Element bezpieczeństwa, nie pomiarowy.',
    ],
  },
  'zawor-bezp-lewy': {
    title: 'Zaworek bezpieczeństwa · obieg odbioru',
    subtitle: 'Zabezpieczenie przed nadciśnieniem',
    pointIds: [],
    notes: ['Otwiera się samoczynnie po przekroczeniu ciśnienia dopuszczalnego.'],
  },
  'zawor-bezp-prawy': {
    title: 'Zaworek bezpieczeństwa · obieg ładowania',
    subtitle: 'Zabezpieczenie przed nadciśnieniem',
    pointIds: [],
    notes: ['Otwiera się samoczynnie po przekroczeniu ciśnienia dopuszczalnego.'],
  },
  'manometr-lewy': {
    title: 'Manometr · obieg odbioru',
    subtitle: 'Ciśnienie w obiegu',
    pointIds: [],
    notes: ['Wskazanie odczytywane z tarczy — nie trafia do Miniservera.'],
  },
  'manometr-prawy': {
    title: 'Manometr · obieg ładowania',
    subtitle: 'Ciśnienie w obiegu',
    pointIds: [],
    notes: ['Wskazanie odczytywane z tarczy — nie trafia do Miniservera.'],
  },
  'cieplomierz-odbior': {
    title: 'Ciepłomierz · obieg odbioru',
    subtitle: 'Drugi ciepłomierz, po stronie wody użytkowej',
    pointIds: [],
    notes: [
      'Jest w instalacji, ale NIE JEST wpięty do Miniservera — dlatego nie pokazuje wartości, a animacja tego obiegu na schemacie korzysta z przepływu zmierzonego po stronie ładowania.',
      'Dopóki nie zacznie raportować, bilansu odbioru ciepła nie policzymy.',
    ],
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

      {!anyData ? (
        <div className="note">
          Ten element nie raportuje jeszcze żadnych wartości — punkty są zadeklarowane
          w rejestrze, ale nie mają przypisanych UUID-ów albo brakuje sprzętu.
        </div>
      ) : null}

      <ul className="blockers">
        {info.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </aside>
  );
}
