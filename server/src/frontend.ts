/**
 * PODAWANIE ZBUDOWANEJ APLIKACJI PRZEZ SERWER.
 *
 * Do tej pory serwer obsługiwał wyłącznie `/api/*`, a interfejs podawał obok
 * niego serwer deweloperski Vite. Przy pracy nad kodem to właściwy układ — Vite
 * przebudowuje moduły na bieżąco. Ale przy wdrożeniu na jednej maszynie, gdzie
 * aplikacja ma chodzić tygodniami, serwer deweloperski jest złym narzędziem:
 * jest cięższy, nie jest do tego przeznaczony i wymagałby drugiego procesu oraz
 * drugiego portu.
 *
 * Tutaj serwer podaje gotowe pliki z `web/dist`. Efekt: JEDEN proces i JEDEN
 * port. Aplikacja i jej dane wychodzą z tego samego adresu, więc znika też
 * cała klasa problemów, którą mieliśmy przy GitHub Pages — CORS, ciasteczko
 * z SameSite, blokowanie treści po HTTP na stronie HTTPS. Wszystko to brało się
 * wyłącznie z tego, że interfejs i dane były w dwóch różnych miejscach.
 *
 * ZACHOWANIE PRZY BRAKU BUDOWY. Gdy `web/dist` nie istnieje (typowo w trybie
 * pracy nad kodem, gdzie interfejs idzie z Vite), moduł nie robi NIC i mówi to
 * w logu. Nie jest to błąd — to dwa różne tryby pracy tej samej aplikacji.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Logger } from 'pino';

export interface FrontendOptions {
  /** Korzeń repozytorium — od niego liczymy `web/dist`. */
  repoRoot: string;
  logger: Logger;
}

export async function registerFrontend(
  app: FastifyInstance,
  { repoRoot, logger }: FrontendOptions,
): Promise<void> {
  const katalog = path.join(repoRoot, 'web', 'dist');
  const indeks = path.join(katalog, 'index.html');

  if (!fs.existsSync(indeks)) {
    logger.info(
      { katalog },
      'Zbudowanego interfejsu nie ma — serwer podaje tylko /api/*. ' +
        'Do wdrożenia uruchom `npm run build`.',
    );

    // Korzeń mówi, gdzie szukać interfejsu. Bez tego trafiłby na obsługę
    // nieznanego adresu, która próbowałaby oddać nieistniejący `index.html`.
    app.get('/', async () => ({
      app: 'magazyn-pcm',
      interfejs: 'nie zbudowany — uruchom `npm run build` albo otwórz serwer Vite',
      api: '/api',
    }));
    return;
  }

  await app.register(fastifyStatic, {
    root: katalog,
    // Bez prefiksu: interfejs siedzi w korzeniu adresu, obok /api/*.
    prefix: '/',
    // Nagłówki pamięci ustawiamy SAMI, w hooku niżej.
    cacheControl: false,
  });

  /**
   * Jak długo przeglądarka może trzymać plik.
   *
   * Paczki Vite mają skrót treści w nazwie (`index-CDgoJjgZ.js`), więc każda
   * zmiana daje nową nazwę — mogą leżeć w pamięci choćby rok.
   *
   * `index.html` NIE MOŻE być zapamiętywany i to jest tu rzecz krytyczna: on
   * wskazuje nazwy paczek. Zapamiętany na rok kazałby przeglądarce po wdrożeniu
   * sięgać po pliki, których już nie ma — czyli biała strona, do wyczyszczenia
   * pamięci ręcznie.
   *
   * ROBIMY TO HOOKIEM, nie opcją `setHeaders` wtyczki. Przy `maxAge` razem
   * z `setHeaders` sprawdziłem, że `index.html` i tak wychodził
   * z `max-age=31536000` — nagłówek z opcji nadpisywał ten ustawiony ręcznie.
   * Hook `onSend` biegnie po wszystkim i ostatnie słowo ma tutaj.
   */
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/api/')) return;
    const trwaly = request.url.startsWith('/assets/');
    reply.header(
      'cache-control',
      trwaly ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
  });

  /**
   * Nieznany adres oddaje `index.html` — aplikacja jest jednostronicowa
   * i sama decyduje, co pokazać.
   *
   * WYJĄTEK NA `/api/*` JEST KONIECZNY: bez niego zapytanie o nieistniejący
   * punkt API dostawałoby stronę HTML ze statusem 200 zamiast czystego 404.
   * Warstwa danych w przeglądarce próbowałaby to przeczytać jako JSON i zgłosiła
   * „serwer nie odpowiada" — komunikat kierujący w zupełnie złą stronę.
   */
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Nie ma takiego punktu API.' });
    }
    return reply.sendFile('index.html');
  });

  logger.info({ katalog }, 'Interfejs podawany z katalogu budowy');
}
