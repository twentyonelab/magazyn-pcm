/**
 * Krzywa entalpii — dolna część rozwiniętej belki.
 *
 * Oś X jest TĄ SAMĄ osią co pasek strefowy: dostaje gotową `Skala` i nie liczy
 * własnych pozycji. SVG ma szerokość podaną w pikselach (nie 100%), bo tylko
 * wtedy oś pokrywa się z paskiem co do piksela — patrz komentarz w `skala.ts`.
 *
 * Co ta krzywa pokazuje: ile ciepła siedzi w materiale przy danej temperaturze.
 * Prawie pionowy odcinek w środku to przemiana fazowa — tam materiał przyjmuje
 * ciepło utajone, prawie nie zmieniając temperatury. Ten kształt jest całym
 * powodem, dla którego magazyn PCM ma sens, i dlatego jest tu narysowany.
 */

import type { KonfiguracjaMaterialu } from './konfiguracja.js';
import { liczba, tickiCo5, type Skala } from './skala.js';
import { procentSoc, udzialEntalpii, type ParametryEntalpii } from '../../soc.js';

const WYSOKOSC = 160;
/** Zapas u góry na etykietę punktu pracy i podpis „kWh". */
const GORA = 22;
/** Zapas u dołu na linię bazową i podpisy ticków. */
const DOL = 26;

interface Props {
  skala: Skala;
  cfg: KonfiguracjaMaterialu;
  parametry: ParametryEntalpii;
  /** Średnia z sond albo null — bez niej nie ma punktu pracy. */
  sredniaC: number | null;
  /** SOC 0–1 albo null. */
  soc: number | null;
  /** Podpis kierunku pod procentem: „ciepło" albo „chłód". */
  opisKierunku: string;
  /**
   * Pozycja kursora nad paskiem, w pikselach tej samej skali.
   * Kreska idzie przez CAŁY wykres, żeby dało się odczytać, ile entalpii
   * odpowiada temperaturze pod kursorem.
   */
  kursorX?: number | null;
}

export function KrzywaEntalpii({
  skala,
  cfg,
  parametry,
  sredniaC,
  soc,
  opisKierunku,
  kursorX = null,
}: Props) {
  const { szerokosc, min, max, xOf } = skala;
  if (szerokosc <= 0) return null;

  const wysokoscPola = WYSOKOSC - GORA - DOL;
  /** Entalpia (udział 0–1) na pozycję pionową. */
  const yOf = (udzial: number): number => GORA + wysokoscPola * (1 - udzial);

  // Krzywą rysujemy z próbkowania co 0,5 °C i dodatkowo dokładnie w punktach
  // załamania, żeby narożniki plateau nie były przypadkowo ścięte.
  const punkty: string[] = [];
  const temperatury = new Set<number>([min, cfg.solidus, cfg.liquidus, max]);
  for (let t = min; t <= max; t += 0.5) temperatury.add(t);
  const posortowane = [...temperatury].filter((t) => t >= min && t <= max).sort((a, b) => a - b);
  for (const t of posortowane) {
    punkty.push(`${xOf(t).toFixed(2)},${yOf(udzialEntalpii(t, parametry)).toFixed(2)}`);
  }

  const xSolidus = xOf(cfg.solidus);
  const xLiquidus = xOf(cfg.liquidus);

  const osY = yOf(0);
  const ticki = tickiCo5(min, max);

  // Punkt pracy
  const maPunkt = sredniaC !== null;
  const xPunkt = maPunkt ? xOf(sredniaC) : 0;
  const yPunkt = maPunkt ? yOf(udzialEntalpii(sredniaC, parametry)) : 0;

  // Etykieta punktu przy krawędzi nie może wyjechać za pole — przycinamy
  // pozycję, zamiast dopuścić urwany tekst.
  const SZEROKOSC_ETYKIETY = 120;
  const xEtykieta = Math.min(
    Math.max(xPunkt, SZEROKOSC_ETYKIETY / 2),
    szerokosc - SZEROKOSC_ETYKIETY / 2,
  );

  return (
    <svg
      className="belka__wykres"
      width={szerokosc}
      height={WYSOKOSC}
      viewBox={`0 0 ${szerokosc} ${WYSOKOSC}`}
      role="img"
      aria-label="Krzywa entalpii materiału z zaznaczonym punktem pracy"
    >
      {/* Strefa przemiany — dokładnie między granicami stref z paska. */}
      <rect
        x={xSolidus}
        y={GORA}
        width={Math.max(xLiquidus - xSolidus, 1)}
        height={wysokoscPola}
        fill={cfg.tloStrefyWykres}
        opacity={0.55}
      />

      {/* Granice stref — te same współrzędne co krawędzie segmentów paska. */}
      {[xSolidus, xLiquidus].map((x, i) => (
        <line
          key={i}
          x1={x}
          x2={x}
          y1={GORA}
          y2={GORA + wysokoscPola}
          stroke={cfg.kolorKrzywej}
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.5}
        />
      ))}

      {/* Krzywa entalpii. */}
      <polyline
        points={punkty.join(' ')}
        fill="none"
        stroke={cfg.kolorKrzywej}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Oś X. */}
      <line x1={0} x2={szerokosc} y1={osY} y2={osY} className="belka__os" strokeWidth={1} />

      {ticki.map((t) => (
        <text key={t} x={xOf(t)} y={osY + 15} className="belka__tick mono" textAnchor="middle">
          {t}
        </text>
      ))}

      <text x={2} y={GORA - 8} className="belka__tick">
        kWh
      </text>

      {/* Kreska pod kursorem — przez całą wysokość wykresu, plus kropka na
          krzywej w miejscu odczytu. */}
      {kursorX !== null ? (
        <>
          <line
            x1={kursorX}
            x2={kursorX}
            y1={GORA - 6}
            y2={osY}
            className="belka__kursor-linia"
            strokeWidth={1}
          />
          <circle
            cx={kursorX}
            cy={yOf(udzialEntalpii(skala.tempOf(kursorX), parametry))}
            r={3.5}
            fill={cfg.kolorKrzywej}
          />
        </>
      ) : null}

      {/* Punkt pracy: prowadnica do osi, kropka, etykieta. */}
      {maPunkt ? (
        <>
          <line
            x1={xPunkt}
            x2={xPunkt}
            y1={yPunkt}
            y2={osY}
            className="belka__prowadnica"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <circle
            cx={xPunkt}
            cy={yPunkt}
            r={6.5}
            fill={cfg.kolorKrzywej}
            className="belka__punkt"
            strokeWidth={2.5}
          />
          <text
            x={xEtykieta}
            y={Math.max(yPunkt - 14, 12)}
            className="belka__etykieta-punktu"
            textAnchor="middle"
          >
            {liczba(sredniaC)}° {soc === null ? '' : `· ${procentSoc(soc)}% ${opisKierunku}`}
          </text>
        </>
      ) : null}
    </svg>
  );
}
