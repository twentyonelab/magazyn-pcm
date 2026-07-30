/**
 * HistoryStore — granica wymiennosci zapisu historii.
 *
 * Specyfikacja ma zasade nienaruszalna: historia zapisuje sie od pierwszego
 * dnia, nawet gdy interfejs jeszcze jej nie pokazuje. Czego nie zapiszemy,
 * tego nie odzyskamy.
 *
 * W kroku 1 implementacja to zwykly plik tekstowy (NdjsonHistoryStore).
 * W kroku 4 wchodzi SQLite — podmiana dotyka wylacznie tego katalogu,
 * bo reszta aplikacji zna tylko ten interfejs.
 */

export interface HistoryRecord {
  /** Identyfikator logiczny punktu. */
  id: string;
  /** Wartosc; null = brak danych (nigdy nie zapisujemy zera zamiast braku). */
  v: number | null;
  /** Czas udanego odczytu (ms epoch). */
  tsMs: number;
  /**
   * Zestaw sond, czyli wymienny zbiornik, z ktorego pochodzi odczyt.
   * null dla punktow niezwiazanych ze zbiornikiem (bufor, cieplomierz).
   *
   * Bez tego pola pozycja A1 z dwoch roznych zbiornikow zlala by sie w jeden
   * szereg i po dwoch tygodniach nie dalo by sie powiedziec, ktora parafina
   * dala ktory wynik.
   */
  bank?: string | null;
}

export interface HistoryStore {
  readonly kind: string;
  /** Dopisuje rekordy. Nie moze rzucac wyjatkiem — zapis historii nigdy nie
   *  przerywa pracy aplikacji. */
  append(records: readonly HistoryRecord[]): Promise<void>;
  close(): Promise<void>;
}

/** Zapis wylaczony (HISTORY_ENABLED=false). */
export class NullHistoryStore implements HistoryStore {
  readonly kind = 'wylaczony';
  async append(): Promise<void> {}
  async close(): Promise<void> {}
}
