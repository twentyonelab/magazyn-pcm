/**
 * Pobieranie tego, co jest na wykresie: liczby (CSV) i obraz (PNG).
 *
 * DWIE RZECZY, DWA POWODY. CSV idzie do obliczeń — to te same kubełki, które
 * właśnie widać, więc wynik w arkuszu zgadza się z wykresem na ekranie. PNG
 * idzie do raportu i do wiadomości: zrzut ekranu robi się szybciej, ale łapie
 * całą aplikację razem z belką stanu i nie da się go wkleić do dokumentu bez
 * obcinania.
 *
 * SNAPSHOT POWSTAJE Z SAMEGO SVG, nie ze zrzutu okna — przeglądarka nie daje
 * dostępu do pikseli strony. Trzeba więc odtworzyć wygląd: wykres jest
 * stylowany arkuszem aplikacji, a serializacja SVG zabiera tylko atrybuty,
 * więc kolory, grubości i kroje trzeba WPISAĆ w klon przed zapisem. Bez tego
 * wychodzi czarna kreska na przezroczystym tle — sprawdzone.
 */

import { useRef, useState } from 'react';
import { historyCsvUrl, type HistoryParams } from '../api.js';

/** Własności, które muszą wejść w klon — reszta wyglądu nie dotyczy rysunku. */
const WLASNOSCI = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
] as const;

function wpiszStyle(zrodlo: Element, klon: Element): void {
  const obliczone = getComputedStyle(zrodlo);
  let styl = '';
  for (const nazwa of WLASNOSCI) {
    const wartosc = obliczone.getPropertyValue(nazwa);
    if (wartosc) styl += `${nazwa}:${wartosc};`;
  }
  klon.setAttribute('style', styl);

  const dzieciZrodla = zrodlo.children;
  const dzieciKlonu = klon.children;
  for (let i = 0; i < dzieciZrodla.length; i += 1) {
    const a = dzieciZrodla[i];
    const b = dzieciKlonu[i];
    if (a && b) wpiszStyle(a, b);
  }
}

/** Nazwa pliku bez znaków, które psują zapis na dysku. */
function nazwaPliku(podstawa: string, rozszerzenie: string): string {
  const czyste = podstawa
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${czyste}.${rozszerzenie}`;
}

export function AkcjeWykresu({
  params,
  /** Do nazwy pliku PNG — np. „A3" albo „przebiegi". */
  nazwa,
  /** Klasa przycisków, żeby wpasować się w otoczenie (chip albo link). */
  wariant = 'chip',
}: {
  params: HistoryParams;
  nazwa: string;
  wariant?: 'chip' | 'link';
}) {
  const kotwica = useRef<HTMLDivElement>(null);
  const [pracuje, setPracuje] = useState(false);

  const zapiszSnapshot = async (): Promise<void> => {
    // Wykres jest RODZEŃSTWEM tych przycisków albo leży wyżej w karcie —
    // szukamy od wspólnego rodzica, nie po globalnym selektorze, żeby przy dwóch
    // wykresach na stronie każdy przycisk zapisywał swój.
    const karta = kotwica.current?.closest('.probe-panel, .card, .stack') ?? document;
    const svg = karta.querySelector('svg.chart, .chart svg, svg');
    if (!(svg instanceof SVGSVGElement)) return;

    setPracuje(true);
    try {
      const prostokat = svg.getBoundingClientRect();
      const szerokosc = Math.max(Math.round(prostokat.width), 1);
      const wysokosc = Math.max(Math.round(prostokat.height), 1);

      const klon = svg.cloneNode(true) as SVGSVGElement;
      klon.setAttribute('width', String(szerokosc));
      klon.setAttribute('height', String(wysokosc));
      klon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      wpiszStyle(svg, klon);

      // Tło z motywu, nie białe na sztywno: w trybie nocnym biała plansza pod
      // jasnymi napisami dałaby obraz, na którym nie widać nic.
      const tlo = getComputedStyle(document.body).backgroundColor || '#ffffff';
      const podklad = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      podklad.setAttribute('width', '100%');
      podklad.setAttribute('height', '100%');
      podklad.setAttribute('fill', tlo);
      klon.insertBefore(podklad, klon.firstChild);

      const zapis = new XMLSerializer().serializeToString(klon);
      const obraz = new Image();
      const gotowe = new Promise<void>((resolve, reject) => {
        obraz.onload = () => resolve();
        obraz.onerror = () => reject(new Error('nie udało się wczytać rysunku'));
      });
      obraz.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(zapis)}`;
      await gotowe;

      // Dwukrotna skala — wykres ma być czytelny po wklejeniu do dokumentu.
      const skala = 2;
      const plotno = document.createElement('canvas');
      plotno.width = szerokosc * skala;
      plotno.height = wysokosc * skala;
      const kontekst = plotno.getContext('2d');
      if (!kontekst) return;
      kontekst.scale(skala, skala);
      kontekst.drawImage(obraz, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) =>
        plotno.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nazwaPliku(`wykres-${nazwa}`, 'png');
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setPracuje(false);
    }
  };

  const klasa = wariant === 'link' ? 'link' : 'chip';

  return (
    <div className="akcje-wykresu" ref={kotwica}>
      <a
        className={klasa}
        href={historyCsvUrl(params)}
        download
        title="Te same kubełki, które widać na wykresie — do arkusza"
      >
        pobierz CSV
      </a>
      <button
        type="button"
        className={klasa}
        onClick={() => void zapiszSnapshot()}
        disabled={pracuje}
        title="Sam wykres jako obraz PNG, w podwójnej skali"
      >
        {pracuje ? 'zapisuję…' : 'pobierz snapshot'}
      </button>
    </div>
  );
}
