/**
 * Kroje pisma — IBM Plex Sans + IBM Plex Mono, PODAWANE Z WŁASNEGO SERWERA.
 *
 * Nie z Google Fonts. Publiczny adres aplikacji nie powinien przy każdym
 * wejściu odpytywać cudzego serwera, a stanowisko badawcze stoi za routerem
 * z kartą SIM — im mniej obcych połączeń, tym mniej rzeczy może nie odpowiedzieć.
 * Paczki `@fontsource/*` to same pliki woff2 z arkuszami `@font-face`; Vite
 * wciąga je do `dist` i wersjonuje razem z resztą.
 *
 * DWA PODZBIORY ZNAKÓW, OBA POTRZEBNE. `latin` nie zawiera polskich ogonków
 * (poza „ó"), więc bez `latin-ext` przeglądarka podstawiałaby pod ą, ć, ę, ł, ń,
 * ś, ź, ż inny krój — w środku wyrazu. Wygląda to jak błąd składu i było widać
 * właśnie na słowie „ciepła".
 *
 * Grubości wybrane pod arkusz: 400 (treść), 500 (odczyty), 600 (podpisy,
 * najczęstsza), 700 (nagłówki). Plex nie ma 800 — nie ma go po co wołać, bo
 * przeglądarka pogrubiłaby 700 sztucznie.
 */

import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-ext-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-ext-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-ext-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-sans/latin-ext-700.css';

import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-ext-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-ext-600.css';
