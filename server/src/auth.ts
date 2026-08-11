/**
 * Uwierzytelnianie dostepu do aplikacji.
 *
 * Po co: dopoki aplikacja stoi w sieci laboratorium, nie potrzebuje logowania.
 * Gdy ma byc widoczna z zewnatrz (tunel, publiczny adres IP), brak logowania
 * znaczy, ze kazdy, kto zna adres, widzi dane badawcze — i moze zalozyc albo
 * zakonczyc sesje. Dlatego AUTH_ENABLED=true wlacza brame przed CALYM API,
 * takze przed strumieniem SSE.
 *
 * DECYZJE, KTORE WARTO ROZUMIEC:
 *
 * 1. JEDNO HASLO, nie konta uzytkownikow. Stanowisko obsluguje dwuosobowe
 *    studio. Baza uzytkownikow z rolami byla by tu aparatura bez zastosowania,
 *    a kazdy dodatkowy element to kolejna rzecz, ktora moze sie zepsuc.
 *
 * 2. HASLA NIE PRZECHOWUJEMY — ani jawnie, ani odwracalnie. W .env siedzi
 *    hash scrypt. Nawet z dostepem do pliku nie da sie odczytac hasla.
 *
 * 3. Token sesji jest PODPISANY, nie przechowywany. Serwer nie trzyma listy
 *    zalogowanych, wiec restart w trakcie tygodniowego testu nie wylogowuje
 *    nikogo i nie trzeba pamietac stanu miedzy uruchomieniami.
 *
 * 4. OPOZNIENIE PO NIEUDANEJ PROBIE rosnie wykladniczo, per adres IP.
 *    Ta sama logika, ktora chroni konto w Loxone, chroni tu przed zgadywaniem
 *    hasla — z ta roznica, ze nie blokujemy na stale, zeby nie odciac
 *    wlasnego dostepu w trakcie testu.
 *
 * Aplikacja i tak TYLKO CZYTA z Miniservera, wiec nawet przelamanie tej bramy
 * nie daje sterowania instalacja. Chroni dane badawcze i metadane sesji.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'pino';

const COOKIE_NAME = 'pcm_sesja';
const SCRYPT_KEYLEN = 32;
/** Parametry scrypt — swiadomie kosztowne, zeby zgadywanie bylo drogie. */
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1 };

export interface AuthOptions {
  enabled: boolean;
  /** Hash hasla w formacie scrypt$sol$klucz (heksadecymalnie). */
  passwordHash: string;
  /** Ile dni wazny jest token po zalogowaniu. */
  sessionDays: number;
  /** Katalog na sekret podpisu (obok danych pomiarowych). */
  dataDir: string;
  logger: Logger;
}

// ---------------------------------------------------------------------------
// Haslo
// ---------------------------------------------------------------------------

/** Tworzy hash hasla do wpisania w .env. Uzywane przez `npm run haslo`. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * Sprawdza haslo wobec hasha.
 * Porownanie w stalym czasie — inaczej czas odpowiedzi zdradzalby, ile
 * pierwszych bajtow sie zgadza.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  try {
    const salt = Buffer.from(parts[1]!, 'hex');
    const expected = Buffer.from(parts[2]!, 'hex');
    if (expected.length !== SCRYPT_KEYLEN) return false;

    const actual = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sekret podpisu
// ---------------------------------------------------------------------------

/**
 * Sekret do podpisywania tokenow. Trzymany w pliku obok danych, zeby
 * przetrwal restart — inaczej kazde uruchomienie serwera wylogowywaloby
 * wszystkich, co przy zbieraniu 24/7 byloby uciazliwe bez powodu.
 */
