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
import { NO_DATA, SOURCE_STATUS_LABEL, formatClock, formatUptime } from '../format.js';

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

function Pole({
  label,
  value,
  tone,
  /** Zielona pulsująca kropka — tylko gdy łącze naprawdę żyje. */
  pulse = false,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad';
  pulse?: boolean;
}) {
  return (
    <div className={`statusbar__field${tone ? ` is-${tone}` : ''}`}>
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
      />

      <Pole
        label="serwer → Miniserver"
        value={
          !live ? 'nieznany' : sourceLive ? 'live' : health ? SOURCE_STATUS_LABEL[health.source] : NO_DATA
        }
        tone={sourceTone}
        pulse={sourceLive}
      />

      <Pole
        label="opóźnienie"
        value={!live || !health || health.latencyMs === null ? NO_DATA : `${health.latencyMs} ms`}
      />

      <Pole
        label="czas działania"
        value={!live || !health ? NO_DATA : formatUptime(health.uptimeS)}
      />

      {data.session ? (
        <Pole label="sesja" value={data.session.label} tone="ok" />
      ) : (
        <Pole label="sesja" value="brak" />
      )}

      <span className="statusbar__copy">copyright 2026 · 21 zmysłów LAB</span>
    </footer>
  );
});
