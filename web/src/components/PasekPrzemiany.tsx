/**
 * Belka stanu naładowania — nagłówek widoku Magazyn.
 *
 * ZWINIĘTA pokazuje to, bez czego reszta ekranu nic nie znaczy: jaki materiał
 * jest w zbiorniku, w której strefie stoi teraz i jak daleko mu do przemiany.
 *
 * PASEK JEST PODZIAŁKĄ TEMPERATURY — gradientem palety A2, tym samym, którym
 * barwione są kropki sond. Wcześniej dzielił się na trzy strefy w barwach
 * „rozładowany / w przemianie / naładowany", czyli barwa mówiła o energii.
 * Zasada 1 palety (docs/PALETA-TEMPERATUR.md) mówi wprost: barwa znaczy
 * temperaturę i nic innego, bo podczas przemiany temperatura stoi godzinami
 * i barwa też ma stać. Stany zostały — jako podpisy, marker średniej
 * i liczba procentowa, czyli osobnym kanałem.
 *
 * ROZWINIĘTA dokłada krzywą entalpii i dane materiału. Rozwinięcie jest
 * NAKŁADKĄ nad schematem, nie elementem układu — inaczej każde zajrzenie
 * w szczegóły przestawiałoby rysunek instalacji pod kursorem.
 *
 * Dwa materiały, jeden komponent: wszystko, co je różni, siedzi w configu
 * (`belka/konfiguracja.ts`). W tym pliku nie ma ani jednego rozgałęzienia na
 * „a jeśli chłód".
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MaterialProfile, MaterialsResponse, PcmMaterial, SocState } from '@magazyn-pcm/shared';
import {
  KONFIGURACJA,
  OPIS_STANU,
  stanZTemperatury,
  strefyOdLewej,
  wypelnienieStrefy,
} from './belka/konfiguracja.js';
import { liczba, utworzSkale } from './belka/skala.js';
import { przystankiGradientu, wybierzSkale } from '../paleta-temperatur.js';
import { KrzywaEntalpii } from './belka/KrzywaEntalpii.js';
import { energiaKWh, type OdczytSoc, type ParametryEntalpii } from '../soc.js';

export interface Props {
  profile: MaterialProfile | null;
  materials: MaterialsResponse | null;
  /** Parafina narzucona przez trwającą sesję albo null. */
  fromSession: PcmMaterial | null;
  /** Parafina wynikająca z rozpoznanego zbiornika albo null. */
  detected: PcmMaterial | null;
  /**
   * Parafina narzucona przez STANOWISKO — Gliwice mają osobny magazyn chłodu
   * i osobny ciepła, więc punkt sam mówi, co w nim jest. Ma pierwszeństwo nad
   * wszystkim innym i blokuje przełącznik.
   */
  zeStanowiska?: PcmMaterial | null;
  preview: PcmMaterial;
  onPreviewChange: (material: PcmMaterial) => void;
  /** Objętości zbiorników — pokazywane po rozwinięciu. */
  volumesL?: { storage: number; buffer: number };
  /** Średnia z sond magazynu albo null, gdy żadna nie ma danych. */
  averageC?: number | null;
  /**
   * Skrajne odczyty sond. Gdy sondy się rozjeżdżają (część kafli przeszła
   * przemianę, część nie), średnia sama tego nie pokaże — dlatego na pasku
   * pojawia się wtedy wąski pas od min do max.
   */
  zakresC?: { min: number; max: number } | null;
  /**
   * Gotowy odczyt naładowania. Liczy go strona wywołująca, więc podmiana
   * źródła (temperatura → bilans energii z ciepłomierza) nie dotyka tego pliku.
   */
  soc?: OdczytSoc | null;
  /**
   * Bilans z serwera — gdy jest, linia „Energia: x / y kWh" bierze liczby
   * z niego, żeby belka i pasek pod zbiornikiem nie pokazywały dwóch różnych
   * energii z dwóch pojemności (config belki ma 9,3 kWh z karty, bilans liczy
   * na 9,7 kWh z modelu entalpii — mianowniki muszą być spójne w obrębie
   * jednego źródła).
   */
  bilans?: SocState | null;
  /**
   * Zbiornik jeszcze NIE ROZPOZNANY (brak sesji, brak rozpoznania, brak stanu
   * z serwera). Wtedy nazwa materiału jest zgadnięta i nie wolno jej podawać
   * jak faktu ani pozwalać na przełączanie.
   */
  nierozpoznany?: boolean;
  /** Kierunek zmiany do chipu stanu albo null, gdy nie wiadomo. */
  kierunekZmiany?: 'ladowanie' | 'rozladowanie' | null;
}

