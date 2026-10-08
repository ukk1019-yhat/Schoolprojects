/**
 * UI smoke test: imports every render/ui module and runs a full draw pass
 * against a recording stub context. Catches missing exports, bad field names
 * and NaN coordinates in drawing code without needing a browser.
 */
import { JSDOMStub, installDom } from './dom-stub.mjs';
installDom();
// storage.js reads localStorage at import time; give it a tiny stand-in.
const mem = new Map();
globalThis.localStorage = globalThis.localStorage || {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

import { allLevels, getLevel, LEVEL_IDS } from '../src/game/levels.js';
import { achievementProgress } from '../src/core/achievements.js';
import { Game } from '../src/game/game.js';
import { Camera } from '../src/core/camera.js';
import { Renderer } from '../src/render/renderer.js';
import { Hud } from '../src/ui/hud.js';
import { Screens } from '../src/ui/screens.js';
import { TouchControls } from '../src/ui/touch.js';
import { UIManager } from '../src/ui/uiManager.js';
import { STATE, FIXED_DT, VIEW_W, VIEW_H } from '../src/game/constants.js';

const dom = new JSDOMStub();
const { ctx, stats } = dom;

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`[ok]   ${name}`);
  } catch (err) {
    failures++;
    console.log(`[FAIL] ${name}\n       ${err.message}`);
  }
}

check('six levels load', () => {
  const ids = allLevels().map((l) => l.id);
  if (ids.length !== 6) throw new Error(`expected 6 levels, got ${ids.length}`);
  if (ids[0] !== 'rooftops') throw new Error(`unexpected first level ${ids[0]}`);
});

const _held = new Set();
const fakeInput = {
  held: _held,
  pressedSet: new Set(),
  get axisX() {
    return (_held.has('right') ? 1 : 0) - (_held.has('left') ? 1 : 0);
  },
  get axisY() {
    return (_held.has('down') ? 1 : 0) - (_held.has('up') ? 1 : 0);
  },
  isDown: (a) => _held.has(a),
  wasPressed: (a) => false,
  wasReleased: () => false,
  pointer: { x: 0, y: 0, active: false, clicked: false },
  enabled: true,
  endFrame() {},
  releaseAll() {
    _held.clear();
  },
  virtualPress(a) {
    _held.add(a);
  },
  virtualRelease(a) {
    _held.delete(a);
  },
  onKey: () => () => {},
  canvas: null,
};

for (const lv of allLevels()) {
  check(`draw ${lv.id}`, () => {
    const level = getLevel(lv.id);
    const game = new Game(level, {});
    const cam = new Camera(VIEW_W, VIEW_H);
    cam.setBoundsRect(level.bounds);
    cam.snapTo(game.player.cx, game.player.cy);
    const r = new Renderer(ctx);
    r.setLevel(level);
    const hud = new Hud();

    // A few sim steps so entities are in interesting states.
    for (let i = 0; i < 240; i++) game.update(FIXED_DT, fakeInput, null);
    // Then force a swing so web drawing paths run too.
    game.web.shoot({ x: game.player.cx + 400, y: game.player.cy - 400 });
    for (let i = 0; i < 3; i++) {
      game.update(FIXED_DT, fakeInput, null);
      cam.update(1 / 60, game.getCameraTarget(), {});
      r.render({ game, camera: cam, baseScale: 1 });
hud.draw(ctx, {
        game,
        camera: cam,
        viewW: VIEW_W,
        viewH: VIEW_H,
        progress: game.getProgress(),
        level,
      });
    }
    if (stats.calls < 100) throw new Error(`suspiciously few draw calls: ${stats.calls}`);
  });
}

check('all screens draw', () => {
  const s = new Screens();
  const levels = allLevels().map((l) => ({ ...l, icon: 'ðŸ•¸ï¸' }));
  const progress = { rooftops: { cleared: true, bestTime: 61, stars: 9, rating: 3 } };
  const unlocked = (i, ids) => i === 0 || progress[ids[i - 1]]?.cleared;
  const settings = { musicVolume: 0.7, sfxVolume: 0.8, reducedEffects: false, showTouch: false, tutorial: 'auto' };

  const p = { x: -10, y: -10, active: false };
  s.title(ctx, VIEW_W, VIEW_H, p);
  s.levelSelect(ctx, VIEW_W, VIEW_H, levels, unlocked, progress, p);
  s.character(ctx, VIEW_W, VIEW_H, 'classic', p);
  s.howToPlay(ctx, VIEW_W, VIEW_H, p);
  s.achievements(ctx, VIEW_W, VIEW_H, achievementProgress(LEVEL_IDS), p);
  s.settings(ctx, VIEW_W, VIEW_H, settings, p);
  s.pause(ctx, VIEW_W, VIEW_H, { coins: 12, stars: 3, tokens: 1 }, p);
  s.gameOver(ctx, VIEW_W, VIEW_H, p);
  s.levelComplete(ctx, VIEW_W, VIEW_H, LEVEL_META_(), { coins: 40, stars: 5, tokens: 2, time: 71, enemiesWebbed: 4 }, 3, false, p, 4321, []);
  s.levelComplete(ctx, VIEW_W, VIEW_H, LEVEL_META_(), { coins: 40, stars: 5, tokens: 2, time: 71, enemiesWebbed: 4 }, 3, true, p, 4321, []);
  s.finalVictory(ctx, VIEW_W, VIEW_H, 12345, p);
});

