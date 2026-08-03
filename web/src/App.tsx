/**
 * Powłoka aplikacji: nagłówek z nawigacją, widok, dolny pasek stanu.
 *
 * Układ celowo trzyma stałe elementy przy krawędziach ekranu: nawigacja
 * i logo u góry, kluczowe parametry na dole. Środek należy do danych.
 */

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useLiveData } from './useLiveData.js';
import { Diagnostyka } from './views/Diagnostyka.js';
import { Magazyn } from './views/Magazyn.js';
import { Lista } from './views/Lista.js';
import { Przebiegi } from './views/Przebiegi.js';
import { Sesje } from './views/Sesje.js';
import { Bilans } from './views/Bilans.js';
import { Ustawienia } from './views/Ustawienia.js';
import { useSettings } from './settings.js';
import { useAppliedTheme } from './theme.js';
import { useWysokosciBelek } from './uklad.js';
import { WERSJA } from './wersja.js';
import { TRYB_POKAZOWY } from './demo/stale.js';
import { ustawAktywnyPunkt } from './demo/aktywnyPunkt.js';
import { useDanePunktu } from './demo/useDanePunktu.js';
import { type Lokalizacja } from './map/lokalizacje.js';
import type { Kierunek } from './soc.js';
import { BladWidoku } from './components/BladWidoku.js';
import { PlakietkaPokazowa } from './components/PlakietkaPokazowa.js';
import { Logowanie } from './components/Logowanie.js';
import { PasekStanu } from './components/PasekStanu.js';
import { PrzelacznikMotywu } from './components/PrzelacznikMotywu.js';

/**
 * Widok 3D wczytywany na żądanie.
 *
 * Three.js waży ponad pół megabajta — gdyby wchodził do wspólnej paczki,
 * płaciłby za niego każdy, kto otwiera tylko widok 2D albo Diagnostykę.
 */
const importMagazyn3D = () => import('./views/Magazyn3D.js');

const Magazyn3D = lazy(() =>
  importMagazyn3D().then((module) => ({ default: module.Magazyn3D })),
);

/**
 * Mapa też wchodzi osobną paczką — Mapbox GL waży podobnie do three.js.
 * Jest widokiem startowym, więc jej paczka pobiera się od razu; wydzielenie
 * służy temu, żeby nie siedziała w tym samym pliku co reszta aplikacji
 * i nie opóźniała pierwszego rysunku interfejsu.
 */
const Mapa = lazy(() => import('./views/Mapa.js').then((module) => ({ default: module.Mapa })));

/**
 * Ściągnięcie paczki 3D w tle, gdy przeglądarka nie ma nic pilnego do roboty.
 *
 * Leniwe wczytywanie oszczędza czas pierwszego otwarcia aplikacji, ale bez tego
 * cały koszt trzy.js spadał na kliknięcie w „Magazyn 3D" — i to właśnie wtedy
 * użytkownik czekał. Pobranie z wyprzedzeniem zostawia oszczędność na starcie,
 * a samo przejście do widoku robi natychmiastowym.
 *
 * `requestIdleCallback` czeka na bezczynność, więc nie odbiera pasma pierwszemu
 * strumieniowi danych. Gdzie go nie ma (Safari), wystarcza zwykłe opóźnienie.
 */
function usePobierzWczesniej3D(wlaczony: boolean): void {
  useEffect(() => {
    if (!wlaczony) return;

    const pobierz = (): void => {
      void importMagazyn3D();
    };

    const idle = window.requestIdleCallback;
    if (typeof idle === 'function') {
      const id = idle(pobierz, { timeout: 4000 });
      return () => window.cancelIdleCallback?.(id);
    }

    const timer = window.setTimeout(pobierz, 1500);
    return () => window.clearTimeout(timer);
  }, [wlaczony]);
}

