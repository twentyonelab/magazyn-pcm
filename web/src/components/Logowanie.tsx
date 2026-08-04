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
 * ekranie musiałaby być albo wymyślona, albo nieaktualna. Fakty niżej mówią
 * o KONSTRUKCJI stanowiska (ile sond, co ile sekund), nie o jego stanie.
 */

import { useState } from 'react';
import { login } from '../api.js';
import { useAppliedTheme } from '../theme.js';
import { WERSJA } from '../wersja.js';

/** Ścieżka do pliku w katalogu publicznym — ta sama zasada co w App.tsx. */
function plik(nazwa: string): string {
  return `${import.meta.env.BASE_URL}${nazwa}`;
}

/**
 * Fakty o stanowisku. Każdy da się sprawdzić w kodzie albo w dokumentacji —
 * nic tu nie jest zaokrąglone „na okładkę".
 */
const FAKTY: { liczba: string; opis: string }[] = [
  { liczba: '12', opis: 'sond temperatury w dwóch wymiennych zbiornikach' },
  { liczba: '5 s', opis: 'co tyle serwer odpytuje sterownik i zapisuje pomiar' },
  { liczba: '2', opis: 'materiały zmiennofazowe: parafina ciepła i chłodu' },
];

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
  // Oba logotypy mają wersje na jasne i ciemne tło — patrz App.tsx.
  const ciemny = useAppliedTheme() === 'dark';
  // Rola adresu czytana RAZ: zmiana hosta bez przeładowania strony nie istnieje.
  const [rola] = useState(rolaAdresu);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <p className="start__nadpis">21 zmysłów LAB · Politechnika Śląska</p>

          <h1 className="start__haslo">
            Ciepło da się
            <br />
            odłożyć na później.
          </h1>

          <p className="start__akapit">
            Magazyn na materiale zmiennofazowym gromadzi ciepło albo chłód w przemianie fazowej
            parafiny, a nie we wzroście temperatury. Ta aplikacja pokazuje, co dzieje się w środku
            takiego zbiornika — sonda po sondzie, co pięć sekund, na stanowisku badawczym
            w Gliwicach.
          </p>

          <dl className="start__fakty">
            {FAKTY.map((f) => (
              <div className="start__fakt" key={f.opis}>
                <dt className="mono">{f.liczba}</dt>
                <dd>{f.opis}</dd>
              </div>
            ))}
          </dl>

          <p className="start__uwaga">
            Poza stanowiskiem w Gliwicach mapa pokazuje dwadzieścia punktów{' '}
            <strong>pokazowych</strong> — wymyślonych, po to, żeby było widać, jak wygląda sieć
            takich magazynów. Nie stoi za nimi żadna instalacja i aplikacja mówi to przy każdym
            z nich.
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

          <footer className="start__stopka">
            <img
              className="start__logo-klienta"
              src={plik(ciemny ? 'tauron-cieplo-ciemny.png' : 'tauron-cieplo.png')}
              alt="Tauron Ciepło"
            />
            <span className="start__wersja mono">{WERSJA}</span>
          </footer>
        </section>
        ) : (
          /* Strona o produkcie zamyka się stopką z logotypem klienta —
             bez pola hasła, bo do bramy prowadzi przycisk w górnej belce. */
          <footer className="start__stopka start__stopka--produkt">
            <img
              className="start__logo-klienta"
              src={plik(ciemny ? 'tauron-cieplo-ciemny.png' : 'tauron-cieplo.png')}
              alt="Tauron Ciepło"
            />
            <span className="start__wersja mono">{WERSJA}</span>
          </footer>
        )}
      </div>
    </div>
  );
}
