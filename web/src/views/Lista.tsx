/**
 * Widok Lista — spis wszystkich magazynów i ich stanów.
 *
 * Druga odpowiedź na to samo pytanie, które zadaje mapa: „co mamy i w jakim to
 * jest stanie". Mapa mówi GDZIE, lista mówi ILE — i pozwala porównać
 * dwadzieścia jeden obiektów jednym spojrzeniem w dół kolumny, czego z mapy
 * zrobić się nie da, bo znaczniki leżą tam, gdzie leżą.
 *
 * Oba widoki są na poziomie PRZEGLĄDU, więc interfejs jest tu neutralny: żaden
 * magazyn nie jest wybrany, a barwa nośnika pojawia się dopiero po wejściu
 * w konkretny. Rodzaj każdego z nich niesie kropka i podpis w wierszu.
 *
 * SKĄD BIORĄ SIĘ LICZBY. Stanowisko badawcze — z prawdziwych sond, tą samą
 * funkcją co belka i znacznik na mapie (`naladowanieProcent`). Punkty pokazowe
 * — z wartości wpisanej w `lokalizacje.ts`, tej samej, którą pokazuje znacznik.
 * Nie liczymy ich tu z modelu: model jest dostrojony właśnie do tej wartości,
 * więc druga droga do tej samej liczby mogłaby się z nią rozejść.
 */

import { useMemo, useState } from 'react';
import type { MaterialProfile } from '@magazyn-pcm/shared';
import { LOKALIZACJE, type Lokalizacja } from '../map/lokalizacje.js';
import type { LiveData } from '../useLiveData.js';
import { naladowanieProcent, pozaSkalaMaterialu, sredniaZSond } from '../naladowanie.js';
import { OPIS_KIERUNKU, PALETA } from '../kolory-magazynu.js';
import type { Kierunek } from '../soc.js';
import { NO_DATA } from '../format.js';

interface Props {
  data: LiveData;
  onOtworz: (punkt: Lokalizacja) => void;
}

interface Wiersz {
  punkt: Lokalizacja;
  kierunek: Kierunek;
  procent: number | null;
  sredniaC: number | null;
  pozaSkala: boolean;
}

/* --------------------------------------------------------------------------
   SORTOWANIE
   --------------------------------------------------------------------------
   Kolumna wybiera klucz, drugie kliknięcie odwraca kierunek. Klucze są tu
   wypisane jawnie, a nie brane z nazwy kolumny, bo dwie z nich sortują się po
   czymś innym, niż pokazują: „stan" po tym, czy obiekt ma pomiary, a nie po
   napisie, a „naładowanie" po liczbie, nie po tekście z procentem.

   BRAK WARTOŚCI ZAWSZE NA KOŃCU, w obu kierunkach. Gdyby `null` uczestniczył
   w porównaniu jak zero, punkty bez odczytu wskakiwałyby na czoło listy
   posortowanej rosnąco i wyglądały na najbardziej rozładowane — a one po
   prostu nic nie mówią. */
type Klucz = 'nazwa' | 'miasto' | 'nosnik' | 'naladowanie' | 'stan';

const KOLUMNY: Array<{ klucz: Klucz; etykieta: string; num?: boolean }> = [
  { klucz: 'nazwa', etykieta: 'magazyn' },
  { klucz: 'miasto', etykieta: 'miejsce' },
  { klucz: 'nosnik', etykieta: 'nośnik' },
  { klucz: 'naladowanie', etykieta: 'naładowanie', num: true },
  { klucz: 'stan', etykieta: 'stan' },
];

/** Kierunek domyślny przy pierwszym kliknięciu w kolumnę. */
const MALEJACO_NAJPIERW: ReadonlySet<Klucz> = new Set(['naladowanie', 'stan']);

