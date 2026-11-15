/**
 * Visual QA: serve the web export (../dist) with SPA fallback, drive the app via
 * window.__m010 (src/utils/qaHook.ts) and screenshot every screen/state at 390x844,
 * light and dark. Uses the system Chrome (playwright-core, channel 'chrome').
 *
 *   cd mobile && npx expo export -p web --output-dir dist && cd qa && node shoot.mjs [filter]
 *
 * Output: qa/out/<scheme>/<name>.png and qa/out/manifest.json
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const OUT = resolve(import.meta.dirname, 'out');
const PORT = 8765;
const filter = process.argv[2] ?? '';

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = join(DIST, url);
  try {
    if (!(await stat(file)).isFile()) throw new Error('dir');
  } catch {
    file = join(DIST, 'index.html');
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((r) => server.listen(PORT, r));

const BASE = `http://localhost:${PORT}`;
const ONBOARDED = { transport: 'sim', theme: 'system', onboarded: true, haptics: true, lastDeviceId: 'sim-m010-barrier', lastDeviceName: 'M010-Barrier', presenterUnlocked: true };

/** helpers evaluated in the page */
const connectSim = async (page) => {
  await page.evaluate(async () => {
    const t = window.__m010.getTransport();
    if (t.getSnapshot().phase !== 'ready') await t.connect('sim-m010-barrier');
  });
  await page.waitForTimeout(400);
};
const cmd = (op) => async (page) => {
  await page.evaluate(async (o) => {
    await window.__m010.getTransport().sendCommand(o).catch(() => null);
  }, op);
};
const sim = (fn, arg) => async (page) => page.evaluate(fn, arg);
const clickText = (re, times = 1, waitMs = 1500) => async (page) => {
  for (let i = 0; i < times; i++) {
    await page.getByRole('button', { name: re }).first().click();
    await page.waitForTimeout(waitMs);
  }
};
const NOT_ONBOARDED = { transport: 'sim', theme: 'system', onboarded: false, haptics: true, lastDeviceId: null, lastDeviceName: null, presenterUnlocked: false };

/** name, route, settings, setup steps, settle ms */
const SHOTS = [
  { name: 'onboarding-welcome', route: '/onboarding', settings: { ...ONBOARDED, onboarded: false } },
  { name: 'control-disconnected', route: '/', settings: { ...ONBOARDED, lastDeviceId: null, lastDeviceName: null } },
  { name: 'control-lowered', route: '/', setup: [connectSim] },
  { name: 'control-raising', route: '/', setup: [connectSim, cmd(1)], settle: 900 },
  { name: 'control-raised', route: '/', setup: [connectSim, cmd(1)], settle: 5000 },
  {
    name: 'control-stopped',
    route: '/',
    setup: [connectSim, cmd(1), async (p) => p.waitForTimeout(1200), cmd(3)],
  },
  {
    name: 'control-guard-reject',
    route: '/',
    setup: [connectSim, sim(() => window.__m010.getSim().device.setSensors({ zoneClear: false })), cmd(1)],
  },
  {
    name: 'control-fault',
    route: '/',
    setup: [connectSim, sim(() => window.__m010.getSim().device.injectFault(2))],
  },
  {
    name: 'control-unknown',
    route: '/',
    setup: [connectSim, sim(() => window.__m010.getSim().device.rebootBetweenLimits())],
  },
  {
    name: 'control-link-lost',
    route: '/',
    setup: [connectSim, cmd(1), sim(() => window.__m010.getSim().device.dropOwner())],
  },
  { name: 'connect-modal', route: '/connect', settle: 1500 },
  { name: 'health-connected', route: '/health', setup: [connectSim, cmd(1)], settle: 5000 },
  { name: 'health-disconnected', route: '/health' },
  { name: 'log', route: '/log', setup: [connectSim, cmd(1), cmd(3), cmd(2)], settle: 1500 },
  { name: 'settings', route: '/settings' },
  { name: 'presenter', route: '/presenter' },
  { name: 'onboarding-mode', route: '/onboarding/mode', settings: NOT_ONBOARDED },
  { name: 'onboarding-bluetooth', route: '/onboarding/bluetooth', settings: { ...NOT_ONBOARDED, transport: 'ble' } },
  { name: 'onboarding-enroll', route: '/onboarding/enroll', settings: NOT_ONBOARDED },
  { name: 'onboarding-done', route: '/onboarding/done', settings: NOT_ONBOARDED },
  { name: 'settings-device', route: '/settings/device', setup: [connectSim] },
  { name: 'settings-about', route: '/settings/about' },
  {
    name: 'guard-details',
    route: '/guard-details',
    setup: [connectSim, sim(() => window.__m010.getSim().device.setSensors({ zoneClear: false })), cmd(1)],
  },
  {
    name: 'connect-pairing',
    route: '/connect',
    settings: { ...ONBOARDED, lastDeviceId: null },
    setup: [
      // slow the simulated Session read so the pairing step is on screen when captured
      sim(() => {
        window.__m010.getSim().device.timings.sessionMs = 8000;
      }),
      async (p) => p.waitForTimeout(1500),
      async (p) => p.getByText('M010-Barrier').first().click(),
    ],
    settle: 900,
  },
  { name: 'presenter-obstruction-start', route: '/presenter/obstruction', settle: 1200 },
  { name: 'presenter-obstruction-step3', route: '/presenter/obstruction', setup: [clickText(/^Next/, 3, 2500)] },
  { name: 'presenter-limit-conflict', route: '/presenter/limit-conflict', setup: [clickText(/^Next/, 3, 5000)] },
  { name: 'presenter-replayed-command', route: '/presenter/replayed-command', setup: [clickText(/^Next/, 2, 2500)] },
  {
    name: 'presenter-auth-latency',
    route: '/presenter/auth-latency',
    setup: [
      clickText(/^Next/, 1, 12000),
      async (p) => {
        // the latency card sits below the step card: scroll it into view
        await p.mouse.move(195, 400);
        await p.mouse.wheel(0, 900);
      },
    ],
  },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const manifest = [];
for (const scheme of ['light', 'dark']) {
  await mkdir(join(OUT, scheme), { recursive: true });
  for (const s of SHOTS.filter((x) => x.name.includes(filter))) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
      isMobile: true,
      hasTouch: true,
    });
    await ctx.addInitScript((settings) => {
      localStorage.setItem('m010.settings.v1', JSON.stringify(settings));
    }, s.settings ?? ONBOARDED);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    // load the app at root first so the QA hook exists, then navigate client-side
    await page.goto(BASE + s.route, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__m010, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    for (const step of s.setup ?? []) await step(page);
    await page.waitForTimeout(s.settle ?? 700);
    const file = join(OUT, scheme, `${s.name}.png`);
    await page.screenshot({ path: file });
    manifest.push({ scheme, name: s.name, route: s.route, file, errors });
    console.log(`${scheme}/${s.name}${errors.length ? `  ERRORS: ${errors.join(' | ')}` : ''}`);
    await ctx.close();
  }
}
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
server.close();
