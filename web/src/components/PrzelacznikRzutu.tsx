/**
 * Przełącznik rzutu 2D / 3D.
 *
 * Osobny komponent, bo stoi w DWÓCH miejscach: w kolumnie narzędzi schematu
 * i w kolumnie narzędzi scenki trójwymiarowej. To ta sama kontrolka, tylko
 * każdy widok trzyma własne narzędzia — a przełącznik musi być pod nimi
 * w obu, bez zgadywania odległości od góry (pierwsze podejście liczyło ją
 * w arkuszu i rozjeżdżało się między rzutami o 373 px).
 *
 * Stan mieszka w App, nie tutaj: to on decyduje, który rzut jest czynny,
 * i on wyłącza scenę w opcjach.
 */

/** Rzut schematu. Ten sam zapis co w App, gdzie mieszka stan. */
export type Wymiar = '2d' | '3d';

export function PrzelacznikRzutu({
  wymiar,
  onWymiar,
}: {
  wymiar: Wymiar;
  /** `null` = scena 3D wyłączona w opcjach, więc nie ma czego przełączać. */
  onWymiar: ((wymiar: Wymiar) => void) | null;
}) {
  if (!onWymiar) return null;

  return (
    <div className="wymiar" role="group" aria-label="Rzut schematu">
      <button
        type="button"
        className={`wymiar__item${wymiar === '2d' ? ' is-active' : ''}`}
        onClick={() => onWymiar('2d')}
        aria-pressed={wymiar === '2d'}
        title="Płaski schemat instalacji"
      >
        2D
      </button>
      <button
        type="button"
        className={`wymiar__item${wymiar === '3d' ? ' is-active' : ''}`}
        onClick={() => onWymiar('3d')}
        aria-pressed={wymiar === '3d'}
        title="Scena trójwymiarowa — zbiornik i rozkład sond"
      >
        3D
      </button>
    </div>
  );
}