function porownaj(a: Wiersz, b: Wiersz, klucz: Klucz): number {
  const tekst = (x: string, y: string): number => x.localeCompare(y, 'pl');

  switch (klucz) {
    case 'nazwa':
      return tekst(a.punkt.nazwa, b.punkt.nazwa);
    case 'miasto':
      return tekst(a.punkt.miasto, b.punkt.miasto);
    case 'nosnik':
      // Po rodzaju, a w obrębie rodzaju po nazwie — inaczej wewnątrz grupy
      // wiersze stałyby w przypadkowej kolejności i lista „skakałaby".
      return a.kierunek === b.kierunek
        ? tekst(a.punkt.nazwa, b.punkt.nazwa)
        : tekst(OPIS_KIERUNKU[a.kierunek], OPIS_KIERUNKU[b.kierunek]);
    case 'naladowanie':
      return (a.procent ?? 0) - (b.procent ?? 0);
    case 'stan':
      // Stanowisko z pomiarami przed punktami pokazowymi.
      return Number(a.punkt.stan === 'live') - Number(b.punkt.stan === 'live');
  }
}

/** Czy wiersz ma czym się sortować w tej kolumnie. */
function maWartosc(w: Wiersz, klucz: Klucz): boolean {
  return klucz === 'naladowanie' ? w.procent !== null : true;
}

