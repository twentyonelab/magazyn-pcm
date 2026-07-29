/**
 * SSE — strumien zmian do przegladarki.
 *
 * Zasada: wysylamy TYLKO ZMIENIONE punkty, klient scala je z lokalnym stanem.
 * Przy szesciu punktach roznica jest niewielka, ale przy pelnym rejestrze
 * i tygodniowym tescie oszczedza to spory ruch — i, co wazniejsze, sprawia,
 * ze zdarzenie znaczy "to sie wlasnie zmienilo", a nie "oto wszystko".
 *
 * Dwa zdarzenia, zgodnie z kontraktem:
 *   event: values  — { ts, values: { ID: { v, ts, stale } } }
 *   event: health  — stan lacznosci ze zrodlem
 *
 * Trzy rzeczy, ktore latwo pominac przy SSE:
 *
 *   1. PRZEJSCIE W STAN PRZESTARZALY nie generuje odczytu. Gdy czujnik
 *      przestaje odpowiadac, zadne zdarzenie samo z siebie nie powstanie —
 *      klient trwalby w przekonaniu, ze wartosc jest aktualna. Dlatego
 *      osobny przeglad wykrywa zmiane zbioru przestarzalych punktow
 *      i wysyla je jawnie. To wymog badawczy: awaria sondy w tygodniowym
 *      tescie ma byc widoczna od razu.
 *
 *   2. KEEPALIVE. Bez ruchu w kanale posrednicy i przegladarki zamykaja
 *      polaczenie po kilkudziesieciu sekundach. Komentarz SSE co 20 s
 *      utrzymuje je otwarte i nic nie znaczy dla klienta.
 *
 *   3. ZDARZENIA ZDROWIA WYSYLAMY PRZY ZMIANIE, nie co cykl. Inaczej
 *      w spokojnym stanie kanal zapelnia sie identycznymi komunikatami.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Health, PointValues } from '@magazyn-pcm/shared';
import type { Logger } from 'pino';

/**
 * Keepalive musi byc czesty, bo jest JEDYNYM pewnym dowodem, ze kanal zyje.
 * Zdarzenia `values` przychodza tylko przy zmianie wartosci — przy stabilnej
 * temperaturze moglyby nie przyjsc godzinami, a klient nie mialby po czym
 * poznac, ze polaczenie padlo.
 */
const KEEPALIVE_MS = 10_000;

interface Client {
  id: number;
  reply: FastifyReply;
}

export class StreamHub {
  private readonly clients = new Map<number, Client>();
  private nextId = 1;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private lastHealthFingerprint: string | null = null;

  /**
   * @param getHealth Biezacy stan zdrowia — wysylany kazdemu nowemu klientowi
   *   od razu po podlaczeniu. Bez tego klient, ktory podlaczyl sie w spokojnym
   *   momencie, nie wiedzialby nic o stanie zrodla do pierwszej zmiany.
   */
  constructor(
    private readonly logger: Logger,
    private readonly getHealth: () => Health,
  ) {}

  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Podlacza nowego klienta. Fastify oddaje nam surowa odpowiedz —
   * od tego momentu sami zarzadzamy tym strumieniem.
   */
  addClient(request: FastifyRequest, reply: FastifyReply): void {
    reply.hijack();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Wylacza buforowanie w posrednikach (np. nginx), ktore inaczej
      // wstrzymaloby zdarzenia do czasu zapelnienia bufora.
      'X-Accel-Buffering': 'no',
    });

    const id = this.nextId++;
    this.clients.set(id, { id, reply });

    // Podpowiedz dla klienta, po jakim czasie ponowic polaczenie.
    reply.raw.write('retry: 3000\n\n');

    // Stan zdrowia od razu, tylko do tego jednego klienta.
    try {
      reply.raw.write(`event: health\ndata: ${JSON.stringify(this.getHealth())}\n\n`);
    } catch {
      // Zerwane zaraz po podlaczeniu — obsluzy to cleanup ponizej.
    }

    const cleanup = (): void => {
      this.clients.delete(id);
      this.logger.debug({ clientId: id, clients: this.clients.size }, 'Klient SSE odlaczony');
    };

    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);

    this.logger.debug({ clientId: id, clients: this.clients.size }, 'Klient SSE podlaczony');

    this.ensureKeepalive();
  }

  /** Wysyla zmienione wartosci. Puste wejscie nie generuje zdarzenia. */
  sendValues(values: PointValues): void {
    if (Object.keys(values).length === 0) return;
    this.broadcast('values', { ts: new Date().toISOString(), values });
  }

  /** Wysyla stan zdrowia tylko wtedy, gdy naprawde sie zmienil. */
  sendHealthIfChanged(health: Health): void {
    // Do porownania bierzemy to, co dla czlowieka znaczy "cos innego sie dzieje".
    // Opoznienie i czas dzialania zmieniaja sie co cykl i celowo je pomijamy.
    const fingerprint = JSON.stringify({
      source: health.source,
      message: health.message,
      staleIds: health.staleIds,
      pendingUuidIds: health.pendingUuidIds,
      configChanged: health.configChanged,
    });

    if (fingerprint === this.lastHealthFingerprint) return;
    this.lastHealthFingerprint = fingerprint;
    this.broadcast('health', health);
  }

  /** Wysyla stan zdrowia bezwarunkowo. */
  sendHealth(health: Health): void {
    this.lastHealthFingerprint = null;
    this.sendHealthIfChanged(health);
  }

  private broadcast(event: string, payload: unknown): void {
    if (this.clients.size === 0) return;

    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const client of [...this.clients.values()]) {
      try {
        client.reply.raw.write(frame);
      } catch (error) {
        // Zerwane polaczenie nie moze przerwac wysylki do pozostalych.
        this.clients.delete(client.id);
        this.logger.debug(
          { clientId: client.id, err: error instanceof Error ? error.message : String(error) },
          'Nie udalo sie wyslac zdarzenia — usuwam klienta',
        );
      }
    }
  }

  private ensureKeepalive(): void {
    if (this.keepaliveTimer) return;

    this.keepaliveTimer = setInterval(() => {
      if (this.clients.size === 0) return;
      for (const client of [...this.clients.values()]) {
        try {
          client.reply.raw.write(': keepalive\n\n');
        } catch {
          this.clients.delete(client.id);
        }
      }
    }, KEEPALIVE_MS);

    // Keepalive nie moze trzymac procesu przy zyciu przy zamykaniu.
    this.keepaliveTimer.unref();
  }

  /** Zamyka wszystkie polaczenia — wywolywane przy zatrzymaniu serwera. */
  close(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    for (const client of this.clients.values()) {
      try {
        client.reply.raw.end();
      } catch {
        // Nieistotne — i tak zamykamy.
      }
    }
    this.clients.clear();
  }
}
