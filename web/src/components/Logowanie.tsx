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

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
/*
 * Każdy nośnik niesie DWIE barwy, bo słowo jest pisane gradientem — tym samym
 * przejściem, którym monitoring maluje pasek naładowania. `barwa` zostaje jako
 * kolor zapasowy dla przeglądarek bez `background-clip: text`.
 */
/*
 * NOŚNIKI SĄ JĘZYKOWO NIEZALEŻNE, SŁOWA NIE.
 *
 * Kolejność karuzeli, barwy gradientu i identyfikator sterujący poświatą w tle
 * nie mają nic wspólnego z językiem — leżą więc tutaj, raz. Same słowa idą ze
 * słownika niżej. Gdyby jedno stało przy drugim, dodanie angielskiego kazałoby
 * przepisać także barwy, a wtedy pierwsza poprawka odcienia rozjechałaby obie
 * wersje językowe.
 *
 * BEZ TWARDEGO ŁAMANIA WIERSZA w zdaniach. Podział liczy `text-wrap: balance`
 * w arkuszu — przy sztywnym `<br>` jeden wiersz wychodził wyraźnie krótszy od
 * drugiego („Ciepło da się" wobec „zachować na dłużej"), a balansowanie robi
 * to osobno dla każdego zdania, w każdym języku i przy każdej szerokości okna.
 */
const NOSNIKI = [
  { id: 'cieplo', barwa: 'var(--cieplo)', jasny: 'var(--cieplo-jasny)' },
  { id: 'chlod', barwa: 'var(--chlod)', jasny: 'var(--chlod-jasny)' },
] as const;

type IdNosnika = (typeof NOSNIKI)[number]['id'];

/** Języki strony o produkcie. Kolejność jest kolejnością na liście wyboru. */
export type Jezyk = 'pl' | 'en';

const JEZYKI: { kod: Jezyk; nazwa: string }[] = [
  { kod: 'pl', nazwa: 'Polski' },
  { kod: 'en', nazwa: 'English' },
];

/** Wybór języka zapamiętany między wizytami — ten sam wzór co `motyw`. */
const KLUCZ_JEZYKA = 'entalvia:jezyk';

interface SlowaNosnika {
  /** Słowo pisane gradientem — pierwsze w zdaniu, w mianowniku. */
  slowo: string;
  /** Reszta zdania. Musi pasować do OBU słów bez zmiany szyku. */
  reszta: ReactNode;
  /** Opisy obrazów — dla czytnika ekranu i na wypadek, gdy render się nie wczyta. */
  opisM: string;
  opisA: string;
}

interface Tresc {
  nosniki: Record<IdNosnika, SlowaNosnika>;
  akapitMocny: string;
  akapit: string;
  monitoring: string;
  symulator: string;
  logoOpis: string;
  wyborJezyka: string;
}

/**
 * SŁOWNIK — jedyne miejsce z tekstem strony o produkcie.
 *
 * Tłumaczone jest to, co widzi ktoś z zewnątrz: hasło, propozycja wartości,
 * nazwy dwóch wejść i opisy obrazów. Brama pod `app.entalvia.eu` zostaje po
 * polsku świadomie — wchodzą przez nią ludzie od stanowiska, nie odwiedzający.
 *
 * ANGIELSKIE HASŁA MAJĄ TĘ SAMĄ BUDOWĘ CO POLSKIE: nośnik w mianowniku na
 * początku, reszta zdania niezależna od tego, które słowo stoi z przodu. Bez
 * tego karuzela nie miałaby czego przestawiać — musiałaby wymieniać całe
 * zdania, a wtedy widać by było zmianę układu, nie zmianę słowa.
 */