/**
 * DWA POZIOMY NAWIGACJI.
 *
 * Poprzednio wszystkie widoki leżały w jednym rzędzie: mapa obok schematu,
 * schemat obok bilansu. To było niespójne — mapa jest spisem WSZYSTKICH
 * magazynów, a schemat i bilans mówią o JEDNYM, konkretnym. Menu pokazywało
 * więc „Magazyn" i „Bilans" także wtedy, gdy żaden magazyn nie był wybrany,
 * a pokazywały dane stanowiska badawczego, jakby było jedyne.
 *
 *   przeglad   Mapa i Lista. Nic nie jest wybrane, interfejs jest NEUTRALNY —
 *              bez barwy nośnika, bo nie wiadomo jeszcze, jakiego.
 *
 *   magazyn    Wnętrze jednego magazynu: schemat, scena 3D, przebiegi, bilans,
 *              sesje, diagnostyka, ustawienia. Tu interfejs bierze barwę
 *              nośnika, a przycisk domu wraca na przegląd.
 */
type WidokPrzegladu = 'mapa' | 'lista';

type WidokMagazynu =
  | 'schemat'
  | 'schemat3d'
  | 'przebiegi'
  | 'bilans'
  | 'diagnostyka'
  | 'sesje'
  | 'ustawienia';

/**
 * Widoki, w których obraz jest treścią i ma zająć cały ekran.
 * Pozostałe zostają w czytelnej kolumnie — tam treścią są liczby i tabele,
 * a wiersz ciągnący się przez cały monitor czyta się gorzej.
 */
const OBRAZOWE = new Set<string>(['mapa', 'schemat', 'schemat3d']);

const WIDOKI_PRZEGLADU: Array<{ id: WidokPrzegladu; label: string }> = [
  { id: 'mapa', label: 'Mapa' },
  { id: 'lista', label: 'Lista' },
];

/**
 * Adres pliku z katalogu `web/public`.
 *
 * Zapis „/logo.webp" wystarczał, dopóki aplikacja stała zawsze w korzeniu
 * adresu. Na GitHub Pages leży w podkatalogu (`/magazyn-pcm/`), a ukośnik
 * na początku znaczy „od korzenia domeny" — logotypy szukałyby się wtedy
 * piętro za wysoko i nie wczytały. `BASE_URL` podstawia Vite przy budowaniu
 * i zawsze kończy się ukośnikiem.
 */
function plik(nazwa: string): string {
  return `${import.meta.env.BASE_URL}${nazwa}`;
}

const WIDOKI_MAGAZYNU: Array<{ id: WidokMagazynu; label: string; icon?: 'trybik' }> = [
  { id: 'schemat', label: 'Schemat' },
  { id: 'schemat3d', label: 'Schemat 3D' },
  { id: 'przebiegi', label: 'Przebiegi' },
  { id: 'bilans', label: 'Bilans' },
  { id: 'sesje', label: 'Sesje' },
  { id: 'diagnostyka', label: 'Diagnostyka' },
  { id: 'ustawienia', label: 'Ustawienia', icon: 'trybik' },
];

