/**
 * Dolny pasek stanu — kluczowe parametry zawsze pod ręką.
 *
 * Te same liczby są w widoku Diagnostyka, ale tam trzeba po nie przejść.
 * Przy stanowisku badawczym najważniejsze pytanie brzmi „czy to, co widzę,
 * jest aktualne" — a na nie odpowiada właśnie ten pasek, niezależnie od tego,
 * na którym ekranie się jest.
 */

import { forwardRef } from 'react';
import type { LiveData, LinkState } from '../useLiveData.js';
import {
  NO_DATA,
  SOURCE_STATUS_HINT,
  SOURCE_STATUS_LABEL,
  formatClock,
  formatUptime,
} from '../format.js';

/**
 * Podpisy obu łączy na pasku.
 *
 * Stan poprawny nazywa się „live" — krótko i tak samo dla obu łączy, żeby
 * jednym spojrzeniem dało się porównać, czy działają oba. Stany nienormalne
 * zostają po polsku i rozpisane, bo wtedy trzeba wiedzieć CO nie działa.
 * W widoku Diagnostyka opisy pozostają pełne — tam nie chodzi o skrót.
 */
const LINK_LABEL: Record<LinkState, string> = {
  connecting: 'łączę się',
  live: 'live',
  reconnecting: 'ponawiam',
  error: 'brak połączenia',
  unauthorized: 'wymagane logowanie',
};

/**
 * Wyjaśnienia po najechaniu — dopisek do skrótu, nie jego powtórzenie.
 *
 * Pasek odpowiada na pytanie „czy to, co widzę, jest aktualne", ale sam podpis
 * odpowiada na nie tylko temu, kto zna oba ogniwa drogi danych. Ta droga ma dwa
 * odcinki i mogą zawodzić niezależnie: „live" na pierwszym i „częściowo" na
 * drugim znaczy, że aplikacja działa, a stanowisko nie mówi wszystkiego.
 */
const LINK_HINT: Record<LinkState, string> = {
  connecting: 'Przeglądarka zestawia strumień zdarzeń z serwerem aplikacji.',
  live: 'Strumień zdarzeń z serwera aplikacji jest otwarty. Dopóki żyje, o świeżości odczytów rozstrzyga serwer.',
  reconnecting:
    'Strumień padł i przeglądarka ponawia. Liczby na ekranie są ostatnimi znanymi — nie muszą być aktualne.',
  error:
    'Brak strumienia z serwera aplikacji. Tego, co robi teraz Miniserver, NIE WIEMY — dlatego jego stan pokazujemy jako nieznany, a nie jako ostatnią znaną wartość.',
  unauthorized: 'Serwer żąda zalogowania, żeby wydać dane.',
};

/** Objaśnienie drugiego odcinka: serwer aplikacji → Miniserver. */
function podpowiedzZrodla(live: boolean, data: LiveData): string {
  if (!live) {
    return (
      'Serwer aplikacji → Miniserver.\n\n' +
      'Nie ma łączności z serwerem, więc nie ma skąd wiedzieć, co dzieje się na ' +
      'tym odcinku. Pokazanie ostatniego znanego stanu wyglądałoby jak działające ' +
      'stanowisko, więc pokazujemy „nieznany".'
    );
  }
  if (!data.health) return 'Serwer aplikacji → Miniserver. Serwer jeszcze nie podał swojego stanu.';

  const czesci = [`Serwer aplikacji → Miniserver: ${SOURCE_STATUS_LABEL[data.health.source]}.`];
  czesci.push(SOURCE_STATUS_HINT[data.health.source]);
  // Komunikat serwera niesie liczby (ile punktów zamilkło) — tego nie da się
  // napisać z góry, więc idzie na koniec, gdy jest.
  if (data.health.message) czesci.push(data.health.message);
  return czesci.join('\n\n');
}