export function Lista({ data, onOtworz }: Props) {
  const wiersze = useMemo<Wiersz[]>(() => {
    // Materiał stanowiska: sesja, potem rozpoznany zbiornik. Ta sama hierarchia
    // co w widoku Mapa i Magazyn — inaczej ta sama instalacja miałaby w trzech
    // miejscach trzy różne skale.
    const rozpoznany =
      data.health && data.health.bank.detection !== 'unknown' ? data.health.bank.active : null;
    const materialStanowiska = data.session?.material ?? rozpoznany;
    const profilStanowiska: MaterialProfile | null = data.materials
      ? (data.materials.profiles[materialStanowiska ?? data.materials.defaultMaterial] ?? null)
      : null;
    const kierunekStanowiska: Kierunek =
      (materialStanowiska ?? data.materials?.defaultMaterial) === 'RT8HC' ? 'chlod' : 'cieplo';

    const sredniaStanowiska = sredniaZSond(data.points, data.values);

    return LOKALIZACJE.map((punkt) => {
      if (punkt.stan === 'live') {
        return {
          punkt,
          kierunek: kierunekStanowiska,
          procent: naladowanieProcent(sredniaStanowiska, profilStanowiska, kierunekStanowiska),
          sredniaC: sredniaStanowiska,
          pozaSkala: pozaSkalaMaterialu(sredniaStanowiska, profilStanowiska),
        };
      }
      return {
        punkt,
        kierunek: punkt.typ,
        procent:
          punkt.demoNaladowanie === undefined
            ? null
            : Math.round(punkt.demoNaladowanie * 100),
        sredniaC: null,
        pozaSkala: false,
      };
    });
  }, [data.points, data.values, data.health, data.session, data.materials]);

  /**
   * `null` = kolejność źródłowa: stanowisko badawcze na czele, potem punkty
   * pokazowe tak, jak leżą w `lokalizacje.ts`. To sensowny stan wyjściowy,
   * bo jedyny obiekt z prawdziwymi pomiarami ma być pierwszy, dopóki nikt nie
   * poprosi o inny porządek.
   */
  const [sort, setSort] = useState<{ klucz: Klucz; malejaco: boolean } | null>(null);

  const posortowane = useMemo(() => {
    if (!sort) return wiersze;
    const { klucz, malejaco } = sort;

    return [...wiersze].sort((a, b) => {
      const maA = maWartosc(a, klucz);
      const maB = maWartosc(b, klucz);
      if (maA !== maB) return maA ? -1 : 1; // brak wartości spada na koniec
      const wynik = porownaj(a, b, klucz);
      return malejaco ? -wynik : wynik;
    });
  }, [wiersze, sort]);

  const przelacz = (klucz: Klucz): void => {
    setSort((biezacy) =>
      biezacy?.klucz === klucz
        ? { klucz, malejaco: !biezacy.malejaco }
        : { klucz, malejaco: MALEJACO_NAJPIERW.has(klucz) },
    );
  };

  const ileCiepla = wiersze.filter((w) => w.kierunek === 'cieplo').length;
  const ileChlodu = wiersze.length - ileCiepla;

  return (
    <div className="stack">
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">magazyny</h2>
          <p className="card__meta">
            {wiersze.length} obiektów · {ileCiepla} ciepła, {ileChlodu} chłodu · jedno stanowisko
            z pomiarami
          </p>
        </div>

        <div className="table-scroll">
          <table className="table tabela-magazynow">
            <thead>
              <tr>
                {KOLUMNY.map((kolumna) => {
                  const czynna = sort?.klucz === kolumna.klucz;
                  return (
                    <th
                      key={kolumna.klucz}
                      className={kolumna.num ? 'num' : undefined}
                      /* `aria-sort` to jedyna droga, którą czytnik ekranu dowie
                         się o porządku — strzałka jest tylko dla oczu. */
                      aria-sort={czynna ? (sort.malejaco ? 'descending' : 'ascending') : 'none'}
                    >
                      <button
                        type="button"
                        className={`sortownik${czynna ? ' is-active' : ''}`}
                        onClick={() => przelacz(kolumna.klucz)}
                        title={`Sortuj po: ${kolumna.etykieta}`}
                      >
                        {kolumna.etykieta}
                        <span className="sortownik__strzalka" aria-hidden="true">
                          {czynna ? (sort.malejaco ? '↓' : '↑') : '↕'}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th />
              </tr>
            </thead>
            <tbody>
              {posortowane.map(({ punkt, kierunek, procent, sredniaC, pozaSkala }) => {
                const paleta = PALETA[kierunek];
                const live = punkt.stan === 'live';
                return (
                  <tr
                    key={punkt.id}
                    className={`tabela-magazynow__wiersz${live ? ' is-live' : ''}`}
                    onClick={() => onOtworz(punkt)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Otwórz ${punkt.nazwa}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOtworz(punkt);
                      }
                    }}
                  >
                    <td>
                      <span
                        className="tabela-magazynow__kropka"
                        style={{ background: paleta.glowny }}
                        aria-hidden="true"
                      />
                      <strong>{punkt.nazwa}</strong>
                    </td>
                    <td className="muted">{punkt.miasto}</td>
                    <td style={{ color: paleta.glowny }}>{OPIS_KIERUNKU[kierunek]}</td>
                    <td className="num mono">
                      {procent === null ? NO_DATA : `${procent}%`}
                      {/* Pasek naładowania w wierszu — porównanie w dół kolumny
                          idzie wzrokiem szybciej niż czytanie liczb. */}
                      {procent !== null ? (
                        <span className="tabela-magazynow__tor" aria-hidden="true">
                          <span
                            className="tabela-magazynow__wypelnienie"
                            style={{
                              width: `${procent}%`,
                              background: `linear-gradient(90deg,${paleta.jasny},${paleta.glowny})`,
                            }}
                          />
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {live ? (
                        <span className="tabela-magazynow__stan is-live">
                          pomiary
                          {sredniaC !== null ? (
                            <span className="mono">
                              {' '}
                              {sredniaC.toFixed(1).replace('.', ',')} °C
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="tabela-magazynow__stan">pokazowy</span>
                      )}
                      {pozaSkala ? (
                        <span
                          className="tabela-magazynow__uwaga"
                          title="Średnia z sond wypada poza zakresem pracy materiału — sprawdź, czy w zbiorniku jest ten materiał, który wskazuje sesja."
                        >
                          poza skalą
                        </span>
                      ) : null}
                    </td>
                    <td className="num muted">wejdź →</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
