/**
 * Dolny pasek stanu — kluczowe parametry zawsze pod ręką.
 *
 * Te same liczby są w widoku Diagnostyka, ale tam trzeba po nie przejść.
 * Przy stanowisku badawczym najważniejsze pytanie brzmi „czy to, co widzę,
 * jest aktualne" — a na nie odpowiada właśnie ten pasek, niezależnie od tego,
 * na którym ekranie się jest.
 */

import type { LiveData, LinkState } from '../useLiveData.js';
import {
  NO_DATA,
  SOURCE_STATUS_LABEL,
  formatClock,
  formatUptime,
  materialLabel,
} from '../format.js';

const LINK_LABEL: Record<LinkState, string> = {
  connecting: 'łączę się',
  live: 'na żywo',
  reconnecting: 'ponawiam',
  error: 'brak połączenia',
  unauthorized: 'wymagane logowanie',
};

function Pole({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  return (
    <div className={`statusbar__field${tone ? ` is-${tone}` : ''}`}>
      <span className="statusbar__label">{label}</span>
      <span className="statusbar__value mono">{value}</span>
    </div>
  );
}

export function PasekStanu({ data }: { data: LiveData }) {
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

  const staleCount = health?.staleIds.length ?? 0;

  return (
    <footer className="statusbar" aria-label="Stan systemu">
      {/* Zegar żywotności: kropka pulsuje, dopóki dane napływają. */}
      <div className={`statusbar__pulse pulse is-${link}`}>
        <span className="pulse__dot" aria-hidden="true" />
        <span className="statusbar__clock mono">
          {data.lastMessageAt ? formatClock(data.lastMessageAt.toISOString()) : NO_DATA}
        </span>
      </div>

      <Pole label="przeglądarka → serwer" value={LINK_LABEL[link]} tone={linkTone} />

      <Pole
        label="serwer → Miniserver"
        value={!live ? 'nieznany' : health ? SOURCE_STATUS_LABEL[health.source] : NO_DATA}
        tone={sourceTone}
      />

      <Pole
        label="opóźnienie"
        value={!live || !health || health.latencyMs === null ? NO_DATA : `${health.latencyMs} ms`}
      />

      <Pole
        label="zbiornik"
        value={
          !health || !health.bank.active
            ? 'nierozpoznany'
            : health.bank.detection === 'auto'
              ? materialLabel(health.bank.active, data.materials)
              : `${materialLabel(health.bank.active, data.materials)}*`
        }
        tone={health?.bank.detection === 'auto' ? undefined : 'warn'}
      />

      <Pole
        label="przestarzałe"
        value={String(staleCount)}
        tone={staleCount > 0 ? 'warn' : undefined}
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
    </footer>
  );
}
