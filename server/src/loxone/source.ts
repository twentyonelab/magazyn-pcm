/**
 * LoxoneSource — GRANICA WYMIENNOSCI ZRODLA DANYCH.
 *
 * To najwazniejszy interfejs w aplikacji. Wszystko powyzej (cache, historia,
 * API, frontend) wie tylko tyle, ze "pojawily sie nowe odczyty" i "stan
 * lacznosci sie zmienil". Nic powyzej nie wie, czy dane przyszly przez
 * odpytywanie HTTP, przez WebSocket, czy sa syntetyczne.
 *
 * DLACZEGO INTERFEJS JEST ZDARZENIOWY (push), A NIE ODPYTYWANY (pull):
 * WebSocket Loxone z natury PCHA dane. Gdyby interfejs mial postac
 * `getValues()`, implementacja WebSocketowa musialaby buforowac zdarzenia
 * i udawac, ze jest odpytywana — a warstwa wyzej musialaby dalej odpytywac
 * w petli, czyli caly zysk z pushu przepadlby. Przy kszalcie zdarzeniowym
 * podmiana HttpPollSource -> WebSocketSource nie dotyka niczego poza jednym
 * plikiem.
 *
 * Implementacje:
 *   HttpPollSource  — v1, odpytywanie co 5 s (ten krok)
 *   MockSource      — dane syntetyczne, praca bez laboratorium
 *   WebSocketSource — v2, push w czasie rzeczywistym (pozniej)
 */

import type { SourceKind, SourceStatus } from '@magazyn-pcm/shared';

/** Jeden odczyt punktu ze zrodla. */
export interface SourceReading {
  /** Identyfikator logiczny z rejestru punktow (nigdy UUID). */
  id: string;
  /** Wartosc albo null, gdy zrodlo nie potrafilo jej odczytac. */
  v: number | null;
  /** Czas UDANEGO ODCZYTU (ms epoch). */
  readAtMs: number;
  /** Surowa wartosc ze zrodla — do diagnostyki. */
  raw?: string;
}

/** Zmiana stanu lacznosci ze zrodlem. */
export interface SourceHealthEvent {
  status: SourceStatus;
  /** Czas trwania ostatniego cyklu odczytu w ms. */
  latencyMs: number | null;
  /** Komunikat dla czlowieka, po polsku. */
  message?: string | null;
  /**
   * true = blad trwaly, zrodlo samo sie zatrzymalo i nie bedzie ponawiac prob.
   * Tak zachowuje sie odrzucone logowanie — inaczej Miniserver zablokowalby konto.
   */
  fatal?: boolean;
}

export type ReadingsListener = (readings: SourceReading[]) => void;
export type HealthListener = (event: SourceHealthEvent) => void;

export interface LoxoneSource {
  readonly kind: SourceKind;

  /**
   * Uruchamia zrodlo. Powinno wykonac jednorazowa weryfikacje lacznosci
   * i danych logowania, zeby blad ujawnil sie natychmiast.
   */
  start(): Promise<void>;

  /** Zatrzymuje zrodlo i zwalnia zasoby. */
  stop(): Promise<void>;

  onReadings(listener: ReadingsListener): void;
  onHealth(listener: HealthListener): void;
}

/**
 * Wspolna baza dla implementacji — obsluga listenerow.
 */
export abstract class BaseSource implements LoxoneSource {
  abstract readonly kind: SourceKind;

  private readingsListeners: ReadingsListener[] = [];
  private healthListeners: HealthListener[] = [];

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  onReadings(listener: ReadingsListener): void {
    this.readingsListeners.push(listener);
  }

  onHealth(listener: HealthListener): void {
    this.healthListeners.push(listener);
  }

  protected emitReadings(readings: SourceReading[]): void {
    if (readings.length === 0) return;
    for (const listener of this.readingsListeners) listener(readings);
  }

  protected emitHealth(event: SourceHealthEvent): void {
    for (const listener of this.healthListeners) listener(event);
  }
}
