/**
 * STAN NAŁADOWANIA (SOC) — model entalpii.
 *
 * TO JEST APROKSYMACJA I NIE WOLNO JEJ BRAĆ ZA POMIAR.
 *
 * Liczymy entalpię materiału z jego temperatury, odcinkami liniowo: ciepło
 * jawne poniżej solidusu, ciepło przemiany w plateau, znów jawne powyżej
 * liquidusu. Problem jest wbudowany w fizykę: W PLATEAU TEMPERATURA NIE NIESIE
 * INFORMACJI O SOC. Materiał może być w połowie przetopiony albo przetopiony
 * w całości i pokazywać tę samą temperaturę — bo właśnie na tym polega
 * przemiana fazowa. Wszystko, co ten moduł zwraca w przedziale solidus–liquidus,
 * jest interpolacją, nie odczytem.
 *
 * DOCELOWO SOC MA IŚĆ Z BILANSU ENERGII: całki moc × czas z ciepłomierza,
 * narastająco od stanu odniesienia. Ciepłomierz jest już podłączony i podaje
 * moc, ale jego dwa kanały energii zwracają w Loxone tę samą wartość co ΔT —
 * czyli są wpięte pod zły rejestr (opisane w specyfikacji). Dopóki to nie
 * zostanie poprawione, bilansu nie ma z czego policzyć.
 *
 * DLATEGO INTERFEJS JEST TAKI, A NIE INNY. `OdczytSoc` niesie wartość RAZEM
 * z informacją, skąd pochodzi. Interfejs użytkownika dostaje gotowy odczyt
 * i nie wie, jak powstał — więc podmiana źródła na bilans energii nie dotknie
 * ani jednej linii w komponencie belki. Wystarczy w miejscu wywołania podać
 * inny odczyt.
 */

/** Kierunek pracy materiału: magazyn ciepła albo magazyn chłodu. */
export type Kierunek = 'cieplo' | 'chlod';

export interface ParametryEntalpii {
  /** Dolny kraniec skali — punkt odniesienia entalpii (h = 0). */
  tMin: number;
  /** Górny kraniec skali — tu entalpia osiąga h_max, czyli SOC = 100%. */
  tMax: number;
  /** Początek przemiany. */
  solidus: number;
  /** Koniec przemiany. */
  liquidus: number;
  /** Ciepło przemiany w modelu entalpii, kJ/kg. */
  cieploPrzemiany: number;
  /** Ciepło właściwe, kJ/(kg·K). */
  cp: number;
}

export interface OdczytSoc {
  /** 0–1 albo null, gdy nie ma z czego policzyć. */
  soc: number | null;
  /** Entalpia względem dolnego krańca skali, kJ/kg. */
  entalpiaKJkg: number | null;
  /**
   * Skąd pochodzi liczba. Interfejs pokazuje to użytkownikowi wprost, żeby
   * szacunek nigdy nie wyglądał jak pomiar.
   */
  zrodlo: 'temperatura' | 'bilans-energii';
}

function przytnij01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * Entalpia względem `tMin`, w kJ/kg. Rośnie monotonicznie z temperaturą —
 * także dla materiału chłodu, bo entalpia to entalpia. Odwrócenie dotyczy
 * dopiero SOC (patrz niżej).
 */
export function entalpia(tempC: number, p: ParametryEntalpii): number {
  if (tempC <= p.solidus) {
    return p.cp * (tempC - p.tMin);
  }

  const jawneDoSolidusu = p.cp * (p.solidus - p.tMin);

  if (tempC <= p.liquidus) {
    const szerokoscPlateau = p.liquidus - p.solidus;
    // Plateau o zerowej szerokości byłoby skokiem — zabezpieczenie na wypadek
    // błędnej konfiguracji materiału.
    if (szerokoscPlateau <= 0) return jawneDoSolidusu + p.cieploPrzemiany;
    return (
      jawneDoSolidusu + (p.cieploPrzemiany * (tempC - p.solidus)) / szerokoscPlateau
    );
  }

  return jawneDoSolidusu + p.cieploPrzemiany + p.cp * (tempC - p.liquidus);
}

/** Entalpia na górnym krańcu skali — mianownik dla SOC. */
export function entalpiaMax(p: ParametryEntalpii): number {
  return entalpia(p.tMax, p);
}

/**
 * SOC z temperatury.
 *
 * Dla magazynu ciepła: więcej ciepła = bardziej naładowany.
 * Dla magazynu chłodu ODWROTNIE — naładowany znaczy zamrożony, więc SOC jest
 * dopełnieniem. Ta jedna linia jest całą różnicą między dwoma materiałami;
 * dzięki niej interfejs nie musi się rozwidlać.
 */
export function socZTemperatury(
  tempC: number | null,
  p: ParametryEntalpii,
  kierunek: Kierunek,
): OdczytSoc {
  if (tempC === null || !Number.isFinite(tempC)) {
    return { soc: null, entalpiaKJkg: null, zrodlo: 'temperatura' };
  }

  const h = entalpia(tempC, p);
  const hMax = entalpiaMax(p);
  if (hMax <= 0) return { soc: null, entalpiaKJkg: h, zrodlo: 'temperatura' };

  const udzial = przytnij01(h / hMax);
  return {
    soc: kierunek === 'chlod' ? 1 - udzial : udzial,
    entalpiaKJkg: h,
    zrodlo: 'temperatura',
  };
}

/**
 * SOC na procenty do pokazania.
 *
 * W DÓŁ, nie do najbliższej. Naładowanie 61,6% pokazujemy jako 61%, nie 62% —
 * przyrząd badawczy nie ma prawa zawyżać stanu magazynu, a przy tak zgrubnym
 * szacunku (patrz nagłówek pliku) zaokrąglenie w górę dopisywałoby energię,
 * której nikt nie zmierzył. Ubocznie: 100% pojawia się dopiero przy pełnym
 * naładowaniu, a nie od 99,5%.
 */
export function procentSoc(soc: number): number {
  return Math.floor(soc * 100);
}

/**
 * Energia w kWh liczona Z POKAZYWANEGO procentu, nie z surowego SOC.
 *
 * Dzięki temu dwie liczby na ekranie nie mogą sobie przeczyć: 61% z 11,3 kWh
 * daje 6,9 kWh i tak też jest napisane. Gdyby energia szła z surowej wartości,
 * użytkownik przemnożyłby 61% × 11,3 i dostał inny wynik niż widzi.
 */
export function energiaKWh(soc: number, pojemnoscKWh: number): number {
  return (procentSoc(soc) / 100) * pojemnoscKWh;
}

/**
 * Udział entalpii w maksimum, 0–1 — do rysowania krzywej.
 *
 * To NIE to samo co SOC: krzywa entalpii rośnie z temperaturą dla obu
 * materiałów, a SOC dla chłodu maleje. Wykres pokazuje entalpię, podpis punktu
 * pokazuje SOC — i dlatego przy chłodzie te dwie liczby świadomie się różnią.
 */
export function udzialEntalpii(tempC: number, p: ParametryEntalpii): number {
  const hMax = entalpiaMax(p);
  if (hMax <= 0) return 0;
  return przytnij01(entalpia(tempC, p) / hMax);
}
