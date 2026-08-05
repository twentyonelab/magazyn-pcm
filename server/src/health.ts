/**
 * HealthTracker — stan lacznosci ze zrodlem danych.
 *
 * Widok Diagnostyka (krok 5) i endpoint /api/health czytaja stad. Awaria
 * czujnika w trakcie tygodniowego testu musi byc widoczna od razu, a nie
 * odkryta przy analizie danych.
 */

import type { BankState, Health, SocState, SourceKind, SourceStatus } from '@magazyn-pcm/shared';
import type { ValueCache } from './cache.js';
import type { PointRegistry } from './registry.js';

export interface HealthTrackerOptions {
  sourceKind: SourceKind;
  pollIntervalMs: number;
  staleAfterMs: number;
  registry: PointRegistry;
  cache: ValueCache;
  /** Stan wymiennych zbiornikow — czytany na biezaco, bo zestaw moze sie zmienic. */
  getBank: () => BankState;
  /**
   * Naladowanie z bilansu energii (soc-bilans.ts). W Health, bo health JUZ
   * plynie do przegladarki przy kazdym cyklu — naladowanie dostaje transport
   * za darmo, bez nowego endpointu i bez drugiego zrodla odswiezania.
   */
  getSoc?: () => SocState | null;
  now?: () => number;
}

export class HealthTracker {
  private status: SourceStatus = 'starting';
  private latencyMs: number | null = null;
  private lastOkAtMs: number | null = null;
  private message: string | null = null;
  private configChanged = false;
  private readonly startedAtMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: HealthTrackerOptions) {
    this.now = opts.now ?? Date.now;
    this.startedAtMs = this.now();
  }

  update(patch: {
    status?: SourceStatus;
    latencyMs?: number | null;
    message?: string | null;
  }): void {
    if (patch.status !== undefined) this.status = patch.status;
    if (patch.latencyMs !== undefined) this.latencyMs = patch.latencyMs;
    if (patch.message !== undefined) this.message = patch.message;
    if (patch.status === 'ok') this.lastOkAtMs = this.now();
  }

  markConfigChanged(): void {
    this.configChanged = true;
  }

  get currentStatus(): SourceStatus {
    return this.status;
  }

  snapshot(): Health {
    const bank = this.opts.getBank();
    const ids = this.opts.registry.all().map((p) => p.id);
    const pollableIds = this.opts.registry.pollablePoints(bank.active).map((p) => p.id);

    return {
      source: this.status,
      sourceKind: this.opts.sourceKind,
      soc: this.opts.getSoc?.() ?? null,
      bank,
      latencyMs: this.latencyMs,
      lastOkAt: this.lastOkAtMs === null ? null : new Date(this.lastOkAtMs).toISOString(),
      // Punkty bez UUID-a raportujemy osobno — nie zasmiecaja listy
      // przestarzalych, bo one nie sa zepsute, tylko jeszcze niepodlaczone.
      staleIds: this.opts.cache.staleIds(
        ids.filter((id) => pollableIds.includes(id) || this.opts.cache.hasReading(id)),
      ),
      pendingUuidIds: this.opts.registry.pendingUuidPoints(bank.active).map((p) => p.id),
      uptimeS: Math.round((this.now() - this.startedAtMs) / 1000),
      pollIntervalMs: this.opts.pollIntervalMs,
      staleAfterMs: this.opts.staleAfterMs,
      message: this.message,
      configChanged: this.configChanged,
    };
  }
}
