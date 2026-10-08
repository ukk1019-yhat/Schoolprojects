/**
 * Browser test: loads the real page in Chromium, plays the menus and levels
 * with synthetic input, and fails on any console error, page error or stuck
 * state. Also captures screenshots for a visual sanity check.
 */
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const PORT = 8123;
const server = await startServer(PORT);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

let failures = 0;
const ok = (name) => console.log(`[ok]   ${name}`);
const bad = (name, why) => {
  failures++;
  console.log(`[FAIL] ${name}\n       ${why}`);
};

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

let boot = await page.evaluate(() => ({
  hasApp: !!window.__game,
  state: window.__game?.state,
  err: document.getElementById('err').textContent.trim(),
  canvasW: document.getElementById('game').width,
}));
if (!boot.hasApp && !boot.err) {
  // Module scripts can lose a race against the static server on a cold start;
  // one reload separates that from a genuine load failure.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  boot = await page.evaluate(() => ({
    hasApp: !!window.__game,
    state: window.__game?.state,
    err: document.getElementById('err').textContent.trim(),
    canvasW: document.getElementById('game').width,
  }));
}
if (!boot.hasApp) bad('app boots', `window.__game missing. on-page error: ${boot.err}`);
else ok(`app boots (canvas ${boot.canvasW}px, state ${boot.state})`);
if (boot.err) bad('no load errors', boot.err);
if (!boot.hasApp) {
  await browser.close();
  server.close();
  console.log(`\n${failures} BROWSER CHECK(S) FAILED`);
  process.exit(1);
}

/**
 * Reads the canvas back and reports how much visual variety is on screen.
 * Catches "renders a flat colour" bugs that a smoke test cannot see.
 */
const canvasStats = () => page.evaluate(() => {
  const c = document.getElementById('game');
  const off = document.createElement('canvas');
  off.width = 160;
  off.height = 100;
  const g = off.getContext('2d');
  g.drawImage(c, 0, 0, off.width, off.height);
  const d = g.getImageData(0, 0, off.width, off.height).data;
  const seen = new Set();
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  let nonBlack = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const gg = d[i + 1];
    const b = d[i + 2];
    const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    sum += lum;
    sum2 += lum * lum;
    n++;
    if (lum > 12) nonBlack++;
    seen.add((r >> 4) << 8 | (gg >> 4) << 4 | (b >> 4));
  }
  const mean = sum / n;
  return {
    colors: seen.size,
    mean,
    stdev: Math.sqrt(Math.max(0, sum2 / n - mean * mean)),
    litFraction: nonBlack / n,
  };
});

const checkVisual = async (label) => {
  const s = await canvasStats();
  const why = [];
  if (s.colors < 12) why.push(`only ${s.colors} distinct colours`);
  if (s.stdev < 8) why.push(`flat image (stdev ${s.stdev.toFixed(1)})`);
  if (s.litFraction < 0.5) why.push(`mostly dark (${(s.litFraction * 100).toFixed(0)}% lit)`);
  if (why.length) bad(`visual ${label}`, why.join(', '));
  else ok(`visual ${label} (${s.colors} colours, stdev ${s.stdev.toFixed(0)}, ${(s.litFraction * 100).toFixed(0)}% lit)`);
};

await page.screenshot({ path: 'tests/shot-menu.png' });
await checkVisual('title screen');

/** Clicks a region id through the app's own menu layout. */
const clickRegion = async (want) => {
  const box = await page.evaluate((id) => {
    const app = window.__game;
    const r = app.ui.regions.find((x) => x.id === id);
    return r ? r.rect : null;
  }, want);
  if (!box) return false;
  const c = await page.locator('#game').boundingBox();
  const sc = c.width / 960;
  await page.mouse.click(c.x + (box.x + box.w / 2) * sc, c.y + (box.y + box.h / 2) * sc);
  await page.waitForTimeout(250);
  return true;
};

if (await clickRegion('select')) ok('level select opens');
else bad('level select opens', 'button region not found');
await page.screenshot({ path: 'tests/shot-select.png' });

const selState = await page.evaluate(() => window.__game.state);
if (selState === 'LEVEL_SELECT') ok('state is LEVEL_SELECT');
else bad('state is LEVEL_SELECT', `got ${selState}`);

// Back to the title, then straight into gameplay.
await clickRegion('back');
if (await clickRegion('play')) ok('PLAY starts a level');
else bad('PLAY starts a level', 'no play region');
await page.waitForTimeout(400);

const playing = await page.evaluate(() => window.__game.state);
if (playing === 'PLAYING') ok('state is PLAYING');
else bad('state is PLAYING', `got ${playing}`);

