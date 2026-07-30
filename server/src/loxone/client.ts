/**
 * LoxoneClient — jedyne miejsce w aplikacji, ktore wie, jak rozmawiac
 * z Miniserverem i jak sie do niego uwierzytelnic.
 *
 * Specyfikacja zaklada HTTP Basic po LAN. Miniserver Compact jest urzadzeniem
 * drugiej generacji i nowsze firmware'y potrafia wymuszac uwierzytelnianie
 * tokenem. Dlatego caly kod uwierzytelniania jest zamkniety tutaj: gdyby
 * Basic nie przeszedl, wymiana dotyczy jednego pliku.
 *
 * Ta klasa TYLKO CZYTA. Nie ma i nie moze miec metody wysylajacej komende.
 *
 * GDY STEROWANIE BEDZIE POTRZEBNE — nie dopisujemy go tutaj. Wchodzi jako
 * osobny modul, z wlasnym kontem Loxone (`pcm-sterowanie`, patrz README)
 * i z jawnym potwierdzeniem w interfejsie. Powod jest badawczy, nie
 * ideologiczny: dopoki warstwa odczytu fizycznie nie potrafi nic wyslac,
 * zaden blad w niej nie moze przestawic zaworu w trakcie tygodniowego testu
 * i uniewaznic wynikow. Ta niemoznosc jest cecha, nie brakiem.
 */

/** Odrzucone logowanie — NIGDY nie ponawiamy automatycznie. */
export class LoxoneAuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'LoxoneAuthError';
    this.status = status;
  }
}

/** Brak lacznosci, timeout, blad HTTP — to wolno ponawiac z backoffem. */
export class LoxoneNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'LoxoneNetworkError';
  }
}

export interface LoxoneClientOptions {
  host: string;
  user: string;
  pass: string;
  timeoutMs: number;
}

/** Odpowiedz Miniservera: { "LL": { "control": ..., "value": ..., "Code": ... } } */
interface LoxoneLLResponse {
  LL?: {
    control?: string;
    value?: unknown;
    Code?: string | number;
    code?: string | number;
  };
}

export interface StateReadResult {
  /** Wartosc po sparsowaniu; null = nie udalo sie zinterpretowac. */
  value: number | null;
  /** Surowa wartosc, tak jak ja zwrocil Miniserver. */
  raw: string;
  /** Kod odpowiedzi Loxone (200 = ok). */
  code: number;
  latencyMs: number;
}

/**
 * Parsuje wartosc zwrocona przez Miniservera.
 *
 * Loxone zwraca wartosci jako TEKST, czasem z doklejona jednostka
 * ("8.4", "8.4°", "8.4 °C", "0.512 m³/h"), a w polskiej lokalizacji potrafi
 * uzyc przecinka. Stany binarne przychodza jako "On"/"Off" albo "1"/"0".
 *
 * Zwraca null zamiast zera, gdy nie da sie odczytac liczby — brak danych
 * to brak danych.
 */
