/**
 * Ikony pogodowe — Meteocons (Bas Milius), licencja MIT.
 *
 * Pakiet: @bybas/weather-icons. Bierzemy warianty `fill`, czyli kolorowe
 * i animowane SVG — te same, których używają serwisy pogodowe. Nie rysujemy
 * własnych: gotowy zestaw jest lepszy niż cokolwiek, co dałoby się tu
 * naprędce narysować, a licencja MIT na to pozwala.
 *
 * WCZYTUJEMY JE JAKO ADRESY (`?url`) i wstawiamy zwykłym `<img>`, a nie jako
 * kod SVG w drzewie Reacta. Każda waży 0,7–2 kB, czyli poniżej progu 4 kB,
 * więc Vite i tak wpisuje je w paczkę jako dane — nie ma dodatkowych zapytań
 * do serwera i ikony działają bez sieci. Zysk z `<img>` jest inny: animacja
 * chodzi w obrazku, poza drzewem Reacta, więc żaden odczyt sond jej nie
 * przerysowuje.
 */

import thermometerUrl from '@bybas/weather-icons/production/fill/all/thermometer.svg?url';
import humidityUrl from '@bybas/weather-icons/production/fill/all/humidity.svg?url';
import windsockUrl from '@bybas/weather-icons/production/fill/all/windsock.svg?url';
import uvUrl from '@bybas/weather-icons/production/fill/all/uv-index.svg?url';
import clearDayUrl from '@bybas/weather-icons/production/fill/all/clear-day.svg?url';
import clearNightUrl from '@bybas/weather-icons/production/fill/all/clear-night.svg?url';
import partlyCloudyUrl from '@bybas/weather-icons/production/fill/all/partly-cloudy-day.svg?url';
import cloudyUrl from '@bybas/weather-icons/production/fill/all/cloudy.svg?url';
import rainUrl from '@bybas/weather-icons/production/fill/all/rain.svg?url';

export const IKONY = {
  temperatura: thermometerUrl,
  wilgotnosc: humidityUrl,
  wiatr: windsockUrl,
  napromienienie: uvUrl,
} as const;

/**
 * Ikona nieba dobrana do opisu z serwera i do pory dnia.
 *
 * Opisy przychodzą po polsku z modułu pogody (`bezchmurnie`, `przejaśnienia`,
 * `zachmurzenie`, `deszcz`…), więc dopasowujemy po fragmencie słowa, a nie po
 * pełnym tekście — inaczej każda odmiana wymagałaby osobnego wpisu.
 */
export function ikonaNieba(opis: string | null, zachmurzenie: number | null): string {
  const t = (opis ?? '').toLowerCase();

  if (/deszcz|opad|mżaw/.test(t)) return rainUrl;
  if (/pochmur|zachmurz/.test(t)) return cloudyUrl;
  if (/przejaśn|częściow|umiarkowan/.test(t)) return partlyCloudyUrl;

  // Bez opisu decyduje zachmurzenie, a przy jego braku — pora dnia.
  if (zachmurzenie !== null) {
    if (zachmurzenie >= 70) return cloudyUrl;
    if (zachmurzenie >= 25) return partlyCloudyUrl;
  }

  const godzina = new Date().getHours();
  return godzina >= 6 && godzina < 21 ? clearDayUrl : clearNightUrl;
}