export function PasekPrzemiany({
  profile,
  materials,
  fromSession,
  detected,
  zeStanowiska = null,
  preview,
  onPreviewChange,
  volumesL,
  averageC = null,
  zakresC = null,
  soc = null,
  bilans = null,
  nierozpoznany = false,
  kierunekZmiany = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const kartaRef = useRef<HTMLElement>(null);
  const paskaRef = useRef<HTMLDivElement>(null);
  /** Zmierzona szerokość paska — z niej powstaje wspólna skala. */
  const [szerokosc, setSzerokosc] = useState(0);
  /** Pozycja kursora nad paskiem w pikselach albo null. */
  const [kursorX, setKursorX] = useState<number | null>(null);

  // Szerokość mierzymy, a nie zakładamy: od niej zależy pokrycie osi wykresu
  // z paskiem. Przy każdej zmianie rozmiaru liczymy od nowa.
  //
  // DWA ŹRÓDŁA ZDARZEŃ, i to nie z nadmiaru ostrożności. `ResizeObserver`
  // dostarcza powiadomienia dopiero na koniec klatki, więc gdy przeglądarka
  // klatek nie rysuje (karta w tle, panel podglądu), pomiar zostaje stary
  // i oś wykresu rozjeżdża się z paskiem. Zdarzenie `resize` okna przychodzi
  // niezależnie od rysowania i domyka tę lukę.
  useLayoutEffect(() => {
    const el = paskaRef.current;
    if (!el) return;

    const zmierz = (): void => {
      const nowa = el.getBoundingClientRect().width;
      setSzerokosc((stara) => (Math.abs(stara - nowa) < 0.5 ? stara : nowa));
    };

    zmierz();
    const observer = new ResizeObserver(zmierz);
    observer.observe(el);
    window.addEventListener('resize', zmierz);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', zmierz);
    };
  }, [profile?.id]);

  // Klik poza belką zwija ją.
  useEffect(() => {
    if (!open) return;
    const naZewnatrz = (event: MouseEvent): void => {
      if (!kartaRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', naZewnatrz);
    return () => document.removeEventListener('mousedown', naZewnatrz);
  }, [open]);

  if (!profile || !materials) return null;

  const cfg = KONFIGURACJA[profile.id];
  const skala = utworzSkale(szerokosc, profile.scaleMin, profile.scaleMax);

  // Ciepło przemiany i ciepło właściwe idą z PROFILU MATERIAŁU, nie z configu
  // belki — jedno źródło dla belki, paska pod zbiornikiem i pinezki na mapie.
  // Wcześniej config belki miał własne liczby i te trzy miejsca pokazywały
  // różne procenty tego samego naładowania.
  const parametry: ParametryEntalpii = {
    tMin: profile.scaleMin,
    tMax: profile.scaleMax,
    solidus: cfg.solidus,
    liquidus: cfg.liquidus,
    cieploPrzemiany: profile.latentHeat,
    cp: profile.cp,
  };

  /*
   * PODZIAŁKA MUSI BYĆ NA TEJ SAMEJ SKALI CO KROPKI SOND.
   *
   * Rodzaj skali rozstrzyga rozrzut sond materiału — dokładnie ten sam wkład,
   * z którego liczy go `bindSchema` (tam min/max wszystkich sond `pcm`, tu
   * gotowe `zakresC`), więc obie strony wychodzą na tę samą odpowiedź.
   * Gdyby legenda trzymała skalę globalną, a kropki lokalną, legenda
   * pokazywałaby barwy, których na rysunku nie ma — a to gorsze niż jej brak.
   *
   * Osią zostaje ZAKRES MATERIAŁU (0–20 albo 40–75 °C), bo podziałka opisuje
   * materiał. Przy skali lokalnej barwa na jej krańcach po prostu się
   * zatrzymuje, tak samo jak na kropkach.
   */
  const rodzajSkali = wybierzSkale(zakresC ? [zakresC.min, zakresC.max] : [averageC]);

  const maDane = averageC !== null;
  const stan = maDane ? stanZTemperatury(averageC, cfg) : null;
  const poza = maDane ? skala.pozaSkala(averageC) : null;

  const zrodlo = zeStanowiska
    ? 'ze stanowiska'
    : nierozpoznany
      ? 'rozpoznaję…'
      : fromSession
        ? 'z sesji'
        : detected
          ? 'z sond'
          : 'podgląd';
  const zablokowane =
    zeStanowiska !== null || nierozpoznany || fromSession !== null || detected !== null;
  const profile2 = Object.values(materials.profiles) as MaterialProfile[];

  const opisKierunku = cfg.kierunek === 'chlod' ? 'chłód' : 'ciepło';
  // Z bilansu serwera, gdy jest — licznik i mianownik z JEDNEGO źródła.
  const energia =
    bilans?.energiaKWh != null
      ? bilans.energiaKWh
      : soc?.soc == null
        ? null
        : energiaKWh(soc.soc, cfg.pojemnoscKWh);
  const pojemnosc = bilans?.energiaKWh != null ? bilans.pojemnoscKWh : cfg.pojemnoscKWh;

  const strzalka =
    kierunekZmiany === 'ladowanie' ? '↑' : kierunekZmiany === 'rozladowanie' ? '↓' : '';

  return (
    <section className={`belka${open ? ' is-open' : ''}`} ref={kartaRef}>
      <button
        type="button"
        className="belka__glowa"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? 'Zwiń szczegóły' : 'Rozwiń krzywą entalpii i dane materiału'}
      >
        <span className="belka__naglowek">
          <span className="belka__lewa">
            <span className="belka__material">{profile.label}</span>
            <span className="belka__zrodlo">{zrodlo}</span>
          </span>

          <span className="belka__prawa">
            {/* Chevron mieszka WEWNĄTRZ chipu stanu (makieta v0.3): jeden
                obiekt „stan + rozwiń" zamiast dwóch osobnych celów wzroku. */}
            <span
              className={`belka__stan${stan ? '' : ' belka__stan--brak'}`}
              style={
                stan
                  ? { background: cfg.chip[stan].tlo, color: cfg.chip[stan].tekst }
                  : undefined
              }
            >
              {stan ? OPIS_STANU[stan] : 'Brak danych z sond'}
              {strzalka ? ` ${strzalka}` : ''}
              <svg
                className="belka__chevron"
                width={16}
                height={16}
                viewBox="0 0 18 18"
                aria-hidden="true"
              >
                <path
                  d="M4.5 7 9 11.5 13.5 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </span>
        </span>

        {/* Wartość nad markerem — w osobnym pasie, żeby nie podnosiła paska. */}
        <span className="belka__nadpasek">
          {maDane ? (
            <span
              className="belka__wartosc mono"
              style={
                // Przy temperaturze poza skalą marker stoi na krawędzi, więc
                // wyśrodkowanie liczby wypchnęłoby ją za kartę. Wtedy liczba
                // trzyma się krawędzi, a prefiks mówi, że to nie jest odczyt
                // z tego miejsca skali.
                poza === 'ponizej'
                  ? { left: 0, transform: 'none' }
                  : poza === 'powyzej'
                    ? { left: 'auto', right: 0, transform: 'none' }
                    : { left: skala.xOf(averageC), transform: 'translateX(-50%)' }
              }
            >
              {poza === 'ponizej' ? '<' : poza === 'powyzej' ? '>' : ''}
              {liczba(averageC)}°
            </span>
          ) : null}
        </span>

        {/* Pasek strefowy. Pole jest mierzone — z jego szerokości bierze się
            wspólna skala dla paska i osi wykresu.

            Najechanie kursorem czyta temperaturę z tej samej skali i rysuje
            cienką kreskę — na pasku i, gdy belka jest rozwinięta, przez cały
            wykres. Dzięki wspólnej `xOf`/`tempOf` kreska i liczba nie mogą
            wskazywać dwóch różnych miejsc. */}
        <span
          className="belka__pasek-pole"
          ref={paskaRef}
          onMouseMove={(event) => {
            const pole = event.currentTarget.getBoundingClientRect();
            setKursorX(event.clientX - pole.left);
          }}
          onMouseLeave={() => setKursorX(null)}
        >
          {/* PODZIAŁKA JEST MAPĄ CIEPLNĄ, NIE MAPĄ NAŁADOWANIA.
              Wcześniej pasek dzielił się na trzy strefy — rozładowaną (szarą),
              przemiany (sztrychowaną) i naładowaną (w barwie nośnika). Barwa
              mówiła więc o energii, a zasada 1 palety A2 mówi wprost: barwa
              znaczy temperaturę i nic innego. Teraz pod paskiem leży gradient
              palety rozciągnięty na zakres materiału, a naładowanie niosą
              marker średniej, liczba procentowa i podpisy stref.

              Zakres materiału ma 20 K (8HC) albo 35 K (57HC), czyli w obu
              przypadkach ≥ 15 K — dlatego skala globalna, nie lokalna. */}
          <span
            className="belka__pasek"
            style={{
              background:
                szerokosc > 0
                  ? `linear-gradient(90deg, ${przystankiGradientu(rodzajSkali, {
                      min: profile.scaleMin,
                      max: profile.scaleMax,
                    })
                      .map((s) => `${s.barwa} ${s.procent.toFixed(1)}%`)
                      .join(', ')})`
                  : undefined,
            }}
          >
            {/* Pasmo przemiany zostaje SZTRYCHEM na wierzchu gradientu —
                oznaczeniem, nie zmianą wypełnienia (wymóg specyfikacji). */}
            {szerokosc > 0 ? (
              <span
                className="belka__strefa belka__strefa--przemiana"
                style={{
                  left: skala.xOf(cfg.solidus),
                  width: Math.max(skala.xOf(cfg.liquidus) - skala.xOf(cfg.solidus), 0),
                  background: wypelnienieStrefy('przemiana', cfg),
                }}
              />
            ) : null}
          </span>

          {/* ROZJAZD SOND — pas od najzimniejszej do najcieplejszej.
              ==================================================================
              SIEDZI TU, RODZEŃSTWEM PASKA, A NIE W JEGO ŚRODKU. Komentarz przy
              poprzedniej wersji mówił dokładnie to samo, ale kod stał jednak
              wewnątrz `.belka__pasek` — a ten ma `overflow: hidden` przez
              zaokrąglone narożniki gradientu. Nadwyżka nad paskiem i pod nim
              była więc obcinana, pas kończył się równo z podziałką i dlatego
              zgłoszenie „dalej nie widzę rozszerzenia" wracało po każdej
              poprawce wysokości: żadna wysokość nie mogła pomóc.

              Zasięg w pionie jest teraz TAKI SAM jak przerywanych kresek progu
              przemiany (`.belka__granica`, ±7 px) — o to była prośba: rozrzut
              sond ma sięgać tam, gdzie granice pasma, żeby dało się je czytać
              jednym spojrzeniem. */}
          {zakresC && szerokosc > 0 ? (
            <span
              className="belka__zakres"
              style={{
                left: skala.xOf(zakresC.min),
                width: Math.max(skala.xOf(zakresC.max) - skala.xOf(zakresC.min), 2),
              }}
              title={`Rozrzut sond: ${liczba(zakresC.min)}–${liczba(zakresC.max)} °C`}
            />
          ) : null}

          {/* GRANICE PRZEMIANY — przerywane kreski wychodzące nad i pod pasek,
              tak jak prowadnice na krzywej entalpii po rozwinięciu belki. Pasmo
              samo w sobie jest tylko sztrychem, więc bez tych kresek trudno
              odczytać, GDZIE dokładnie się zaczyna i kończy. Dwie kreski, bo
              solidus i liquidus znaczą co innego: przy chłodzie krzepnięcie
              zaczyna się na jednym końcu, a kończy na drugim. */}
          {szerokosc > 0
            ? [
                { t: cfg.solidus, opis: 'solidus' },
                { t: cfg.liquidus, opis: 'liquidus' },
              ].map((g) => (
                <span
                  key={g.opis}
                  className="belka__granica"
                  style={{ left: skala.xOf(g.t) }}
                  title={`${g.opis === 'solidus' ? 'Początek' : 'Koniec'} przemiany: ${liczba(g.t)} °C`}
                />
              ))
            : null}

          {maDane && szerokosc > 0 ? (
            <span className="belka__marker" style={{ left: skala.xOf(averageC) }} />
          ) : null}

          {/* Kreska i odczyt pod kursorem. */}
          {kursorX !== null && szerokosc > 0 ? (
            <>
              <span className="belka__kursor" style={{ left: kursorX }} />
              <span
                className="belka__kursor-wartosc mono"
                style={{
                  left: Math.min(Math.max(kursorX, 26), szerokosc - 26),
                }}
              >
                {liczba(skala.tempOf(kursorX))}°
              </span>
            </>
          ) : null}
        </span>

        {/* Podpisy stref. */}
        {szerokosc > 0 ? (
          <span className="belka__podpisy">
            <span className="belka__podpis belka__podpis--lewy">
              {OPIS_STANU[strefyOdLewej(cfg)[0]!]}
            </span>
            <span
              className="belka__podpis belka__podpis--srodek"
              style={{
                left: (skala.xOf(cfg.solidus) + skala.xOf(cfg.liquidus)) / 2,
              }}
            >
              przemiana {cfg.solidus}–{cfg.liquidus}°
            </span>
            <span className="belka__podpis belka__podpis--prawy">
              {OPIS_STANU[strefyOdLewej(cfg)[2]!]}
            </span>
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="belka__panel">
          <KrzywaEntalpii
            skala={skala}
            cfg={cfg}
            parametry={parametry}
            sredniaC={averageC}
            soc={soc?.soc ?? null}
            opisKierunku={opisKierunku}
            kursorX={kursorX}
          />

          <div
            className="belka__przelacznik"
            role="group"
            aria-label="Wybór parafiny"
            // Klik w przełącznik nie może zwijać belki — i nie zwinie, bo panel
            // jest rodzeństwem przycisku, nie jego dzieckiem. `stopPropagation`
            // zostaje jako zabezpieczenie na wypadek przeniesienia kontrolek
            // do środka nagłówka.
            onClick={(event) => event.stopPropagation()}
          >
            {profile2.map((item) => {
              const aktywny = item.id === profile.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`parafina__option${aktywny ? ' is-active' : ''}`}
                  disabled={zablokowane && !aktywny}
                  aria-pressed={aktywny}
                  onClick={() => !zablokowane && onPreviewChange(item.id)}
                  title={
                    fromSession
                      ? 'Parafina pochodzi z trwającej sesji — zmień ją, kończąc sesję'
                      : detected
                        ? 'Parafina wynika z rozpoznanego zbiornika'
                        : `Przemiana ${item.phaseBandMin}–${item.phaseBandMax} °C`
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="belka__kafle">
            {/* DWIE RÓŻNE LICZBY I OBIE Z KARTY MATERIAŁU.
                „Ciepło utajone" to sama przemiana — ta wartość wchodzi do
                modelu entalpii. „Pojemność" to pozycja „Heat storage capacity"
                z karty Rubitherm, czyli utajone RAZEM z jawnym w podanym
                przedziale temperatur; podpisana zakresem, bo bez niego jest
                nieporównywalna. Wcześniej stała tu jedna liczba (190 kJ/kg)
                podpisana jako ciepło utajone, a jest pojemnością całkowitą. */}
            <Kafel label="ciepło utajone" wartosc={`${profile.latentHeat} kJ/kg`} />
            <Kafel
              label={`pojemność ${profile.capacityFromC}–${profile.capacityToC} °C`}
              wartosc={`${profile.capacityKJkg} kJ/kg`}
            />
            <Kafel label="temperatura maks." wartosc={`${profile.tMax} °C`} />
            {/* SZCZYT TOPNIENIA CZY KRZEPNIĘCIA — zależy od nośnika i nie jest
                drobiazgiem językowym. W magazynie CIEPŁA materiał ładuje się
                topieniem, więc szczyt jest szczytem topnienia. W magazynie
                CHŁODU (8HC) ładowaniem jest krzepnięcie i podpis „szczyt
                topnienia" opisywał wtedy przemianę odwrotną do tej, którą się
                obserwuje. Ta sama liczba z profilu, dwie różne przemiany. */}
            <Kafel
              label={cfg.kierunek === 'chlod' ? 'szczyt krzepnięcia' : 'szczyt topnienia'}
              wartosc={`${profile.peak} °C`}
            />
            <Kafel
              label="magazyn / bufor"
              wartosc={volumesL ? `${volumesL.storage} / ${volumesL.buffer} l` : '—'}
            />
          </div>

          <p className="belka__spod">
            {energia === null
              ? 'Energia: brak odczytu sond. '
              : `Energia: ${liczba(energia)} / ${liczba(pojemnosc)} kWh · `}
            {fromSession
              ? 'parafina z trwającej sesji.'
              : detected
                ? 'rozpoznana po sondach podłączonego zbiornika.'
                : 'podgląd bez sesji i bez rozpoznanego zbiornika.'}
            {soc?.zrodlo === 'temperatura'
              ? ' Naładowanie szacowane z temperatury.'
              : soc?.zrodlo === 'bilans-energii'
                ? ' Naładowanie z bilansu energii.'
                : ''}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Kafel({ label, wartosc }: { label: string; wartosc: string }) {
  return (
    <div className="belka__kafel">
      <span className="belka__kafel-label">{label}</span>
      <span className="belka__kafel-wartosc mono">{wartosc}</span>
    </div>
  );
}