/** Hammer movement + jump so real physics and drawing get exercised. */
const playWithKeys = async (seconds) => {
  const before = await page.evaluate(() => ({
    x: window.__game.game.player.x,
    y: window.__game.game.player.y,
  }));
  const keys = ['KeyD', 'Space', 'KeyD', 'KeyE', 'KeyW', 'KeyA', 'Space', 'ShiftLeft'];
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < seconds * 1000) {
    const k = keys[i % keys.length];
    await page.keyboard.down(k);
    await page.waitForTimeout(90);
    await page.keyboard.up(k);
    i++;
  }
  const st = await page.evaluate(() => {
    const g = window.__game.game;
    return {
      x: g.player.x,
      y: g.player.y,
      time: g.time,
      hearts: g.player.hearts,
      stars: g.stats.stars,
      coins: g.stats.coins,
      finite: Number.isFinite(g.player.x) && Number.isFinite(g.player.y),
      parts: g.particles ? true : false,
    };
  });
  if (!st.finite) return { ok: false, why: 'player position went non-finite', st };
  if (st.time <= 0) return { ok: false, why: 'simulation did not advance', st };
  if (st.y === before.y && st.x === before.x) return { ok: false, why: 'player never moved', st };
  return { ok: true, st };
};

const r1 = await playWithKeys(4);
if (r1.ok) ok(`level 1 plays (t=${r1.st.time.toFixed(1)}s, coins=${r1.st.coins}, stars=${r1.st.stars})`);
else bad('level 1 plays', r1.why);
await page.screenshot({ path: 'tests/shot-game.png' });
await checkVisual('gameplay');

// Every level must boot and render in the real browser.
for (const idx of [1, 2, 3, 4, 5]) {
  await page.evaluate((i) => window.__game.startLevel(i), idx);
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => ({
    id: window.__game.level?.id,
    finite: Number.isFinite(window.__game.game.player.x),
    err: document.getElementById('err').textContent.trim(),
  }));
  if (st.finite && !st.err) ok(`level ${idx} (${st.id}) renders`);
  else bad(`level ${idx} renders`, st.err || 'player non-finite');
}
await checkVisual('level 6');

// Pause round trip.
await page.evaluate(() => window.__game.startLevel(0));
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const paused = await page.evaluate(() => window.__game.state);
if (paused === 'PAUSED') ok('pause works');
else bad('pause works', `state is ${paused}`);
await page.screenshot({ path: 'tests/shot-pause.png' });

await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const resumed = await page.evaluate(() => window.__game.state);
if (resumed === 'PLAYING') ok('resume works');
else bad('resume works', `state is ${resumed}`);

// The on-screen pause button must work too.
if (await clickRegion('pause')) {
  const s = await page.evaluate(() => window.__game.state);
  if (s === 'PAUSED') ok('on-screen pause button works');
  else bad('on-screen pause button works', `state is ${s}`);
} else bad('on-screen pause button works', 'pause region missing');
await page.evaluate(() => { if (window.__game.state === 'PAUSED') window.__game._setState('PLAYING'); });

// Frame budget: how long the game's own update + render take. This is a
// property of the code, unlike raw rAF throughput which measures the machine.
const budget = await page.evaluate(async () => {
  window.__game.startLevel(0);
  await new Promise((res) => setTimeout(res, 300));
  const app = window.__game;
  let renderMs = 0;
  let updateMs = 0;
  let rafFps = 0;
  const frames = await new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
      n++;
      if (performance.now() - t0 > 2000) res(n);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    rafFps = (n / (performance.now() - t0)) * 1000;
  });
  rafFps = (frames / 2000) * 1000;
  const N = 60;
  for (let i = 0; i < N; i++) {
    const a = performance.now();
    app._step(1 / 120);
    const b = performance.now();
    app._draw();
    const c = performance.now();
    updateMs += b - a;
    renderMs += c - b;
  }
  return { renderMs: renderMs / N, updateMs: updateMs / N, rafFps };
});
const total = budget.renderMs + budget.updateMs;
console.log(
  `       frame budget: ${budget.renderMs.toFixed(2)}ms render + ${budget.updateMs.toFixed(2)}ms update ` +
  `= ${total.toFixed(2)}ms (rAF ${budget.rafFps.toFixed(0)} fps)`,
);
if (total <= 8) ok(`frame budget ${total.toFixed(2)}ms of 16.7ms`);
else bad('frame budget', `${total.toFixed(2)}ms per frame (over 8ms)`);

if (errors.length) bad('no console errors', [...new Set(errors)].slice(0, 6).join('\n       '));
else ok('no console errors');

await browser.close();
server.close();

if (failures) {
  console.log(`\n${failures} BROWSER CHECK(S) FAILED`);
  process.exit(1);
}
console.log('\nBROWSER OK');