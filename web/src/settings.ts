/**
 * Ustawienia interfejsu — przelaczniki funkcji, ktore mozna wylaczyc
 * w widoku Ustawienia. Zyja w localStorage przegladarki, bo dotycza
 * TEGO stanowiska ogladowego, nie serwera: laptop w laboratorium moze
 * miec wylaczone animacje, a stacja w biurze wlaczone 3D.
 */

import { useSyncExternalStore } from 'react';

export interface UiSettings {
  /** Zakladka Magazyn 3D w nawigacji (Three.js dociaga sie na zadanie). */
  widok3d: boolean;
  /** Domyslny automatyczny obrot kamery w 3D. */
  obrot3d: boolean;
  /** Domyslna widocznosc podpisow w 3D. */
  podpisy3d: boolean;
  /** Animacja przeplywu na schemacie 2D. */
  animacjePrzeplywu: boolean;
  /** Znaczniki zdarzen sesji na wykresach historii. */
  zdarzeniaNaWykresie: boolean;
}

export const SETTINGS_LABELS: Record<keyof UiSettings, { label: string; hint: string }> = {
  widok3d: {
    label: 'Widok Magazyn 3D',
    hint: 'Zakładka z trójwymiarową sceną. Wyłącz na słabszym sprzęcie — moduł 3D nie zostanie nawet pobrany.',
  },
  obrot3d: {
    label: 'Automatyczny obrót kamery 3D',
    hint: 'Powolny obrót sceny po otwarciu widoku. Zawsze da się zatrzymać przyciskiem w widoku.',
  },
  podpisy3d: {
    label: 'Podpisy w scenie 3D',
    hint: 'Etykiety urządzeń i sond unoszące się nad bryłami.',
  },
  animacjePrzeplywu: {
    label: 'Animacja przepływu na schemacie',
    hint: 'Ruch kreski wzdłuż rur, proporcjonalny do przepływu. Niezależnie od tego ustawienia zerowy przepływ nigdy się nie animuje.',
  },
  zdarzeniaNaWykresie: {
    label: 'Zdarzenia sesji na wykresach',
    hint: 'Pionowe znaczniki („napełniono", „start ładowania") na wykresach historii.',
  },
};

const DEFAULTS: UiSettings = {
  widok3d: true,
  obrot3d: true,
  podpisy3d: true,
  animacjePrzeplywu: true,
  zdarzeniaNaWykresie: true,
};

const STORAGE_KEY = 'magazyn-pcm.ustawienia';

let cache: UiSettings = load();
const listeners = new Set<() => void>();

function load(): UiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings(): UiSettings {
  return cache;
}

export function setSetting<K extends keyof UiSettings>(key: K, value: UiSettings[K]): void {
  cache = { ...cache, [key]: value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Prywatny tryb przegladarki — ustawienie dziala do zamkniecia karty.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hook: komponent dostaje aktualne ustawienia i przerysowuje sie po zmianie. */
export function useSettings(): UiSettings {
  return useSyncExternalStore(subscribe, getSettings);
}
