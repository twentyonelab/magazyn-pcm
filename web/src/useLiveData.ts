/**
 * useLiveData — jedno zrodlo prawdy o danych na zywo dla calego frontendu.
 *
 * Jak to dziala:
 *   1. Pobiera rejestr punktow i snapshot (stan pelny).
 *   2. Otwiera strumien SSE i SCALA przychodzace zmiany z lokalnym stanem —
 *      serwer wysyla tylko to, co sie zmienilo.
 *   3. Po zerwaniu polaczenia ponawia z narastajacym opoznieniem, a po
 *      odzyskaniu pobiera snapshot, zeby nadrobic przegapione zmiany.
 *
 * CZUJKA CISZY. Zamknięcie strumienia nie zawsze dociera do klienta —
 * polaczenie potrafi zostac "otwarte" mimo tego, ze po drugiej stronie nikogo
 * nie ma (poworny posrednik, uspiony laptop, zabity proces serwera). Dlatego
 * nie polegamy na tym, ze odczyt zglosi koniec: jesli od dluzszego czasu nie
 * przyszla ZADNA wiadomosc, w tym keepalive, sami zrywamy polaczenie i
 * ponawiamy. Bez tego interfejs pokazywalby "na zywo" nad martwymi danymi.
 *
 * Wlasna implementacja zamiast EventSource, bo EventSource nie pozwala ani
 * rozpoznac ciszy, ani odroznic "przegladarka nie ma lacznosci z serwerem"
 * od "serwer nie ma lacznosci z Miniserverem". To dwie zupelnie inne awarie
 * i uzytkownik musi je widziec osobno.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Health,
  MaterialsResponse,
  PointValues,
  PublicPoint,
  Session,
} from '@magazyn-pcm/shared';
import { WymaganeLogowanie, fetchMaterials, fetchPoints, fetchSnapshot } from './api.js';

/** Stan lacznosci PRZEGLADARKA -> SERWER (nie serwer -> Miniserver). */
export type LinkState = 'connecting' | 'live' | 'reconnecting' | 'error' | 'unauthorized';

export interface LiveData {
  points: PublicPoint[];
  values: PointValues;
  health: Health | null;
  session: Session | null;
  /** Konfiguracja materiałów i zbiorników; null dopóki nie wczytana. */
  materials: MaterialsResponse | null;
  link: LinkState;
  /** Kiedy ostatnio przyszla jakakolwiek wiadomosc z serwera. */
  lastMessageAt: Date | null;
  error: string | null;
  reload: () => void;
}

const MAX_BACKOFF_MS = 15_000;

/**
 * Po tym czasie ciszy uznajemy polaczenie za martwe. Serwer wysyla keepalive
 * co 10 s, wiec 26 s to trzy przegapione sygnaly — dosc, zeby nie reagowac
 * na chwilowe zadyszki, i za malo, zeby ktos uwierzyl martwym danym.
 */
const SILENCE_LIMIT_MS = 26_000;
const WATCHDOG_TICK_MS = 2000;