function loadOrCreateSecret(dataDir: string, logger: Logger): Buffer {
  const file = path.join(dataDir, 'auth-secret');

  if (fs.existsSync(file)) {
    const value = fs.readFileSync(file, 'utf8').trim();
    if (value.length >= 64) return Buffer.from(value, 'hex');
    logger.warn('Plik auth-secret jest niepoprawny — tworzę nowy (wszyscy zostaną wylogowani)');
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const secret = crypto.randomBytes(32);
  fs.writeFileSync(file, secret.toString('hex'), { encoding: 'utf8', mode: 0o600 });
  logger.info({ file }, 'Utworzono sekret podpisu sesji');
  return secret;
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

function signToken(secret: Buffer, expiresAtMs: number): string {
  const payload = String(expiresAtMs);
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${mac}`;
}

function verifyToken(secret: Buffer, token: string): boolean {
  const [encodedPayload, mac] = token.split('.');
  if (!encodedPayload || !mac) return false;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const macBuffer = Buffer.from(mac);
  const expectedBuffer = Buffer.from(expected);
  if (macBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(macBuffer, expectedBuffer)) return false;

  const expiresAtMs = Number(payload);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

// ---------------------------------------------------------------------------
// Opoznienie po nieudanych probach
// ---------------------------------------------------------------------------

class AttemptTracker {
  private readonly failures = new Map<string, { count: number; lastMs: number }>();

  /** Ile milisekund trzeba jeszcze poczekac przed kolejna proba. */
  waitMs(key: string): number {
    const entry = this.failures.get(key);
    if (!entry || entry.count === 0) return 0;

    // 1 s, 2 s, 4 s, ... do 60 s. Nie blokujemy na stale: zablokowany na
    // godzine dostep do wlasnych danych w trakcie testu to zbyt duza cena.
    const penalty = Math.min(1000 * 2 ** (entry.count - 1), 60_000);
    const elapsed = Date.now() - entry.lastMs;
    return Math.max(penalty - elapsed, 0);
  }

  fail(key: string): void {
    const entry = this.failures.get(key) ?? { count: 0, lastMs: 0 };
    this.failures.set(key, { count: entry.count + 1, lastMs: Date.now() });
  }

  succeed(key: string): void {
    this.failures.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Rejestracja w Fastify
// ---------------------------------------------------------------------------

/** Ktore sciezki dzialaja bez logowania. */
function isPublic(url: string): boolean {
  const pathOnly = url.split('?')[0] ?? url;
  return pathOnly === '/api/login' || pathOnly === '/api/auth' || pathOnly === '/api/logout';
}

function readCookie(request: FastifyRequest, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export async function registerAuth(app: FastifyInstance, opts: AuthOptions): Promise<void> {
  const attempts = new AttemptTracker();

  // Sekret tworzymy tylko wtedy, gdy brama jest wlaczona — inaczej
  // zostawialibysmy w katalogu danych plik, ktory nic nie robi.
  const secret = opts.enabled ? loadOrCreateSecret(opts.dataDir, opts.logger) : Buffer.alloc(0);

  /** Stan bramy — frontend pyta o to przed pokazaniem czegokolwiek. */
  app.get('/api/auth', async (request) => ({
    required: opts.enabled,
    loggedIn: opts.enabled
      ? (() => {
          const token = readCookie(request, COOKIE_NAME);
          return token !== null && verifyToken(secret, token);
        })()
      : true,
  }));

  if (!opts.enabled) {
    // Bez bramy nie dodajemy hooka ani endpointu logowania: mniej ruchomych
    // czesci w domyslnej, laboratoryjnej konfiguracji.
    app.post('/api/login', async (_request, reply) => {
      reply.code(400);
      return { error: 'Logowanie jest wyłączone (AUTH_ENABLED=false).' };
    });
    return;
  }

  if (!opts.passwordHash) {
    throw new Error(
      'AUTH_ENABLED=true, ale AUTH_PASSWORD_HASH jest puste. ' +
        'Wygeneruj hash komendą `npm run haslo` i wklej go do pliku .env.',
    );
  }

  const setSessionCookie = (reply: FastifyReply, token: string, maxAgeS: number): void => {
    const secure = process.env.AUTH_COOKIE_SECURE === 'true';
    reply.header(
      'Set-Cookie',
      [
        `${COOKIE_NAME}=${token}`,
        'Path=/',
        // HttpOnly: token niedostepny dla skryptow w przegladarce.
        'HttpOnly',
        // Lax wystarcza: nie mamy zadnej operacji zmieniajacej stan,
        // ktora dalaby sie wywolac z obcej strony metoda GET.
        'SameSite=Lax',
        `Max-Age=${maxAgeS}`,
        ...(secure ? ['Secure'] : []),
      ].join('; '),
    );
  };

  app.post('/api/login', async (request, reply) => {
    const key = request.ip;
    const wait = attempts.waitMs(key);

    if (wait > 0) {
      reply.code(429);
      return {
        error: `Za dużo nieudanych prób. Odczekaj ${Math.ceil(wait / 1000)} s.`,
      };
    }

    const body = request.body as { password?: unknown } | undefined;
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!password || !verifyPassword(password, opts.passwordHash)) {
      attempts.fail(key);
      opts.logger.warn({ ip: key }, 'Nieudana próba logowania do aplikacji');
      reply.code(401);
      return { error: 'Nieprawidłowe hasło.' };
    }

    attempts.succeed(key);
    const maxAgeS = opts.sessionDays * 86_400;
    setSessionCookie(reply, signToken(secret, Date.now() + maxAgeS * 1000), maxAgeS);
    return { ok: true };
  });

  app.post('/api/logout', async (_request, reply) => {
    setSessionCookie(reply, '', 0);
    return { ok: true };
  });

  // Brama przed calym /api — takze przed SSE, ktory bez tego wyciekalby
  // wszystkie wartosci bez logowania.
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url;
    if (!url.startsWith('/api/') || isPublic(url)) return;

    const token = readCookie(request, COOKIE_NAME);
    if (token !== null && verifyToken(secret, token)) return;

    reply.code(401);
    return reply.send({ error: 'Wymagane logowanie.' });
  });

  /*
   * SYMULATOR DOBORU TEZ ZA BRAMA — ale inaczej niz /api.
   *
   * To STRONA DLA CZLOWIEKA, wiec zamiast odpowiedzi 401 (ktora w przegladarce
   * wyglada jak awaria) kierujemy na ekran wejscia i zapamietujemy, dokad
   * uzytkownik zmierzal. Po zalogowaniu wraca dokladnie tam.
   *
   * Dziala, bo entalvia.eu i app.entalvia.eu to TEN SAM serwis — ciasteczko
   * zalozone przy logowaniu obowiazuje na obu adresach.
   */
  app.addHook('onRequest', async (request, reply) => {
    const sciezka = request.url.split('?')[0] ?? request.url;
    if (sciezka !== '/symulator.html' && sciezka !== '/symulator') return;

    const token = readCookie(request, COOKIE_NAME);
    if (token !== null && verifyToken(secret, token)) return;

    return reply.redirect('/?wejscie&powrot=' + encodeURIComponent(sciezka));
  });

  opts.logger.info(
    { sessionDays: opts.sessionDays },
    'Logowanie do aplikacji WŁĄCZONE — dostęp do /api wymaga hasła',
  );
}
