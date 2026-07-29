/**
 * SessionStore — sesje badawcze i ich znaczniki zdarzen.
 *
 * DLACZEGO PLIK JSON, A NIE SQLITE:
 * sesji jest kilka-kilkanascie na caly projekt (nie kilka na sekunde jak
 * pomiarow), a zapis historii ma wymienny backend (HISTORY_BACKEND=ndjson
 * dziala bez zadnych zaleznosci natywnych). Gdyby sesje mieszkaly w SQLite,
 * awaryjny tryb ndjson traciłby tez sesje. Plik JSON czyta sie i naprawia
 * recznie — dla danych o tej skali to zaleta, nie prowizorka.
 *
 * Zapis jest atomowy: najpierw plik tymczasowy, potem rename. Przerwany
 * zapis nie moze zostawic urwanego JSON-a, bo to sa metadane, ktore nadaja
 * sens całej historii pomiarow.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';
import type { PcmMaterial, Session, SessionEvent, SessionRecord } from '@magazyn-pcm/shared';

interface StoreFile {
  /** Wersja formatu — na wypadek przyszlej migracji. */
  version: 1;
  nextId: number;
  sessions: SessionRecord[];
}

const EMPTY: StoreFile = { version: 1, nextId: 1, sessions: [] };

export class SessionStoreError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'SessionStoreError';
    this.statusCode = statusCode;
  }
}

export class SessionStore {
  private data: StoreFile;

  constructor(
    private readonly file: string,
    private readonly logger: Logger,
  ) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.data = this.load();
  }

  private load(): StoreFile {
    if (!fs.existsSync(this.file)) return structuredClone(EMPTY);

    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as StoreFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
        throw new Error('nieznany format');
      }
      return parsed;
    } catch (error) {
      // Uszkodzony plik odkladamy na bok zamiast nadpisywac — to moga byc
      // odzyskiwalne notatki z dwoch tygodni testu.
      const backup = `${this.file}.uszkodzony-${Date.now()}`;
      fs.copyFileSync(this.file, backup);
      this.logger.error(
        { file: this.file, backup, err: error instanceof Error ? error.message : String(error) },
        'Plik sesji jest uszkodzony — odlozylem kopie i zaczynam od pustego',
      );
      return structuredClone(EMPTY);
    }
  }

  private persist(): void {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  /** Biezaca sesja albo null — jedyna z endedAt === null. */
  current(): SessionRecord | null {
    return this.data.sessions.find((s) => s.endedAt === null) ?? null;
  }

  /** Biezaca sesja w ksztalcie kontraktu /api/snapshot. */
  currentAsSession(): Session | null {
    const record = this.current();
    if (!record) return null;
    return {
      material: record.material,
      label: record.label,
      startedAt: record.startedAt,
      note: record.note,
    };
  }

  /** Wszystkie sesje, najnowsza pierwsza. */
  list(): SessionRecord[] {
    return [...this.data.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  start(material: PcmMaterial, label: string, note: string | null): SessionRecord {
    if (this.current()) {
      throw new SessionStoreError(
        'Jedna sesja już trwa. Zakończ ją, zanim rozpoczniesz następną — zbiornik pracuje z jednym materiałem naraz.',
        409,
      );
    }

    const record: SessionRecord = {
      id: this.data.nextId,
      material,
      label,
      note,
      startedAt: new Date().toISOString(),
      endedAt: null,
      events: [{ ts: new Date().toISOString(), label: 'start sesji' }],
    };

    this.data.nextId += 1;
    this.data.sessions.push(record);
    this.persist();
    this.logger.info({ id: record.id, material, label }, 'Rozpoczęto sesję badawczą');
    return record;
  }

  end(): SessionRecord {
    const record = this.current();
    if (!record) {
      throw new SessionStoreError('Żadna sesja nie jest uruchomiona — nie ma czego kończyć.', 409);
    }

    record.endedAt = new Date().toISOString();
    record.events.push({ ts: record.endedAt, label: 'koniec sesji' });
    this.persist();
    this.logger.info({ id: record.id }, 'Zakończono sesję badawczą');
    return record;
  }

  addEvent(label: string): SessionEvent {
    const record = this.current();
    if (!record) {
      throw new SessionStoreError(
        'Żadna sesja nie jest uruchomiona. Znaczniki zdarzeń należą do sesji — rozpocznij ją najpierw.',
        409,
      );
    }

    const event: SessionEvent = { ts: new Date().toISOString(), label };
    record.events.push(event);
    this.persist();
    return event;
  }
}