export function parseLoxoneValue(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  if (typeof raw !== 'string') return null;

  const text = raw.trim();
  if (text === '') return null;

  if (/^(on|true|yes)$/i.test(text)) return 1;
  if (/^(off|false|no)$/i.test(text)) return 0;

  // Pierwsza liczba w tekscie; przecinek traktujemy jak separator dziesietny.
  const match = text.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Wyciaga kod odpowiedzi z pola Code albo code. */
function readCode(ll: LoxoneLLResponse['LL']): number {
  const raw = ll?.Code ?? ll?.code;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class LoxoneClient {
  private readonly authHeader: string;
  readonly baseUrl: string;

  constructor(private readonly opts: LoxoneClientOptions) {
    this.baseUrl = `http://${opts.host}`;
    this.authHeader = `Basic ${Buffer.from(`${opts.user}:${opts.pass}`).toString('base64')}`;
  }

  /** Adres bez danych logowania — bezpieczny do logow. */
  get safeUrl(): string {
    return this.baseUrl;
  }

  private async request(path: string): Promise<{ response: Response; latencyMs: number }> {
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json, text/plain, */*',
        },
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      throw new LoxoneNetworkError(
        isTimeout
          ? `Miniserver ${this.opts.host} nie odpowiedział w ciągu ${this.opts.timeoutMs} ms.`
          : `Nie mogę się połączyć z Miniserverem ${this.opts.host}.`,
        error,
      );
    }

    const latencyMs = Date.now() - startedAt;

    // 401/403 to odrzucone logowanie — osobny typ bledu, zeby wyzsza warstwa
    // NIGDY nie ponowila proby automatycznie.
    if (response.status === 401 || response.status === 403) {
      throw new LoxoneAuthError(
        response.status,
        `Miniserver odrzucił logowanie (HTTP ${response.status}).`,
      );
    }

    if (!response.ok) {
      throw new LoxoneNetworkError(
        `Miniserver odpowiedział błędem HTTP ${response.status} na ${path}.`,
      );
    }

    return { response, latencyMs };
  }

  private async requestJson<T>(path: string): Promise<{ data: T; latencyMs: number }> {
    const { response, latencyMs } = await this.request(path);
    const text = await response.text();

    try {
      return { data: JSON.parse(text) as T, latencyMs };
    } catch {
      throw new LoxoneNetworkError(
        `Miniserver zwrócił odpowiedź, która nie jest poprawnym JSON-em (${path}).`,
      );
    }
  }

  /**
   * Odczyt stanu jednej kontrolki.
   * GET /jdev/sps/io/{uuid}/state
   */
  async readState(uuid: string): Promise<StateReadResult> {
    const { data, latencyMs } = await this.requestJson<LoxoneLLResponse>(
      `/jdev/sps/io/${encodeURIComponent(uuid)}/state`,
    );

    const ll = data.LL;
    const code = readCode(ll);
    const raw = ll?.value === undefined || ll?.value === null ? '' : String(ll.value);

    return { value: parseLoxoneValue(ll?.value), raw, code, latencyMs };
  }

  /**
   * Informacja o wersji i nazwie Miniservera.
   * GET /jdev/cfg/api — sluzy tez jako najtanszy test danych logowania.
   */
  async getApiInfo(): Promise<{ raw: string; latencyMs: number }> {
    const { data, latencyMs } = await this.requestJson<LoxoneLLResponse>('/jdev/cfg/api');
    return { raw: String(data.LL?.value ?? ''), latencyMs };
  }

  /**
   * Wersja struktury konfiguracji. Zmiana tej wartosci znaczy, ze ktos edytowal
   * projekt w Loxone Config i UUID-y moglyby sie rozjechac z rejestrem punktow.
   * GET /jdev/sps/LoxAPPversion3
   */
  async getStructureVersion(): Promise<string | null> {
    const { data } = await this.requestJson<LoxoneLLResponse>('/jdev/sps/LoxAPPversion3');
    const value = data.LL?.value;
    return value === undefined || value === null ? null : String(value);
  }

  /**
   * Pelna struktura instalacji: pomieszczenia, kategorie, kontrolki, UUID-y.
   * GET /data/LoxAPP3.json
   */
  async getStructure(): Promise<{ data: LoxApp3Structure; latencyMs: number }> {
    return this.requestJson<LoxApp3Structure>('/data/LoxAPP3.json');
  }
}

// ---------------------------------------------------------------------------
// Struktura LoxAPP3.json — tylko te fragmenty, ktorych naprawde uzywamy.
// ---------------------------------------------------------------------------

export interface LoxApp3Control {
  uuidAction?: string;
  name?: string;
  type?: string;
  room?: string;
  cat?: string;
  defaultRating?: number;
  /** Mapa nazwa stanu -> UUID stanu. Do odczytu wartosci sluzy zwykle `value`. */
  states?: Record<string, string | string[]>;
  subControls?: Record<string, LoxApp3Control>;
  /** np. { format: "%.1f°" } — podpowiada jednostke i precyzje. */
  details?: { format?: string; [key: string]: unknown };
}

export interface LoxApp3Structure {
  lastModified?: string;
  msInfo?: {
    serialNr?: string;
    msName?: string;
    projectName?: string;
    location?: string;
    swVersion?: string;
  };
  rooms?: Record<string, { name?: string; uuid?: string }>;
  cats?: Record<string, { name?: string; uuid?: string }>;
  controls?: Record<string, LoxApp3Control>;
}
