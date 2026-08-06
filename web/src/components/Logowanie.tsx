/**
 * EKRAN STARTOWY — pierwsze, co widzi człowiek po wejściu na adres.
 *
 * DWA ADRESY, DWIE ROLE — rozstrzyga o nich nazwa hosta, nie osobny build:
 *
 *   entalvia.eu      strona o produkcie. Bez pola hasła; w prawym górnym
 *                    narożniku przycisk „Aplikacja", który prowadzi na drugi
 *                    adres. Ktoś, kto trafia tu z wizytówki albo z prezentacji,
 *                    ma najpierw zrozumieć, czym to jest.
 *   app.entalvia.eu  sama brama. Wpisanie tego adresu ma dawać pole hasła
 *                    i nic więcej — kto tu wchodzi, wie już, po co przyszedł.
 *
 * Każdy inny host (localhost, adres Railway) zachowuje się jak aplikacja, bo
 * do tego służy w pracy. Podgląd strony o produkcie z takiego adresu:
 * dopisz `?produkt` do adresu — potrzebne, dopóki domeny nie są przepięte.
 *
 * Pokazuje się wtedy, gdy serwer zgłasza włączoną bramę (AUTH_ENABLED=true).
 * W sieci laboratorium brama bywa wyłączona i wtedy tego ekranu nie ma wcale —
 * dane i tak są dostępne tylko z LAN, a dodatkowy klik przed pracą przy
 * stanowisku byłby przeszkodą bez zysku.
 *
 * CZEGO TU NIE MA I DLACZEGO. Żadnej liczby z instalacji. Ekran stoi PRZED
 * logowaniem, więc nie ma prawa do danych — a liczba postawiona na takim
 * ekranie musiałaby być albo wymyślona, albo nieaktualna.
 *
 * 2026-08-04 zdjęte: pasek faktów (12 sond / 5 s / 2 materiały), nadpis
 * „21 zmysłów LAB · Politechnika Śląska", uwaga o dwudziestu punktach
 * pokazowych oraz logotyp klienta na stronie o produkcie. Zostaje hasło
 * i jeden akapit — ekran wejściowy ma powiedzieć, czym to jest, a nie
 * wyliczyć wszystko, co wiadomo.
 */

import { useEffect, useState } from 'react';
import { login } from '../api.js';
import { WERSJA } from '../wersja.js';

/** Ścieżka do pliku w katalogu publicznym — ta sama zasada co w App.tsx. */
function plik(nazwa: string): string {
  return `${import.meta.env.BASE_URL}${nazwa}`;
}

/**
 * KARUZELA NOŚNIKA W HAŚLE — „Ciepło" zamienia się na „Chłód" i z powrotem.
 *
 * Magazyn na materiale zmiennofazowym gromadzi jedno albo drugie i to jest
 * najkrótszy sposób, żeby to powiedzieć: samo słowo się przestawia, zdanie
 * zostaje. Barwy idą z TOKENÓW INTERFEJSU (`--cieplo` / `--chlod`), tych
 * samych, którymi malowany jest cały widok po wejściu w magazyn — więc to
 * nie jest ozdoba, tylko ten sam kod barwny co dalej.
 *
 * Oba słowa są w mianowniku i pasują do „da się odłożyć na później" bez
 * zmiany reszty zdania — dlatego karuzela jest w ogóle możliwa.
 */
const NOSNIKI: { slowo: string; barwa: string }[] = [
  { slowo: 'Ciepło', barwa: 'var(--cieplo)' },
  { slowo: 'Chłód', barwa: 'var(--chlod)' },
];

/** Co tyle słowo się przestawia. Dość długo, żeby dało się przeczytać zdanie. */
const KARUZELA_MS = 4200;

/** Adres, pod którym stoi sama aplikacja. */
const ADRES_APLIKACJI = 'https://app.entalvia.eu';

/** Host strony o produkcie — bez `www`, które prowadzi tam samo. */
const HOSTY_PRODUKTU = ['entalvia.eu', 'www.entalvia.eu'];

/**
 * Co ma pokazać ten ekran: stronę o produkcie czy samą bramę.
 *
 * Decyduje HOST, nie osobny plik konfiguracyjny — jedna aplikacja stoi pod
 * dwoma adresami i to jest cała różnica między nimi. `?produkt` wymusza
 * stronę o produkcie z dowolnego adresu; przydaje się do podglądu, dopóki
 * domeny nie są przepięte.
 */
function rolaAdresu(): 'produkt' | 'aplikacja' {
  if (new URLSearchParams(window.location.search).has('produkt')) return 'produkt';
  return HOSTY_PRODUKTU.includes(window.location.hostname.toLowerCase())
    ? 'produkt'
    : 'aplikacja';
}