const TRESCI: Record<Jezyk, Tresc> = {
  pl: {
    nosniki: {
      cieplo: {
        slowo: 'Ciepło',
        reszta: 'można zachować na dłużej.',
        opisM: 'Moduł magazynu ciepła Entalvia',
        opisA: 'Aplikacja monitorująca — widok magazynu ciepła',
      },
      chlod: {
        slowo: 'Chłód',
        reszta: 'da się odłożyć na później.',
        opisM: 'Moduł magazynu chłodu Entalvia',
        opisA: 'Aplikacja monitorująca — widok magazynu chłodu',
      },
    },
    akapitMocny: 'Entalvia to magazyny ciepła i chłodu złożone z baterii termicznych.',
    akapit:
      'Baterie kumulują energię w przemianie fazowej. Ten sam zapas ciepła albo chłodu ' +
      'mieści się w kilkukrotnie mniejszej objętości i utrzymuje stałą temperaturę ' +
      'roboczą, zamiast tracić parametr od pierwszej minuty. Ładujesz wtedy, gdy energia ' +
      'jest tania albo pochodzi z własnego źródła, oddajesz wtedy, gdy jest potrzebna.',
    monitoring: 'Monitoring pomiarów',
    symulator: 'Symulator doboru',
    logoOpis: 'Entalvia — ekran główny',
    wyborJezyka: 'Wybór języka',
  },
  en: {
    nosniki: {
      cieplo: {
        slowo: 'Heat',
        reszta: 'can be kept for longer.',
        opisM: 'Entalvia heat storage module',
        opisA: 'Monitoring app — heat storage view',
      },
      chlod: {
        slowo: 'Cold',
        reszta: 'can be saved for later.',
        opisM: 'Entalvia cold storage module',
        opisA: 'Monitoring app — cold storage view',
      },
    },
    akapitMocny: 'Entalvia is heat and cold storage built from thermal batteries.',
    akapit:
      'The batteries hold energy in a phase change. The same reserve of heat or cold fits ' +
      'into a several times smaller volume and keeps a steady working temperature, instead ' +
      'of drifting away from it from the first minute. You charge when energy is cheap or ' +
      'comes from your own source, and draw on it when it is needed.',
    monitoring: 'Measurement monitoring',
    symulator: 'Sizing simulator',
    logoOpis: 'Entalvia — home',
    wyborJezyka: 'Language',
  },
};

/**
 * Język przy wejściu: wybór człowieka, potem adres, na końcu ustawienie przeglądarki.
 *
 * `?lang=en` w adresie jest po to, żeby dało się WYSŁAĆ angielską wersję
 * linkiem — bez tego odbiorca dostaje to, co akurat mówi jego przeglądarka,
 * a nadawca nie ma nad tym żadnej kontroli.
 *
 * Domyślnie polski dostaje polska przeglądarka, a każda inna — angielski.
 * Odwrotnie byłoby uprzejmie tylko wobec jednej strony: ktoś z zewnątrz
 * zobaczyłby stronę, której nie umie przeczytać, i nie miałby powodu szukać
 * przełącznika, bo nie wiedziałby, czego szuka.
 */
function jezykPoczatkowy(): Jezyk {
  const zAdresu = new URLSearchParams(window.location.search).get('lang');
  if (zAdresu === 'pl' || zAdresu === 'en') return zAdresu;

  try {
    const zapisany = window.localStorage.getItem(KLUCZ_JEZYKA);
    if (zapisany === 'pl' || zapisany === 'en') return zapisany;
  } catch {
    /* Okno prywatne albo zablokowane dane witryny — wybór nie przetrwa do
       następnej wizyty. To nie jest powód, żeby nie pokazać strony. */
  }

  return navigator.language?.toLowerCase().startsWith('pl') === true ? 'pl' : 'en';
}

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

/*
 * RENDERY IDĄ PRZEZ VITE, NIE PRZEZ `public/`.
 *
 * W `public/` leżały pod stałą nazwą, więc podmiana pliku nie docierała do
 * nikogo, kto raz otworzył stronę: przeglądarka i Cloudflare trzymały starą
 * wersję (zgłoszone 2026-08-11 — po zmianie proporcji dalej było widać
 * poprzednie kadry). Import daje im skrót treści w nazwie, więc każda zmiana
 * pliku to nowy adres, a stary nigdy nie zostaje podany omyłkowo.
 */
import magazynCieplo from '../obrazy/magazyn-cieplo.webp';
import magazynChlod from '../obrazy/magazyn-chlod.webp';
import aplikacjaCieplo from '../obrazy/aplikacja-cieplo.webp';
import aplikacjaChlod from '../obrazy/aplikacja-chlod.webp';

/**
 * WIZUALIZACJE PRZY HAŚLE — po jednej parze na nośnik.
 *
 * Lewa strona to sam magazyn, prawa to aplikacja na laptopie. Para zmienia
 * się razem ze słowem w haśle, więc „Chłód" pokazuje moduł w błękicie
 * i aplikację w barwach chłodu, a „Ciepło" — pomarańcz po obu stronach.
 * Dzięki temu zdanie, barwa i obraz mówią jedno, zamiast trzech rzeczy naraz.
 */