export function useLiveData(): LiveData {
  const [points, setPoints] = useState<PublicPoint[]>([]);
  const [values, setValues] = useState<PointValues>({});
  const [health, setHealth] = useState<Health | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [materials, setMaterials] = useState<MaterialsResponse | null>(null);
  const [link, setLink] = useState<LinkState>('connecting');
  const [lastMessageAt, setLastMessageAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // Zywotnosc efektu — chroni przed zapisem stanu po odmontowaniu.
  const aliveRef = useRef(true);
  // Ostatnia wiadomosc w refie, bo czujka czyta ja z wnetrza timera.
  const lastMessageRef = useRef<number>(0);
  // Kontroler BIEZACEJ proby — czujka zrywa tylko ja, nie caly cykl.
  const attemptControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    let retryTimer: number | undefined;
    let attempt = 0;

    const markMessage = (): void => {
      lastMessageRef.current = Date.now();
      if (aliveRef.current) setLastMessageAt(new Date());
    };

    /** Pelny stan — na starcie i po kazdym odzyskaniu polaczenia. */
    const loadSnapshot = async (signal: AbortSignal): Promise<void> => {
      // Konfiguracja materialow zmienia sie tylko przy restarcie serwera,
      // wiec pobieramy ja razem ze snapshotem — jeden przelot, bez osobnego stanu.
      const [pointList, snapshot, materialsResponse] = await Promise.all([
        fetchPoints(),
        fetchSnapshot(),
        fetchMaterials(),
      ]);
      if (!aliveRef.current || signal.aborted) return;

      setMaterials(materialsResponse);
      setPoints(pointList);
      setValues(snapshot.values);
      setHealth(snapshot.health);
      setSession(snapshot.session);
      setError(null);
      markMessage();
    };

    const handleFrame = (frame: string): void => {
      const lines = frame.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event: '));
      const dataLine = lines.find((line) => line.startsWith('data: '));

      // Komentarze (keepalive) nie maja zdarzenia — nic nie znacza dla stanu,
      // ale sa dowodem, ze kanal zyje. To one karmia czujke ciszy.
      if (!eventLine || !dataLine) {
        markMessage();
        return;
      }

      const event = eventLine.slice('event: '.length).trim();
      let data: unknown;
      try {
        data = JSON.parse(dataLine.slice('data: '.length));
      } catch {
        return;
      }

      if (!aliveRef.current) return;
      markMessage();

      if (event === 'values') {
        const payload = data as { values: PointValues };
        // SCALANIE: serwer przysyla tylko zmienione punkty.
        setValues((previous) => ({ ...previous, ...payload.values }));
      } else if (event === 'health') {
        setHealth(data as Health);
      }
    };

    const consumeStream = async (signal: AbortSignal): Promise<void> => {
      const response = await fetch('/api/stream', {
        headers: { Accept: 'text/event-stream' },
        signal,
      });

      if (response.status === 401) throw new WymaganeLogowanie();

      if (!response.ok || !response.body) {
        throw new Error(`Strumień odrzucony (HTTP ${response.status})`);
      }

      if (!aliveRef.current) return;
      setLink('live');
      setError(null);
      attempt = 0;
      markMessage();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Ramki SSE rozdziela pusta linia.
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          handleFrame(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');
        }
      }

      throw new Error('Serwer zamknął strumień');
    };

    const run = async (): Promise<void> => {
      for (;;) {
        if (!aliveRef.current) return;

        const controller = new AbortController();
        attemptControllerRef.current = controller;

        try {
          await loadSnapshot(controller.signal);
          await consumeStream(controller.signal);
        } catch (caught) {
          if (!aliveRef.current) return;

          // Wygasla sesja: nie ma sensu ponawiac w petli — trzeba sie zalogowac.
          // Wyjscie z petli oddaje decyzje warstwie wyzej (ekran logowania).
          if (caught instanceof WymaganeLogowanie) {
            setLink('unauthorized');
            setError(null);
            return;
          }

          attempt += 1;
          const aborted = controller.signal.aborted;
          const message = aborted
            ? 'Serwer przestał odpowiadać (cisza w strumieniu) — ponawiam połączenie.'
            : caught instanceof Error
              ? caught.message
              : String(caught);

          setError(message);
          setLink(attempt > 3 ? 'error' : 'reconnecting');

          const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
          await new Promise<void>((resolve) => {
            retryTimer = window.setTimeout(resolve, delay);
          });
        }
      }
    };

    // Czujka ciszy: zrywa martwe polaczenie, zeby cykl ponowien mogl zadzialac.
    const watchdog = window.setInterval(() => {
      if (!aliveRef.current) return;
      const silentFor = Date.now() - lastMessageRef.current;
      if (lastMessageRef.current > 0 && silentFor > SILENCE_LIMIT_MS) {
        lastMessageRef.current = 0;
        attemptControllerRef.current?.abort();
      }
    }, WATCHDOG_TICK_MS);

    void run();

    return () => {
      aliveRef.current = false;
      window.clearInterval(watchdog);
      attemptControllerRef.current?.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [reloadToken]);

  return { points, values, health, session, materials, link, lastMessageAt, error, reload };
}