export function Logowanie({ onSuccess }: { onSuccess: () => void }) {
  // Rola adresu czytana RAZ: zmiana hosta bez przeładowania strony nie istnieje.
  const [rola] = useState(rolaAdresu);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Który nośnik stoi teraz w haśle. Zawsze zaczynamy od ciepła. */
  const [nosnik, setNosnik] = useState(0);

  /*
   * Karuzela stoi przy wyłączonych animacjach w systemie — i to nie tylko
   * ze względu na `prefers-reduced-motion`. Tekst, który sam się przestawia
   * bez możliwości zatrzymania, jest osobnym problemem dostępności; kto
   * poprosił o mniej ruchu, dostaje po prostu nieruchome „Ciepło".
   */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(
      () => setNosnik((i) => (i + 1) % NOSNIKI.length),
      KARUZELA_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (password === '' || busy) return;

    setBusy(true);
    setError(null);
    try {
      await login(password);
      setPassword('');
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`start start--${rola}`}>
      {/* GÓRNA BELKA — tylko na stronie o produkcie. Prowadzi jedno
          klikniecie dalej: na adres, pod ktorym stoi sama aplikacja. */}
      {rola === 'produkt' ? (
        <header className="start__belka">
          <img className="start__logo" src={plik('entalvia.png')} alt="Entalvia™" />
          <a className="start__wejscie" href={ADRES_APLIKACJI}>
            Aplikacja
          </a>
        </header>
      ) : null}
      {/* Poświata w tle NIE jest tu rysowana — siedzi na `body::after` i idzie
          przez całą aplikację, więc wejście i wnętrze są jednym miejscem,
          a nie dwiema stronami. */}
      <div className="start__tresc">
        <section className="start__opis">
          {rola === 'aplikacja' ? (
            <img className="start__logo" src={plik('entalvia.png')} alt="Entalvia™" />
          ) : null}
          <h1 className="start__haslo">
            {/* Wszystkie słowa leżą w JEDNEJ komórce siatki, więc komórka ma
                szerokość najszerszego z nich i „da się" nie przeskakuje w boki
                przy zmianie. Dlatego siatka, a nie pozycjonowanie absolutne:
                to ona liczy tę szerokość sama. */}
            <span className="start__karuzela">
              {NOSNIKI.map((n, i) => (
                <span
                  key={n.slowo}
                  className={`start__nosnik${i === nosnik ? ' is-teraz' : ''}`}
                  style={{ color: n.barwa }}
                  /* Czytnik ekranu ma przeczytać JEDNO zdanie, nie oba słowa
                     naraz — więc niewidoczne słowo jest dla niego ukryte. */
                  aria-hidden={i !== nosnik}
                >
                  {n.slowo}
                </span>
              ))}
            </span>{' '}
            da się
            <br />
            odłożyć na później.
          </h1>

          <p className="start__akapit">
            Magazyn na materiale zmiennofazowym gromadzi ciepło albo chłód w przemianie fazowej
            parafiny, a nie we wzroście temperatury. Ta aplikacja pokazuje, co dzieje się w środku
            takiego zbiornika — sonda po sondzie, co pięć sekund, na stanowisku badawczym
            w Gliwicach.
          </p>
        </section>

        {rola === 'aplikacja' ? (
        <section className="start__brama">
          <form className="start__karta" onSubmit={(event) => void submit(event)}>
            <h2 className="start__karta-tytul">Wejście do aplikacji</h2>

            <label className="field">
              <span>hasło dostępu</span>
              <input
                type="password"
                value={password}
                autoFocus
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {error ? <p className="gate__error">{error}</p> : null}

            <button type="submit" className="button-primary" disabled={busy || password === ''}>
              {busy ? 'Sprawdzam…' : 'Wejdź'}
            </button>

            <p className="gate__note">
              Zbieranie danych działa niezależnie od tego ekranu — serwer odpytuje Miniserver
              i zapisuje pomiary także wtedy, gdy nikt nie jest zalogowany.
            </p>
          </form>

          {/* LOGOTYP KLIENTA ZDJĘTY TAKŻE Z BRAMY 2026-08-06 na prośbę —
              intro mówi o produkcie, marka klienta zostaje w aplikacji
              (topbar), gdzie opisuje stanowisko, a nie wejście. */}
          <footer className="start__stopka">
            <span className="start__wersja mono">{WERSJA}</span>
          </footer>
        </section>
        ) : (
          /* Strona o produkcie zamyka się samym numerem wersji.
             LOGOTYP KLIENTA ZDJĘTY 2026-08-04 — entalvia.eu jest stroną
             o produkcie i nie ma na niej mówić o niczyjej marce. W bramie
             (app.entalvia.eu, wyżej) zostaje: tam wchodzą ludzie, którzy
             wiedzą, czyje to stanowisko. */
          <footer className="start__stopka start__stopka--produkt">
            <span className="start__wersja mono">{WERSJA}</span>
          </footer>
        )}
      </div>
    </div>
  );
}
