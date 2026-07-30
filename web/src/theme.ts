/**
 * Motyw jasny / ciemny.
 *
 * Zapisany w localStorage, bo dotyczy TEGO stanowiska: laptop w hali bywa
 * używany przy mocnym świetle, a stacja w biurze wieczorem. Trzeci tryb
 * ("auto") idzie za ustawieniem systemu — dla wielu osób to jedyne, czego
 * potrzebują.
 *
 * Motyw ustawiamy atrybutem `data-theme` na <html>, a nie klasą na <body>,
 * żeby CSS mógł go użyć także dla tła całej strony, zanim React się zamontuje.
 */

import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'auto' | 'light' | 'dark';
/** Motyw faktycznie zastosowany (auto jest już rozwinięte). */
export type ThemeApplied = 'light' | 'dark';

const STORAGE_KEY = 'magazyn-pcm.motyw';

let choice: ThemeChoice = load();
const listeners = new Set<() => void>();

function load(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw;
  } catch {
    // Tryb prywatny — zostaje wartość domyślna.
  }
  return 'auto';
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function resolveTheme(value: ThemeChoice): ThemeApplied {
  if (value === 'auto') return systemPrefersDark() ? 'dark' : 'light';
  return value;
}

function apply(): void {
  const applied = resolveTheme(choice);
  document.documentElement.dataset.theme = applied;
  // color-scheme mówi przeglądarce, jak stylować paski przewijania i pola
  // formularzy — bez tego w ciemnym motywie zostają jasne.
  document.documentElement.style.colorScheme = applied;
}

export function getThemeChoice(): ThemeChoice {
  return choice;
}

export function setThemeChoice(value: ThemeChoice): void {
  choice = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Bez zapisu motyw działa do zamknięcia karty.
  }
  apply();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, getThemeChoice);
}

/** Motyw zastosowany teraz — potrzebny np. do wyboru wersji logo. */
export function useAppliedTheme(): ThemeApplied {
  const value = useThemeChoice();
  return resolveTheme(value);
}

/**
 * Uruchamiane raz przy starcie aplikacji. Nasłuchuje też zmiany ustawienia
 * systemowego, żeby tryb "auto" reagował bez przeładowania strony.
 */
export function initTheme(): void {
  apply();

  window
    .matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (choice === 'auto') {
        apply();
        for (const listener of listeners) listener();
      }
    });
}
