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
/*
 * 5900 ms zamiast 4200 (2026-08-11, na prośbę: wolniej o 40%). Przy krótszym
 * takcie zdanie ledwo dawało się przeczytać, a odkąd pod hasłem stoją
 * wizualizacje, zmiana pociąga za sobą także przenikanie dwóch par obrazów —
 * całość potrzebuje więcej powietrza.
 */
const KARUZELA_MS = 5900;

/** Adres, pod którym stoi sama aplikacja. */
const ADRES_APLIKACJI = 'https://app.entalvia.eu';

/**
 * Symulator doboru — statyczna strona obok aplikacji, nie osobny serwis.
 * Leży w `web/public/`, więc adres jest względny i działa pod każdą domeną.
 */
const ADRES_SYMULATORA = '/symulator.html';

/**
 * WIZUALIZACJE PRZY HAŚLE — po jednej parze na nośnik.
 *
 * Lewa strona to sam magazyn, prawa to aplikacja na laptopie. Para zmienia
 * się razem ze słowem w haśle, więc „Chłód" pokazuje moduł w błękicie
 * i aplikację w barwach chłodu, a „Ciepło" — pomarańcz po obu stronach.
 * Dzięki temu zdanie, barwa i obraz mówią jedno, zamiast trzech rzeczy naraz.
 */
const WIZUALIZACJE: Record<string, { magazyn: string; aplikacja: string; opisM: string; opisA: string }> = {
  'Ciepło': {
    magazyn: 'magazyn-cieplo.webp',
    aplikacja: 'aplikacja-cieplo.webp',
    opisM: 'Moduł magazynu ciepła Entalvia',
    opisA: 'Aplikacja monitorująca — widok magazynu ciepła',
  },
  'Chłód': {
    magazyn: 'magazyn-chlod.webp',
    aplikacja: 'aplikacja-chlod.webp',
    opisM: 'Moduł magazynu chłodu Entalvia',
    opisA: 'Aplikacja monitorująca — widok magazynu chłodu',
  },
};

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
  const parametry = new URLSearchParams(window.location.search);
  /* `?wejscie` ma pierwszeństwo przed hostem: serwer dopisuje go, kierując
     tu kogoś, kto sięgnął po zasób za bramą (symulator). Na entalvia.eu
     trzeba wtedy pokazać pole hasła, a nie stronę o produkcie. */
  if (parametry.has('wejscie')) return 'aplikacja';
  if (parametry.has('produkt')) return 'produkt';
  return HOSTY_PRODUKTU.includes(window.location.hostname.toLowerCase())
    ? 'produkt'
    : 'aplikacja';
}