/*
 * KLUCZEM JEST IDENTYFIKATOR NOŚNIKA, NIE SŁOWO Z HASŁA.
 *
 * Do 2026-09-15 obrazy leżały pod kluczami „Ciepło" i „Chłód", czyli pod
 * polskim tekstem interfejsu. Działało dopóty, dopóki język był jeden —
 * po angielsku „Heat" nie trafiłby do żadnego wpisu i obie kolumny zostałyby
 * puste. Opisy alternatywne wyprowadziły się stąd do słownika, bo to zdania
 * do przeczytania, a nie właściwości pliku.
 */
const WIZUALIZACJE: Record<IdNosnika, { magazyn: string; aplikacja: string }> = {
  cieplo: { magazyn: magazynCieplo, aplikacja: aplikacjaCieplo },
  chlod: { magazyn: magazynChlod, aplikacja: aplikacjaChlod },
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
/**
 * Czy pod tym adresem ma stać STRONA O PRODUKCIE — niezależnie od sesji.
 *
 * TO JEST WŁAŚCIWE ROZSTRZYGNIĘCIE I DECYDUJE O NIM HOST, NIE STAN LOGOWANIA.
 * Do 2026-08-11 stronę produktu rysowaliśmy tylko wtedy, gdy serwer odmawiał
 * dostępu (`link === 'unauthorized'`). Skutek: po zalogowaniu entalvia.eu
 * pokazywała monitoring, więc klik w logotyp „wracał" do aplikacji, z której
 * użytkownik właśnie chciał wyjść. Adres ma znaczyć zawsze to samo:
 *
 *   entalvia.eu       strona o produkcie, z wyborem narzędzia
 *   app.entalvia.eu   monitoring (albo brama, gdy nie ma sesji)
 *
 * `?wejscie` jest jedynym wyjątkiem — serwer dopisuje go, kierując tu kogoś,
 * kto sięgnął po zasób za hasłem, i wtedy potrzebne jest pole hasła.
 * `?produkt` wymusza tę stronę z dowolnego adresu (podgląd z localhost).
 */
export function powierzchniaProduktu(): boolean {
  const parametry = new URLSearchParams(window.location.search);
  if (parametry.has('wejscie')) return false;
  if (parametry.has('produkt')) return true;
  return HOSTY_PRODUKTU.includes(window.location.hostname.toLowerCase());
}

function rolaAdresu(): 'produkt' | 'aplikacja' {
  return powierzchniaProduktu() ? 'produkt' : 'aplikacja';
}

/** Dokąd wrócić po zalogowaniu — adres zapamiętany przez serwer przy bramie. */
function adresPowrotu(): string | null {
  const cel = new URLSearchParams(window.location.search).get('powrot');
  /* Tylko ścieżki względne. Adres z zewnątrz otwarty po zalogowaniu byłby
     otwartym przekierowaniem — cudzą stroną pod naszym adresem wejścia. */
  return cel !== null && cel.startsWith('/') && !cel.startsWith('//') ? cel : null;
}

/**
 * PRZEŁĄCZNIK JĘZYKA — w tej samej „fasolce", co dwa wejścia obok.
 *
 * Lista, nie przełącznik dwustanowy, choć języki są dziś dwa: kliknięcie ma
 * pokazać, CO się wybiera, zanim się to wybierze. Przy samym „PL ⇄ EN" trzeba
 * kliknąć, żeby zobaczyć drugą opcję — a to jest zły moment na zaskoczenie,
 * skoro ktoś właśnie nie rozumie strony, na której stoi.
 *
 * Kod języka stoi na przycisku, pełna nazwa dopiero na liście. „PL" wystarczy
 * do rozpoznania stanu, a nazwa własna („Polski", „English") mówi więcej niż
 * przetłumaczona — każdy znajdzie swój język, nie znając języka strony.
 */
function WyborJezyka({
  jezyk,
  naZmiane,
  etykieta,
}: {
  jezyk: Jezyk;
  naZmiane: (kod: Jezyk) => void;
  etykieta: string;
}) {
  const [otwarty, setOtwarty] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* Klik obok i Escape zamykają listę — bez tego zostaje otwarta, gdy człowiek
     rozmyślił się i sięgnął gdzie indziej. Nasłuch tylko wtedy, gdy jest co
     zamykać. */
  useEffect(() => {
    if (!otwarty) return;

    const poza = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOtwarty(false);
    };
    const klawisz = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOtwarty(false);
    };

    document.addEventListener('mousedown', poza);
    document.addEventListener('keydown', klawisz);
    return () => {
      document.removeEventListener('mousedown', poza);
      document.removeEventListener('keydown', klawisz);
    };
  }, [otwarty]);

  return (
    <div className="jezyk" ref={ref}>
      <button
        type="button"
        className="start__wejscie jezyk__przycisk"
        aria-haspopup="listbox"
        aria-expanded={otwarty}
        aria-label={etykieta}
        onClick={() => setOtwarty((o) => !o)}
      >
        <span>{jezyk.toUpperCase()}</span>
        {/* Strzałka rysowana, nie znak z czcionki: „▾" ma w różnych krojach
            różną wielkość i linię bazową, więc raz siedzi w osi napisu,
            a raz pod nią. */}
        <svg className="jezyk__strzalka" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>

      {otwarty ? (
        <ul className="jezyk__lista" role="listbox" aria-label={etykieta}>
          {JEZYKI.map((j) => (
            <li key={j.kod}>
              <button
                type="button"
                role="option"
                aria-selected={j.kod === jezyk}
                className={`jezyk__opcja${j.kod === jezyk ? ' is-teraz' : ''}`}
                onClick={() => {
                  naZmiane(j.kod);
                  setOtwarty(false);
                }}
              >
                <span className="jezyk__kod mono">{j.kod.toUpperCase()}</span>
                <span className="jezyk__nazwa">{j.nazwa}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Logowanie({ onSuccess }: { onSuccess: () => void }) {
  // Rola adresu czytana RAZ: zmiana hosta bez przeładowania strony nie istnieje.
  const [rola] = useState(rolaAdresu);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Który nośnik stoi teraz w haśle. Zawsze zaczynamy od ciepła. */
  const [nosnik, setNosnik] = useState(0);
  /** Język strony o produkcie. Brama zostaje po polsku niezależnie od niego. */
  const [jezyk, setJezyk] = useState<Jezyk>(jezykPoczatkowy);

  const tresc = TRESCI[jezyk];

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
    /* IDENTYFIKATOR, NIE SŁOWO Z HASŁA. Wcześniej stało tu porównanie
       z „Chłód" — po angielsku nie wypadłoby nigdy prawdziwie i poświata
       zostawałaby pomarańczowa przez całą karuzelę. */
    const korzen = document.documentElement;
    korzen.dataset.nosnik = NOSNIKI[nosnik]?.id ?? 'cieplo';
    return () => {
      delete korzen.dataset.nosnik;
    };
  }, [nosnik, rola]);

  /*
   * JĘZYK ZAPISANY W DOKUMENCIE, NIE TYLKO W STANIE KOMPONENTU.
   *
   * `<html lang>` jest tym, po czym czytnik ekranu dobiera wymowę, a wyszukiwarka
   * język strony. Bez tego angielska wersja byłaby czytana polską fonetyką —
   * zmiana widoczna wyłącznie dla tych, którzy potrzebują jej najbardziej.
   *
   * Przy odmontowaniu wracamy do poprzedniej wartości: wejście do monitoringu
   * ma zastać dokument taki, jaki był, bo sama aplikacja jest po polsku.
   */
  useEffect(() => {
    if (rola !== 'produkt') return;

    const korzen = document.documentElement;
    const poprzedni = korzen.lang;
    korzen.lang = jezyk;

    try {
      window.localStorage.setItem(KLUCZ_JEZYKA, jezyk);
    } catch {
      /* Zapis niemożliwy (okno prywatne) — strona działa, wybór po prostu
         nie przetrwa do następnej wizyty. */
    }

    return () => {
      korzen.lang = poprzedni;
    };
  }, [jezyk, rola]);

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
          {/* `?produkt` zostaje w adresie na localhost, gdzie osobnej domeny
              nie ma — bez tego klik w logotyp wypadałby ze strony produktu
              wprost do aplikacji. Na entalvia.eu parametru nie ma i cel jest
              po prostu korzeniem. */}
          <a
            className="start__logo-link"
            href={new URLSearchParams(window.location.search).has('produkt') ? '/?produkt' : '/'}
            aria-label={tresc.logoOpis}
          >
            <img className="start__logo" src={plik('entalvia.png')} alt="Entalvia™" />
          </a>
          {/* PRAWY NARÓŻNIK: dwa wejścia i wybór języka, w jednym rzędzie
              „fasolek". Język stoi NA KOŃCU, bo jest ustawieniem strony,
              a nie trzecim narzędziem — kolejność ma to mówić bez podpisu. */}
          <div className="start__prawa">
            {/* DWA WEJŚCIA, DWA RÓŻNE NARZĘDZIA. „Monitoring pomiarów" prowadzi
                do aplikacji przy stanowisku — pokazuje, co JEST. „Symulator
                doboru" liczy, co BYŁOBY przy zadanych parametrach. Nazwy mówią
                o tej różnicy wprost; poprzednia „Aplikacja" nie mówiła o niczym. */}
            <nav className="start__wejscia">
              <a className="start__wejscie" href={ADRES_APLIKACJI}>
                {tresc.monitoring}
              </a>
              <a className="start__wejscie" href={ADRES_SYMULATORA}>
                {tresc.symulator}
              </a>
            </nav>
            <WyborJezyka jezyk={jezyk} naZmiane={setJezyk} etykieta={tresc.wyborJezyka} />
          </div>
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
            {/* CAŁE ZDANIE ZMIENIA SIĘ Z NOŚNIKIEM, nie samo słowo: chłód
                „da się odłożyć na później", ciepło „możesz zachować na dłużej".
                Obie frazy leżą w JEDNEJ komórce siatki, więc komórka ma
                wysokość i szerokość dłuższej z nich, a nagłówek nie skacze
                przy zmianie. Dlatego siatka, a nie pozycjonowanie
                bezwzględne — to ona liczy te rozmiary sama. */}
            <span className="start__karuzela">
              {NOSNIKI.map((n, i) => (
                <span
                  key={n.id}
                  className={`start__fraza${i === nosnik ? ' is-teraz' : ''}`}
                  /* Czytnik ekranu ma przeczytać JEDNO zdanie, nie oba naraz. */
                  aria-hidden={i !== nosnik}
                >
                  <span
                    className="start__nosnik"
                  /* TYLKO ZMIENNE, BEZ `color`. Styl wpisany w element bije
                     każdą regułę arkusza, więc `color` postawiony tutaj
                     nadpisywał `color: transparent` potrzebny do przycięcia
                     gradientu do liter — napis wychodził jednolity, mimo że
                     gradient był poprawnie policzony pod spodem. Barwa zapasowa
                     stoi teraz w arkuszu, przed blokiem `@supports`. */
                  style={
                    {
                      '--nosnik-glowny': n.barwa,
                      '--nosnik-jasny': n.jasny,
                    } as React.CSSProperties
                  }
                  >
                    {tresc.nosniki[n.id].slowo}
                  </span>{' '}
                  {tresc.nosniki[n.id].reszta}
                </span>
              ))}
            </span>
          </h1>

          {/* PROPOZYCJA WARTOŚCI, NIE OPIS TECHNICZNY. Pierwszy akapit mówi,
              co ten produkt robi dla odbiorcy; drugi — że nie trzeba w to
              wierzyć na słowo, bo wszystko widać w aplikacji. Poprzednia
              wersja zaczynała od „materiału zmiennofazowego" i budowy złoża,
              czyli od rzeczy, która obchodzi inżyniera, a nie kupującego. */}
          <p className="start__akapit">
            <strong>{tresc.akapitMocny}</strong> {tresc.akapit}
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
                  const w = WIZUALIZACJE[n.id];
                  const opis = tresc.nosniki[n.id];
                  return (
                    <img
                      key={n.id}
                      className={`wiz__obraz${i === nosnik ? ' is-teraz' : ''}`}
                      /* Bez `plik()`: import z Vite daje gotowy adres
                         z wpisanym już `BASE_URL` i skrótem treści. */
                      src={strona === 'magazyn' ? w.magazyn : w.aplikacja}
                      alt={strona === 'magazyn' ? opis.opisM : opis.opisA}
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
