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
 * Wartości poza skalą materiału przycinamy — magazyn nie bywa naładowany
 * na minus ani na 130%.
 */
export function naladowanieProcent(
  sredniaC: number | null,
  profile: MaterialProfile | null,
): number | null {
  if (sredniaC === null || !profile) return null;

  const rozpietosc = profile.scaleMax - profile.scaleMin;
  if (rozpietosc <= 0) return null;

  const udzial = (sredniaC - profile.scaleMin) / rozpietosc;
  return Math.round(Math.min(1, Math.max(0, udzial)) * 100);
}