/** Dokąd wrócić po zalogowaniu — adres zapamiętany przez serwer przy bramie. */
function adresPowrotu(): string | null {
  const cel = new URLSearchParams(window.location.search).get('powrot');
  /* Tylko ścieżki względne. Adres z zewnątrz otwarty po zalogowaniu byłby
     otwartym przekierowaniem — cudzą stroną pod naszym adresem wejścia. */
  return cel !== null && cel.startsWith('/') && !cel.startsWith('//') ? cel : null;
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

  /*
   * POŚWIATA W TLE IDZIE ZA NOŚNIKIEM.
   *
   * Blask rysuje `body::after` — czyli element POZA drzewem tego komponentu,
   * więc nie da się go pomalować atrybutem na własnym korzeniu. Stąd zapis
   * wprost na `<html>`: arkusz czyta `[data-nosnik]` i podmienia barwy blasku.
   * Sprzątamy po sobie przy odmontowaniu, żeby wejście do monitoringu nie
   * zostawiło strony o produkcie pomalowanej na chłód.
   */
  useEffect(() => {
    if (rola !== 'produkt') return;
    const slowo = NOSNIKI[nosnik]?.slowo;
    const korzen = document.documentElement;
    korzen.dataset.nosnik = slowo === 'Chłód' ? 'chlod' : 'cieplo';
    return () => {
      delete korzen.dataset.nosnik;
    };
  }, [nosnik, rola]);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (password === '' || busy) return;

    setBusy(true);
    setError(null);
    try {
      await login(password);
      setPassword('');
      /* Przyszedł po symulator — odsyłamy go tam, zamiast wpuszczać
         do monitoringu, po który nie sięgał. */
      const powrot = adresPowrotu();
      if (powrot !== null) {
        window.location.replace(powrot);
        return;
      }
      /*
       * MONITORING MIESZKA POD app.entalvia.eu I MA TAM ZOSTAĆ.
       *
       * Logowanie z entalvia.eu (przez `?wejscie`) wpuszczało dotąd do
       * aplikacji BEZ zmiany adresu — monitoring wyświetlał się pod domeną
       * strony o produkcie. Oba adresy prowadzą do tego samego serwisu, więc
       * działało, ale mówiło nieprawdę o tym, gdzie się jest, i psuło zakładki.
       * Ciasteczko obowiązuje na obu, więc przeniesienie nie każe logować się
       * drugi raz.
       */
      if (HOSTY_PRODUKTU.includes(window.location.hostname.toLowerCase())) {
        window.location.replace(ADRES_APLIKACJI);
        return;
      }
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
          {/* Logotyp wraca na ekran główny — to tu jest wybór między
              monitoringiem a symulatorem, więc znak firmowy prowadzi
              do punktu wyjścia, a nie donikąd. */}
          <a className="start__logo-link" href="/" aria-label="Entalvia — ekran główny">
            <img className="start__logo" src={plik('entalvia.png')} alt="Entalvia™" />
          </a>
          {/* DWA WEJŚCIA, DWA RÓŻNE NARZĘDZIA. „Monitoring pomiarów" prowadzi
              do aplikacji przy stanowisku — pokazuje, co JEST. „Symulator
              doboru" liczy, co BYŁOBY przy zadanych parametrach. Nazwy mówią
              o tej różnicy wprost; poprzednia „Aplikacja" nie mówiła o niczym. */}
          <nav className="start__wejscia">
            <a className="start__wejscie" href={ADRES_APLIKACJI}>
              Monitoring pomiarów
            </a>
            <span className="start__rozdzielacz" aria-hidden="true" />
            <a className="start__wejscie" href={ADRES_SYMULATORA}>
              Symulator doboru
            </a>
          </nav>
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

        {/* WIZUALIZACJE — tylko na stronie o produkcie. Para obrazów idzie za
            słowem w haśle: po lewej sam magazyn, po prawej aplikacja na
            laptopie. Obie warstwy leżą na sobie i przełączają się kryciem,
            więc wysokość sekcji nie skacze przy zmianie nośnika. */}
        {rola === 'produkt' ? (
          <section className="start__wizualizacje" aria-hidden="true">
            {(['magazyn', 'aplikacja'] as const).map((strona) => (
              <div key={strona} className={`wiz wiz--${strona}`}>
                {NOSNIKI.map((n, i) => {
                  const w = WIZUALIZACJE[n.slowo];
                  if (!w) return null;
                  return (
                    <img
                      key={n.slowo}
                      className={`wiz__obraz${i === nosnik ? ' is-teraz' : ''}`}
                      src={plik(strona === 'magazyn' ? w.magazyn : w.aplikacja)}
                      alt={strona === 'magazyn' ? w.opisM : w.opisA}
                      /* NIE `lazy`: to treść nad linią zgięcia, pierwsza rzecz
                         po haśle. Leniwe ładowanie odsuwało ją za resztę strony,
                         a przy przenikaniu warstw dawało pustą ramkę w chwili
                         zmiany nośnika — obraz zaczynał się pobierać dopiero
                         wtedy, gdy miał już być widoczny. */
                      loading="eager"
                      decoding="async"
                      /* Brak pliku ma zniknąć, a nie pokazać pękniętą ikonę:
                         rendery wgrywa się osobno od kodu i strona musi
                         wyglądać poprawnie także w chwili między jednym
                         a drugim wdrożeniem. */
                      onError={(event) => {
                        event.currentTarget.closest('.start__wizualizacje')?.remove();
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </section>
        ) : null}

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
