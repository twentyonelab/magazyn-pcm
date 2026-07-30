// Kontrola nowego schematu: czy parsuje sie i czy widok 3D go odczyta.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const svg = fs.readFileSync('web/src/schema/schema.svg', 'utf8');

// extractScene uzywa DOMParser — podstawiamy przegladarkowe API.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
(globalThis as any).DOMParser = dom.window.DOMParser;

const { extractScene, parsePolylines } = await import('./web/src/schema/extractScene.js');

const scena = extractScene(svg);

console.log('viewBox:', scena.viewBox.width, 'x', scena.viewBox.height);
console.log('\nBRYLY 3D:');
for (const o of scena.objects) {
  console.log(`  ${o.id.padEnd(10)} "${o.label}" h=${o.height} vessel=${o.vessel} stan=${o.statePoint ?? '-'}`);
}
console.log('\nSONDY:', scena.sensors.length);
for (const s of scena.sensors) {
  console.log(`  ${s.pointId.padEnd(14)} w zbiorniku: ${s.vesselId ?? '-'}`);
}
console.log('\nRURY:', scena.pipes.length, 'odcinkow');
for (const p of scena.pipes) {
  console.log(`  ${p.points.length} punktow, powrot: ${p.isReturn}, zrodlo: ${p.flowSource}`);
}

// Klikalne elementy instalacji
const doc = new dom.window.DOMParser().parseFromString(svg, 'image/svg+xml');
const blad = doc.querySelector('parsererror');
console.log('\nblad parsowania XML:', blad ? blad.textContent?.slice(0, 120) : 'BRAK — poprawny XML');

const elementy = [...doc.querySelectorAll('[data-element]')].map((e) => e.getAttribute('data-element'));
console.log('klikalne elementy:', elementy.join(', '));

const usuniete = ['inset', 'rzut z góry', 'exchanger'];
for (const u of usuniete) {
  console.log(`usunieto "${u}":`, svg.includes(u) ? 'NIE — nadal jest' : 'tak');
}