function Pole({
  label,
  value,
  tone,
  /** Zielona pulsująca kropka — tylko gdy łącze naprawdę żyje. */
  pulse = false,
  /**
   * Pole WTÓRNE — schodzi z paska na telefonie.
   *
   * Oznaczamy je tutaj, a nie w arkuszu przez liczenie rodzeństwa. Selektor
   * `:nth-of-type` policzyłby także kropkę żywotności, która jest takim samym
   * `<div>`, i ukryłby o jedno pole za dużo; poza tym każde przestawienie
   * kolejności cicho zmieniałoby, co znika. Klasa mówi wprost, o które pola
   * chodzi, i przenosi się razem z nimi.
   *
   * Wtórne znaczy „do diagnozowania, nie do pilnowania" — te liczby stoją
   * w całości w widoku Diagnostyka.
   */
  wtorne = false,
  /**
   * Pełne zdanie po najechaniu. Skrót na pasku musi się zmieścić w jednym
   * rzędzie, więc mówi CO, a nie CO TO ZNACZY — to drugie idzie tutaj.
   * Pole z podpowiedzią dostaje kursor „help" i kropkowaną kreskę pod podpisem,
   * bo sama podpowiedź jest niewidoczna, dopóki się na nią nie trafi.
   */
  hint,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad';
  pulse?: boolean;
  wtorne?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`statusbar__field${tone ? ` is-${tone}` : ''}${
        wtorne ? ' statusbar__field--wtorne' : ''
      }${hint ? ' statusbar__field--hint' : ''}`}
      title={hint}
    >
      <span className="statusbar__label">{label}</span>
      <span className="statusbar__value mono">
        {pulse ? <span className="statusbar__led" aria-hidden="true" /> : null}
        {value}
      </span>
    </div>
  );
}

/**
 * Referencja wychodzi na zewnątrz, bo rama mierzy wysokość tej belki, żeby
 * odsunąć od niej treść przewijaną pod spodem (patrz uklad.ts).
 */
export const PasekStanu = forwardRef<HTMLElement, { data: LiveData }>(function PasekStanu(
  { data },
  ref,
) {
  const { health, link } = data;
  const live = link === 'live';

  const linkTone: 'ok' | 'warn' | 'bad' =
    link === 'live' ? 'ok' : link === 'error' || link === 'unauthorized' ? 'bad' : 'warn';

  // Gdy nie ma łączności, NIE WIEMY, co dzieje się między serwerem
  // a Miniserverem — pokazanie ostatniego znanego stanu byłoby kłamstwem.
  const sourceTone: 'ok' | 'warn' | 'bad' = !live
    ? 'warn'
    : !health
      ? 'warn'
      : health.source === 'ok'
        ? 'ok'
        : health.source === 'auth_error' || health.source === 'error'
          ? 'bad'
          : 'warn';

  // Miniserver odpowiada poprawnie — wtedy i tylko wtedy pulsuje kropka.
  const sourceLive = live && health?.source === 'ok';

  return (
    <footer className="statusbar" aria-label="Stan systemu" ref={ref}>
      {/* Zegar żywotności: kropka pulsuje, dopóki dane napływają. */}
      <div className={`statusbar__pulse pulse is-${link}`}>
        <span className="pulse__dot" aria-hidden="true" />
        <span className="statusbar__clock mono">
          {data.lastMessageAt ? formatClock(data.lastMessageAt.toISOString()) : NO_DATA}
        </span>
      </div>

      <Pole
        label="przeglądarka → serwer"
        value={LINK_LABEL[link]}
        tone={linkTone}
        pulse={live}
        hint={`Przeglądarka → serwer aplikacji: ${LINK_LABEL[link]}.\n\n${LINK_HINT[link]}`}
      />

      <Pole
        label="serwer → Miniserver"
        value={
          !live ? 'nieznany' : sourceLive ? 'live' : health ? SOURCE_STATUS_LABEL[health.source] : NO_DATA
        }
        tone={sourceTone}
        pulse={sourceLive}
        hint={podpowiedzZrodla(live, data)}
      />

      <Pole
        label="opóźnienie"
        value={!live || !health || health.latencyMs === null ? NO_DATA : `${health.latencyMs} ms`}
        wtorne
      />

      <Pole
        label="czas działania"
        value={!live || !health ? NO_DATA : formatUptime(health.uptimeS)}
        wtorne
      />

      {data.session ? (
        <Pole label="sesja" value={data.session.label} tone="ok" wtorne />
      ) : (
        <Pole label="sesja" value="brak" wtorne />
      )}

      <span className="statusbar__copy">copyright 2026 · 21 zmysłów LAB</span>
    </footer>
  );
});