check('no screen produces duplicate or overlapping buttons', () => {
  const s = new Screens();
  const p = { x: -10, y: -10, active: false };
  const stats = { coins: 40, stars: 5, tokens: 2, time: 71, enemiesWebbed: 4 };
  const cases = [
    ['title', () => s.title(ctx, VIEW_W, VIEW_H, p)],
    ['achievements', () => s.achievements(ctx, VIEW_W, VIEW_H, achievementProgress(LEVEL_IDS), p)],
    ['level complete', () => s.levelComplete(ctx, VIEW_W, VIEW_H, LEVEL_META_(), stats, 2, false, p, 4321, [])],
    ['victory', () => s.finalVictory(ctx, VIEW_W, VIEW_H, 12345, p)],
    ['pause', () => s.pause(ctx, VIEW_W, VIEW_H, stats, p)],
    ['settings', () => s.settings(ctx, VIEW_W, VIEW_H, { musicVolume: 0.7, sfxVolume: 0.8, tutorial: 'auto', reducedEffects: false, showTouch: false }, p)],
  ];
  for (const [name, draw] of cases) {
    const regions = draw();
    const ids = regions.map((r) => r.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error(`${name}: duplicate region ids [${ids.join(', ')}]`);
    }
    for (const r of regions) {
      const { x, y, w, h } = r.rect;
      if (!(x >= 0 && y >= 0 && x + w <= VIEW_W && y + h <= VIEW_H)) {
        throw new Error(`${name}: region ${r.id} is off screen`);
      }
      if (![x, y, w, h].every(Number.isFinite)) throw new Error(`${name}: region ${r.id} has non-finite geometry`);
    }
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i].rect;
        const b = regions[j].rect;
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        if (overlap) throw new Error(`${name}: ${regions[i].id} overlaps ${regions[j].id}`);
      }
    }
  }
});

function LEVEL_META_() {
  return { id: 'rooftops', name: 'FIRST SWING', icon: 'ðŸ•¸ï¸' };
}

check('UIManager routes clicks', () => {
  const ui = new UIManager(fakeInput, { click() {} });
  ui.pointer = { x: 0, y: 0, active: true };
  ui.render(STATE.MENU, ctx, {});
  if (ui.regions.length < 3) throw new Error(`expected title regions, got ${ui.regions.length}`);
  const play = ui.regions.find((r) => r.id === 'play');
  if (!play) throw new Error('no PLAY region');
  ui.pointer = { x: play.rect.x + 4, y: play.rect.y + 4, active: true };
  ui.render(STATE.MENU, ctx, {});
  if (ui.hoverId !== 'play') throw new Error(`hover was ${ui.hoverId}`);
  fakeInput.pointer.clicked = true;
  const got = ui.pollClick(STATE.MENU);
  if (got !== 'play') throw new Error(`click returned ${got}`);
  fakeInput.pointer.clicked = false;
});

check('touch controls hit test', () => {
  const canvas = {
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: VIEW_W, height: VIEW_H }),
  };
  const tc = new TouchControls(fakeInput, canvas);
  tc.setVisible(true);
  tc.draw(ctx, 1);
  const jump = tc.buttons.find((b) => b.id === 'jump');
  if (!jump) throw new Error('no jump button');
  const ids = tc.buttons.map((b) => b.id);
  for (const need of ['left', 'right', 'up', 'jump', 'web', 'release', 'boost']) {
    if (!ids.includes(need)) throw new Error(`missing button ${need}`);
  }
  tc.destroy();
});

check('hero is framed on screen at spawn', () => {
  const level = getLevel('rooftops');
  const game = new Game(level, {});
  const cam = new Camera(VIEW_W, VIEW_H);
  cam.setBoundsRect(level.bounds);
  cam.snapTo(game.player.cx, game.player.cy);
  for (let i = 0; i < 60; i++) cam.update(1 / 60, game.getCameraTarget(), {});
  const s = cam.worldToScreen(game.player.cx, game.player.cy);
  if (s.x < 0 || s.x > VIEW_W || s.y < 0 || s.y > VIEW_H) {
    throw new Error(`hero off screen at ${Math.round(s.x)},${Math.round(s.y)}`);
  }
  const onRoof = level.solids.some((r) => r.kind === 'building' && Math.abs(r.y - (game.player.y + game.player.h)) < 6);
  if (!onRoof && Math.abs(game.player.y + game.player.h - level.groundY) > 6) {
    throw new Error(`hero is not standing on anything (y=${Math.round(game.player.y)})`);
  }
});

check('no NaN after 200 steps', () => {
  const level = getLevel('rooftops');
  const game = new Game(level, {});
  const cam = new Camera(VIEW_W, VIEW_H);
  cam.setBoundsRect(level.bounds);
  for (let i = 0; i < 200; i++) {
    cam.update(1 / 60, game.getCameraTarget(), {});
    game.update(FIXED_DT, fakeInput, null);
  }
  for (const [k, v] of Object.entries({ camX: cam.x, camY: cam.y, zoom: cam.zoom, px: game.player.x, py: game.player.y })) {
    if (!Number.isFinite(v)) throw new Error(`non-finite ${k}=${v}`);
  }
});

console.log(`\n${stats.calls} draw calls issued`);
if (stats.badNumbers.length) {
  failures++;
  console.log(`[FAIL] non-finite draw args:\n       ${[...new Set(stats.badNumbers)].slice(0, 8).join('\n       ')}`);
}
if (failures) {
  console.log(`\n${failures} UI CHECK(S) FAILED`);
  process.exit(1);
}
console.log('UI OK');
void STATE;
