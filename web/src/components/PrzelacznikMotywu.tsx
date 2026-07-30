/**
 * Przełącznik motywu: automatyczny / jasny / ciemny.
 *
 * Trzy stany, nie dwa — „auto" idzie za ustawieniem systemu i dla wielu osób
 * jest jedynym potrzebnym. Klikanie przechodzi po kole, żeby zajmowało jeden
 * przycisk zamiast trzech.
 */

import type React from 'react';
import { setThemeChoice, useThemeChoice, type ThemeChoice } from '../theme.js';

const KOLEJNOSC: ThemeChoice[] = ['auto', 'light', 'dark'];

const OPIS: Record<ThemeChoice, string> = {
  auto: 'Motyw: automatyczny (za ustawieniem systemu)',
  light: 'Motyw: jasny',
  dark: 'Motyw: ciemny',
};

function Ikona({ choice }: { choice: ThemeChoice }) {
  const wspolne: React.SVGProps<SVGSVGElement> = {
    viewBox: '0 0 24 24',
    width: 17,
    height: 17,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: 'false',
  };

  if (choice === 'dark') {
    // Księżyc.
    return (
      <svg {...wspolne}>
        <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
      </svg>
    );
  }

  if (choice === 'light') {
    // Słońce.
    return (
      <svg {...wspolne}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      </svg>
    );
  }

  // Auto: pół słońca, pół księżyca.
  return (
    <svg {...wspolne}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 3.8a8.2 8.2 0 0 0 0 16.4Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PrzelacznikMotywu() {
  const choice = useThemeChoice();

  const next = (): void => {
    const index = KOLEJNOSC.indexOf(choice);
    setThemeChoice(KOLEJNOSC[(index + 1) % KOLEJNOSC.length]!);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={next}
      title={`${OPIS[choice]} — kliknij, żeby zmienić`}
      aria-label={OPIS[choice]}
    >
      <Ikona choice={choice} />
    </button>
  );
}