export function App() {
  /**
   * OTWARTY MAGAZYN. `null` = jesteśmy na przeglądzie i nic nie jest wybrane.
   *
   * To jest teraz główny przełącznik aplikacji: decyduje, który poziom
   * nawigacji widać, skąd biorą się dane i jaką barwę ma interfejs.
   */
  const [otwarty, setOtwarty] = useState<Lokalizacja | null>(null);
  const [widokPrzegladu, setWidokPrzegladu] = useState<WidokPrzegladu>('mapa');
  const [widokMagazynu, setWidokMagazynu] = useState<WidokMagazynu>('schemat');
  /** Sondy przekazane ze schematu do Przebiegów (klik w sondę). */
  const [przebiegiIds, setPrzebiegiIds] = useState<string[]>([]);

  /**
   * Punkt POKAZOWY do podmiany źródła danych.
   *
   * Stanowisko badawcze ma prawdziwe pomiary i dla niego zostaje `null` —
   * strumień z serwera pracuje wtedy normalnie. Model wchodzi tylko za punkty
   * z mapy, za którymi nie stoi żadna instalacja.
   */
  const punktPokazowy = otwarty?.stan === 'demo' ? otwarty : null;

  const zywe = useLiveData();
  const data = useDanePunktu(zywe, punktPokazowy);
  const settings = useSettings();
  const theme = useAppliedTheme();

/**
   * Barwa całego interfejsu idzie za NOŚNIKIEM otwartego magazynu:
   * parafina 57HC — pomarańcz, materiał 8HC — stalowy błękit.
   *
   * Na PRZEGLĄDZIE jest `null`, czyli neutralnie. Mapa i lista pokazują
   * dwadzieścia jeden obiektów obu rodzajów naraz i pomalowanie całego okna
   * na jeden z nich byłoby po prostu nieprawdą.
   *
   * Dla punktu pokazowego źródłem jest jego rodzaj, dla stanowiska — materiał
   * sesji albo rozpoznanego zbiornika. Nigdy sam widok: inaczej ten sam
   * magazyn miałby inną barwę w schemacie i w przebiegach.
   */
  const kierunek: Kierunek | null = !otwarty
    ? null
    : otwarty.stan === 'demo'
      ? otwarty.typ
      : (data.session?.material ?? data.materials?.defaultMaterial) === 'RT8HC'
        ? 'chlod'
        : 'cieplo';

  useEffect(() => {
    if (kierunek) document.documentElement.dataset.kierunek = kierunek;
    else delete document.documentElement.dataset.kierunek;
  }, [kierunek]);

  // Warstwa API czyta wybrany punkt poza Reactem — patrz demo/aktywnyPunkt.ts.
  useEffect(() => {
    ustawAktywnyPunkt(punktPokazowy);
  }, [punktPokazowy]);

  /** Otwarcie magazynu z mapy albo z listy. */
  const otworz = (wybrany: Lokalizacja): void => {
    setOtwarty(wybrany);
    setWidokMagazynu('schemat');
    setPrzebiegiIds([]);
  };

  /** Powrót na przegląd — przycisk domu. */
  const doPrzegladu = (): void => {
    setOtwarty(null);
    setPrzebiegiIds([]);
  };

  // Paczka 3D ląduje w pamięci przeglądarki jeszcze przed kliknięciem.
  usePobierzWczesniej3D(settings.widok3d);

  // Widok przewija się pod belkami, więc musi znać ich wysokość.
  const ramaRef = useRef<HTMLDivElement>(null);
  const gornaRef = useRef<HTMLElement>(null);
  const dolnaRef = useRef<HTMLElement>(null);
  useWysokosciBelek(ramaRef, gornaRef, dolnaRef);

  const openInPrzebiegi = (pointId: string): void => {
    setPrzebiegiIds([pointId]);
    setWidokMagazynu('przebiegi');
  };

  // Brama logowania. Gdy serwer jej nie wymaga (praca w sieci laboratorium),
  // ten ekran nie pojawia się ani na moment.
  if (data.link === 'unauthorized') {
    return <Logowanie onSuccess={data.reload} />;
  }

  // Widok 3D da się wyłączyć w opcjach — także wtedy, gdy jest otwarty.
  const widokiMagazynu = WIDOKI_MAGAZYNU.filter(
    (item) => item.id !== 'schemat3d' || settings.widok3d,
  );
  const widokWMagazynie = widokiMagazynu.some((item) => item.id === widokMagazynu)
    ? widokMagazynu
    : 'schemat';

  /** Nazwa aktywnego widoku — decyduje o ramie i o kluczu granicy błędu. */
  const activeView: string = otwarty ? widokWMagazynie : widokPrzegladu;

  return (
    <div className="app" ref={ramaRef}>
      <header className="topbar" ref={gornaRef}>
        <div className="brand">
          {/*
            Logotyp zamiast napisu. Znaczek towarowy jest CZĘŚCIĄ pliku, więc
            nie dokładamy go osobno — inaczej stałby na ekranie dwa razy.

            Tekst zastępczy niesie ™, bo dla czytnika ekranu i dla wyszukiwarki
            to jedyna droga do tej informacji; z obrazu jej nie wyciągną.
          */}
          <img className="brand__logo" src={plik('entalvia.png')} alt="Entalvia™" />
          {/* Wersja pod nazwą — mała, bo to metryczka, nie tytuł. Numer siedzi
              w `wersja.ts`, żeby był jeden dla całej aplikacji. */}
          <span className="brand__wersja mono">
            {WERSJA}
            {TRYB_POKAZOWY ? <PlakietkaPokazowa /> : null}
          </span>
        </div>

        {/* Pastylka menu jest wyśrodkowana wobec całego ekranu, a nie wobec
            tego, co zostało po logo — dlatego siedzi w osobnym, absolutnie
            pozycjonowanym opakowaniu. Przełącznik motywu wisi tuż za jej
            prawą krawędzią, już poza pastylką, i nie przesuwa jej środka. */}
        <div className="topbar__center">
          {/*
            Nawigacja pokazuje TYLKO ten poziom, na którym jesteśmy.

            Na przeglądzie są dwie pozycje — mapa i lista, dwie odpowiedzi na to
            samo pytanie „co mamy". Po wejściu w magazyn wchodzi jego wnętrze,
            a przed pozycjami staje dom i nazwa obiektu: bez tego po kilku
            kliknięciach nie wiadomo, czyje liczby są na ekranie.
          */}
          <nav className="nav" aria-label={otwarty ? `Widoki magazynu ${otwarty.nazwa}` : 'Widoki'}>
            {otwarty ? (
              <>
                <button
                  type="button"
                  className="nav__item nav__item--dom"
                  onClick={doPrzegladu}
                  title="Wróć do mapy i listy magazynów"
                  aria-label="Wróć do przeglądu magazynów"
                >
                  <span className="nav__emoji" aria-hidden="true">
                    ⌂
                  </span>
                </button>
                <span className="nav__obiekt" title={`${otwarty.nazwa} · ${otwarty.miasto}`}>
                  <span
                    className={`nav__obiekt-kropka is-${kierunek ?? otwarty.typ}`}
                    aria-hidden="true"
                  />
                  {otwarty.nazwa}
                </span>
                <span className="nav__rozdzielacz" aria-hidden="true" />
                {widokiMagazynu.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`nav__item${widokWMagazynie === item.id ? ' is-active' : ''}${
                      item.icon ? ' nav__item--icon' : ''
                    }`}
                    onClick={() => {
                      // Wejście w Przebiegi z nawigacji czyści zaznaczenie z kliknięcia
                      // sondy — inaczej badacz widziałby jedną serię i nie wiedział czemu.
                      if (item.id === 'przebiegi') setPrzebiegiIds([]);
                      setWidokMagazynu(item.id);
                    }}
                    aria-label={item.icon ? item.label : undefined}
                    title={item.icon ? item.label : undefined}
                  >
                    {item.icon === 'trybik' ? (
                      <span className="nav__emoji" aria-hidden="true">
                        ⚙️
                      </span>
                    ) : (
                      item.label
                    )}
                  </button>
                ))}
              </>
            ) : (
              WIDOKI_PRZEGLADU.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav__item${widokPrzegladu === item.id ? ' is-active' : ''}`}
                  onClick={() => setWidokPrzegladu(item.id)}
                >
                  {item.label}
                </button>
              ))
            )}
          </nav>

          <PrzelacznikMotywu />
        </div>

        <div className="topbar__right">
          {/* Logo klienta w prawym górnym rogu (v0.6). Żyje na białej
              pastylce, bo jego kolory potrzebują białego tła w obu motywach. */}
          <img className="topbar__logo--tauron" src={plik('tauron-cieplo.png')} alt="Tauron Ciepło" />
        </div>
      </header>

      {/*
        Widoki obrazowe (mapa, schemat, scena 3D) dostają ramę BEZ ograniczenia
        szerokości i bez marginesów — obraz jest w nich treścią i ma iść do
        samych krawędzi ekranu.

        Wcześniej próbowałem wypychać same widoki poza `.main` sztuczką
        „width: 100vw + margin-left: 50% + translateX(-50vw)". To działa tylko
        wtedy, gdy rodzic ma pełną szerokość okna — a `.main` jest ograniczony
        do 1400 px, więc oba ruchy się znosiły i widok zostawał w kolumnie.
        Zdjęcie ograniczenia z samej ramy jest jednoznaczne i nie ma czego
        znosić.
      */}
      <main className={`main${OBRAZOWE.has(activeView) ? ' main--obraz' : ''}`}>
        {/* Klucz granicy błędu zawiera OTWARTY MAGAZYN, nie tylko widok:
            wejście w inny obiekt ma zerować ewentualny błąd poprzedniego. */}
        <BladWidoku resetKey={`${otwarty?.id ?? 'przeglad'}:${activeView}`}>
          {!otwarty && widokPrzegladu === 'mapa' ? (
            <Suspense fallback={<div className="note">Wczytuję mapę…</div>}>
              <Mapa data={data} onOtworzMagazyn={otworz} />
            </Suspense>
          ) : null}
          {!otwarty && widokPrzegladu === 'lista' ? (
            <Lista data={data} onOtworz={otworz} />
          ) : null}

          {otwarty && widokWMagazynie === 'schemat' ? (
            <Magazyn data={data} onOpenInPrzebiegi={openInPrzebiegi} />
          ) : null}
          {otwarty && widokWMagazynie === 'schemat3d' ? (
            <Suspense fallback={<div className="note">Wczytuję scenę trójwymiarową…</div>}>
              <Magazyn3D data={data} />
            </Suspense>
          ) : null}
          {otwarty && widokWMagazynie === 'przebiegi' ? (
            // Klucz zeruje stan formularza, gdy przyjdziemy z inną sondą.
            <Przebiegi key={przebiegiIds.join(',')} data={data} initialIds={przebiegiIds} />
          ) : null}
          {otwarty && widokWMagazynie === 'bilans' ? <Bilans data={data} /> : null}
          {otwarty && widokWMagazynie === 'sesje' ? <Sesje data={data} /> : null}
          {otwarty && widokWMagazynie === 'diagnostyka' ? <Diagnostyka data={data} /> : null}
          {otwarty && widokWMagazynie === 'ustawienia' ? <Ustawienia data={data} /> : null}
        </BladWidoku>
      </main>

{/* Ostrzeżenie, że oglądany magazyn nie ma instalacji.
          Nazwa i wyjście przeniosły się do nagłówka (dom + nazwa obiektu), więc
          zostaje samo to, czego nagłówek nie powie: że te liczby są wyliczone. */}
      {punktPokazowy ? (
        <div className="punkt-pasek">
          <span className={`punkt-pasek__kropka is-${punktPokazowy.typ}`} aria-hidden="true" />
          <span className="punkt-pasek__opis">
            punkt pokazowy · {punktPokazowy.typ === 'chlod' ? 'magazyn chłodu' : 'magazyn ciepła'} ·
            dane wyliczone, nie zmierzone
          </span>
        </div>
      ) : null}

      {/* 21 zmysłów — prawy dolny róg, nad stopką (v0.6). */}
      <img
        className="logo-21"
        src={plik(
          theme === 'dark' ? 'logo-21zmyslow-ciemnytryb.webp' : 'logo-21zmyslow-jasnytryb.webp',
        )}
        alt="21 zmysłów"
      />

      <PasekStanu data={data} ref={dolnaRef} />
    </div>
  );
}
