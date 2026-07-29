/**
 * PointRegistry — dostep do rejestru punktow i walidacja jego spojnosci.
 *
 * Rejestr jest walidowany przy starcie: literowka w konfiguracji ma sie
 * ujawnic natychmiast, a nie po dwoch tygodniach zbierania danych.
 */

import { z } from 'zod';
import type { PointDef, PublicPoint } from '@magazyn-pcm/shared';
import { POINTS } from './points.config.js';

const geometrySchema = z.object({
  diagonal: z.enum(['A', 'B']),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

const pointSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[A-Z0-9_]+$/, 'identyfikator może zawierać tylko A-Z, 0-9 i podkreślenie'),
  uuid: z.string().min(1).nullable(),
  label: z.string().min(1),
  unit: z.string(),
  kind: z.enum(['temperature', 'flow', 'energy', 'power', 'volume', 'delta', 'state']),
  group: z.enum(['pcm', 'buffer', 'heatpump', 'meter', 'ambient', 'actuator']),
  precision: z.number().int().min(0).max(6),
  geometry: geometrySchema.optional(),
  available: z.boolean(),
});

export class RegistryError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Rejestr punktów zawiera błędy:\n  - ${problems.join('\n  - ')}`);
    this.name = 'RegistryError';
    this.problems = problems;
  }
}

export class PointRegistry {
  private readonly byId = new Map<string, PointDef>();
  private readonly byUuid = new Map<string, PointDef>();

  constructor(points: readonly PointDef[]) {
    const problems: string[] = [];

    points.forEach((raw, index) => {
      const parsed = pointSchema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          problems.push(
            `punkt #${index + 1} (${String(raw.id ?? '?')}), pole ${issue.path.join('.')}: ${issue.message}`,
          );
        }
        return;
      }
      const point = parsed.data as PointDef;

      if (this.byId.has(point.id)) {
        problems.push(`zduplikowany identyfikator punktu: ${point.id}`);
        return;
      }
      if (point.uuid) {
        const clash = this.byUuid.get(point.uuid);
        if (clash) {
          problems.push(`ten sam UUID przypisany do ${clash.id} i ${point.id}: ${point.uuid}`);
          return;
        }
        this.byUuid.set(point.uuid, point);
      }
      this.byId.set(point.id, point);
    });

    // Sonda w magazynie bez pozycji w siatce nie da sie narysowac.
    for (const point of this.byId.values()) {
      if (point.group === 'pcm' && !point.geometry) {
        problems.push(`punkt ${point.id} nalezy do magazynu, ale nie ma pola geometry`);
      }
    }

    // Dwie sondy na tej samej pozycji to zawsze blad konfiguracji.
    const seenPositions = new Map<string, string>();
    for (const point of this.byId.values()) {
      if (!point.geometry) continue;
      const key = `${point.geometry.diagonal}${point.geometry.level}`;
      const previous = seenPositions.get(key);
      if (previous) {
        problems.push(`punkty ${previous} i ${point.id} maja te sama pozycje w zbiorniku (${key})`);
      } else {
        seenPositions.set(key, point.id);
      }
    }

    if (problems.length > 0) throw new RegistryError(problems);
  }

  /** Wszystkie punkty w kolejnosci z pliku konfiguracyjnego. */
  all(): PointDef[] {
    return [...this.byId.values()];
  }

  get(id: string): PointDef | undefined {
    return this.byId.get(id);
  }

  getByUuid(uuid: string): PointDef | undefined {
    return this.byUuid.get(uuid);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Punkty w magazynie PCM, uporzadkowane: poziom malejaco, potem przekatna. */
  pcmPoints(): PointDef[] {
    return this.all()
      .filter((p) => p.group === 'pcm' && p.geometry)
      .sort((a, b) => {
        const levelDiff = b.geometry!.level - a.geometry!.level;
        if (levelDiff !== 0) return levelDiff;
        return a.geometry!.diagonal.localeCompare(b.geometry!.diagonal);
      });
  }

  /**
   * Punkty, ktore probujemy odczytywac: zadeklarowane jako dostepne
   * i majace przypisany UUID.
   */
  pollablePoints(): PointDef[] {
    return this.all().filter((p) => p.available && p.uuid !== null);
  }

  /**
   * Punkty zadeklarowane jako dostepne, ale bez UUID-a — czekaja na
   * uruchomienie `npm run uuid` w sieci laboratorium.
   */
  pendingUuidPoints(): PointDef[] {
    return this.all().filter((p) => p.available && p.uuid === null);
  }

  /** Postac publiczna — bez UUID-ow. Frontend nigdy ich nie widzi. */
  publicPoints(): PublicPoint[] {
    return this.all().map(({ uuid: _uuid, ...rest }) => rest);
  }
}

export function createRegistry(points: readonly PointDef[] = POINTS): PointRegistry {
  return new PointRegistry(points);
}
