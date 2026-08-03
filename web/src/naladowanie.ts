/**
 * Stan naładowania magazynu — JEDNA definicja dla całej aplikacji.
 *
 * CZYM TO JEST, A CZYM NIE JEST.
 * To SZACUNEK Z TEMPERATURY, nie zmierzona energia. Liczymy położenie średniej
 * z sond między dolną i górną granicą skali materiału i podajemy je w procentach.
 *
 * Dlaczego nie liczymy energii naprawdę: do tego trzeba masy materiału i jego
 * ciepła właściwego, a tych nie mamy w konfiguracji. Ciepłomierz ma wprawdzie
 * kanały energii, ale oba zwracają tę samą wartość co ΔT — czyli są w Loxone
 * wpięte pod zły rejestr (opisane w specyfikacji). Dopóki to nie zostanie
 * poprawione, energii nie ma skąd wziąć.
 *
 * Czego ten szacunek NIE uwzględnia: większość ciepła magazyn oddaje i pobiera
 * w pasmie przemiany, przy prawie niezmiennej temperaturze. Liniowa miara po
 * temperaturze zaniża więc naładowanie w środku plateau. Dlatego wszędzie, gdzie
 * pokazujemy tę liczbę, obok stoi słowo „szacunek" — i tak ma zostać, dopóki
 * nie policzymy energii z prawdziwych danych.
 */

import type { MaterialProfile, PointValue, PublicPoint } from '@magazyn-pcm/shared';
import { procentSoc, socZTemperatury, type Kierunek } from './soc.js';

/**
 * Cieplo wlasciwe uzywane w modelu entalpii, kJ/(kg·K).
 * Ta sama wartosc co w konfiguracji belki — profil materialu jej nie niesie.
 */
const CP_KJ_KG_K = 2;

/**
 * Średnia z sond magazynu albo null, gdy żadna nie ma odczytu.
 *
 * Liczymy tylko z sond, które MAJĄ wartość. Wliczenie braku danych jako zera
 * ściągnęłoby średnią w dół i skłamało o zbiorniku.
 */
export function sredniaZSond(
  points: readonly PublicPoint[],
  values: Record<string, PointValue | undefined>,
): number | null {
  const odczyty = points
    .filter((p) => p.group === 'pcm' && p.geometry)
    .map((p) => values[p.id]?.v)
    .filter((v): v is number => typeof v === 'number');

  if (odczyty.length === 0) return null;
  return odczyty.reduce((suma, v) => suma + v, 0) / odczyty.length;
}

/**
 * Naładowanie w procentach (0–100) albo null bez danych.
 *
 * KIERUNEK JEST OBOWIĄZKOWY i to jest tu najważniejsze. Poprzednia wersja
 * liczyła wyłącznie położenie temperatury w skali materiału, bez pytania,
 * czym ten magazyn jest. Dla parafiny 57HC wychodziło dobrze — cieplej znaczy
 * bardziej naładowany. Dla materiału 8HC wychodziło DOKŁADNIE ODWROTNIE:
 * magazyn chłodu jest naładowany, gdy jest ZIMNY, a nagrzany znaczy pusty.
 *
 * Zobaczyliśmy to 2026-08-03, gdy stanowisko przeszło na zbiornik 8HC:
 * zbiornik o temperaturze 24 °C — czyli całkowicie rozładowany, cieplejszy
 * nawet od górnej granicy skali materiału (20 °C) — pokazywał na mapie
 * „100% naładowany". Sumienny przyrząd nie ma prawa tak kłamać.
 *
 * Liczymy więc TYM SAMYM modelem entalpii, co belka stanu naładowania
 * (`socZTemperatury`), zamiast drugim, uproszczonym. Dzięki temu znacznik na
 * mapie i belka nad schematem nie mogą się już rozejść — a wcześniej mogły,
 * bo były to dwie niezależne definicje tej samej wielkości.
 *
 * Zaokrąglenie w DÓŁ (`procentSoc`) — przyrząd badawczy nie zawyża stanu
 * magazynu.
 */
export function naladowanieProcent(
  sredniaC: number | null,
  profile: MaterialProfile | null,
  kierunek: Kierunek,
): number | null {
  if (sredniaC === null || !profile) return null;
  if (profile.scaleMax - profile.scaleMin <= 0) return null;

  const odczyt = socZTemperatury(
    sredniaC,
    {
      tMin: profile.scaleMin,
      tMax: profile.scaleMax,
      solidus: profile.phaseBandMin,
      liquidus: profile.phaseBandMax,
      cieploPrzemiany: profile.latentHeat,
      cp: CP_KJ_KG_K,
    },
    kierunek,
  );

  return odczyt.soc === null ? null : procentSoc(odczyt.soc);
}

/**
 * Czy średnia z sond wypada POZA zakresem pracy materiału.
 *
 * Przycięcie do 0–100% jest samo w sobie w porządku — magazyn nie bywa
 * naładowany na minus. Ale przycięcie MILCZĄCE zaciera różnicę między
 * „rozładowany" a „temperatura zbiornika jest w ogóle poza skalą tego
 * materiału", a to dwie różne informacje. Druga zwykle znaczy, że w zbiorniku
 * jest inny materiał, niż aplikacja sądzi.
 */
export function pozaSkalaMaterialu(
  sredniaC: number | null,
  profile: MaterialProfile | null,
): boolean {
  if (sredniaC === null || !profile) return false;
  return sredniaC < profile.scaleMin || sredniaC > profile.scaleMax;
}
