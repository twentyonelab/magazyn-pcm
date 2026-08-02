/**
 * Przełącznik trybu pokazowego i stałe, których potrzebuje i model, i widok.
 *
 * Osobny plik, żeby model danych nie ciągnął za sobą całego źródła — inaczej
 * import stałej w jednym komponencie wciągałby generator historii do paczki
 * startowej.
 */

/**
 * Czy aplikacja pracuje na danych zmyślonych.
 *
 * Włącza się TYLKO przez zmienną budowania `VITE_DEMO=1` (patrz `.env.pages`).
 * Świadomie nie ma na to przełącznika w interfejsie: tryb pokazowy zmienia
 * znaczenie każdej liczby na ekranie i decyzja o nim należy do budowania
 * wydania, a nie do przypadkowego kliknięcia w laboratorium.
 */
/* `?.` chroni przed uruchomieniem poza Vite — w skryptach sprawdzających model
   (uruchamianych wprost Node’em) `import.meta.env` nie istnieje i bez tego
   sam import tego pliku wysypywałby się na starcie. */
export const TRYB_POKAZOWY: boolean = import.meta.env?.VITE_DEMO === '1';

/**
 * Pasmo przemiany fazowej materiału, którym pracuje pokaz (57HC).
 *
 * Te same liczby są w `server/src/materials.config.ts`. Nie da się ich stamtąd
 * zaimportować — to inny workspace i inne środowisko uruchomieniowe — więc
 * źródło danych pokazowych podaje profil materiału w całości, a widoki nadal
 * czytają go z `/api/materials` jak zawsze. Tutaj są tylko po to, żeby model
 * wiedział, gdzie umieścić plateau.
 */
export const PASMO_MIN = 55;
export const PASMO_MAX = 58;
