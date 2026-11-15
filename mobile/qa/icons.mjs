/** Render app icons from SVG with system Chrome. node qa/icons.mjs */
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
const A = resolve(import.meta.dirname, '..', 'assets');
const arm = (stroke = true) => `
  <g transform="translate(300 700) rotate(-38)">
    <rect x="0" y="-38" width="560" height="76" rx="38" fill="#FFFFFF"/>
    <clipPath id="c"><rect x="0" y="-38" width="560" height="76" rx="38"/></clipPath>
    <g clip-path="url(#c)">${[0, 1, 2, 3].map((i) => `<rect x="${130 + i * 120}" y="-60" width="56" height="120" fill="#E5353F" transform="skewX(-25)"/>`).join('')}</g>
  </g>
  <rect x="236" y="640" width="128" height="170" rx="28" fill="${stroke ? '#4A5361' : '#FFFFFF'}"/>
  <circle cx="300" cy="700" r="30" fill="#4DA3FF"/>
  <rect x="160" y="800" width="704" height="22" rx="11" fill="#FFFFFF" opacity="0.35"/>`;
const bg = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A2433"/><stop offset="1" stop-color="#05070A"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/>`;
const svg = (body, size = 1024, transparent = false) =>
  `<html><body style="margin:0;background:${transparent ? 'transparent' : '#000'}"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg></body></html>`;
const out = [
  ['icon.png', svg(bg + arm()), 1024, false],
  ['splash-icon.png', svg(arm(), 1024, true), 1024, true],
  ['android-icon-foreground.png', svg(`<g transform="translate(112 112) scale(0.78)">${arm()}</g>`, 1024, true), 1024, true],
  ['android-icon-background.png', svg(bg), 1024, false],
  ['android-icon-monochrome.png', svg(`<g transform="translate(112 112) scale(0.78)">${arm(false).replaceAll('#E5353F', '#FFFFFF').replaceAll('#4DA3FF', '#FFFFFF')}</g>`, 1024, true), 1024, true],
  ['favicon.png', svg(bg + arm(), 48), 48, false],
];
const b = await chromium.launch({ channel: 'chrome' });
for (const [name, html, size, transparent] of out) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(html);
  await p.screenshot({ path: resolve(A, name), omitBackground: transparent });
  await p.close();
  console.log(name);
}
await b.close();
