/**
 * Tutorial test: the coach must be able to reach the end without ever
 * soft-locking, must point at something real, and must respect the
 * tutorial setting. A step whose predicate can never fire would leave a
 * kid stuck on one instruction forever, so every step is driven to done.
 */
const mem = new Map();
globalThis.localStorage = globalThis.localStorage || {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

import { getLevel } from '../src/game/levels.js';
import { storage } from '../src/core/storage.js';
import { Game } from '../src/game/game.js';
import { Coach, TUTORIAL_STEPS, firstGap } from '../src/game/tutorial.js';
import { PLAYER_STATE } from '../src/game/constants.js';

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

const IDLE_INPUT = {
  held: new Set(),
  get axisX() {
    return 0;
  },
  get axisY() {
    return 0;
  },
  isDown: () => false,
  wasPressed: () => false,
  wasReleased: () => false,
  pointer: { x: 0, y: 0, active: false, clicked: false },
  enabled: true,
  endFrame() {},
  releaseAll() {},
  onKey: () => () => {},
  canvas: null,
};

function newGame(id = 'rooftops') {
  const level = getLevel(id);
  const game = new Game(level, {});
  game.levelIndex = 0;
  return game;
}

/** Runs the coach until it advances, so a stuck step fails loudly. */
function advance(game, maxSteps = 40) {
  for (let i = 0; i < maxSteps; i++) {
    const before = game.coach.index;
    game.coach.update(1 / 60);
    if (game.coach.index !== before) return game.coach.index;
  }
  throw new Error(`step ${game.coach.index} (${TUTORIAL_STEPS[game.coach.index]?.id}) never completed`);
}

check('tutorial starts on and shows a prompt', () => {
  const game = newGame();
  const coach = game.coach;
  if (!coach.enabled) throw new Error('coach disabled on the first level');
  const p = coach.prompt;
  if (!p || !p.text) throw new Error('no prompt text');
  if (p.index !== 0) throw new Error(`expected step 0, got ${p.index}`);
  if (p.total !== coach.applicableCount()) throw new Error('step total mismatch');
  if (!TUTORIAL_STEPS[0].text.toLowerCase().includes('run')) throw new Error('first step should teach running');
});

check('every step can be completed (no soft lock)', () => {
  const game = newGame();
  const coach = game.coach;
  const p = game.player;

  // run: the hero simply moves right.
  p.x += 200;
  advance(game);
  if (TUTORIAL_STEPS[coach.index]?.id !== 'jump') throw new Error(`expected jump step, got ${TUTORIAL_STEPS[coach.index]?.id}`);

  // jump: leaves the ground.
  p.onGround = false;
  advance(game);
  if (TUTORIAL_STEPS[coach.index]?.id !== 'web') throw new Error(`expected web step, got ${TUTORIAL_STEPS[coach.index]?.id}`);

  // web: a rope exists.
  p.rope = { x: p.cx, y: p.cy - 200, len: 200 };
  advance(game);
  if (TUTORIAL_STEPS[coach.index]?.id !== 'pump') throw new Error(`expected pump step, got ${TUTORIAL_STEPS[coach.index]?.id}`);

  // pump: half a second of swinging.
  p.state = PLAYER_STATE.SWING;
  for (let i = 0; i < 40; i++) coach.update(1 / 60);
  if (TUTORIAL_STEPS[coach.index]?.id !== 'release') throw new Error(`expected release step, got ${TUTORIAL_STEPS[coach.index]?.id}`);

  // release: let go mid swing.
  p.rope = null;
  advance(game);

  // cross: standing on the far side of the very first gap.
  const gap = firstGap(game);
  if (!gap) throw new Error('level 1 has no gap to cross');
  p.x = gap.x + gap.w + 60;
  advance(game);
  if (TUTORIAL_STEPS[coach.index]?.id !== 'climb') throw new Error(`expected climb step, got ${TUTORIAL_STEPS[coach.index]?.id}`);

  // climb, coin, bot.
  p.state = PLAYER_STATE.CLIMB;
  advance(game);
  game.stats.coins = 1;
  advance(game);
  game.stats.enemiesWebbed = 1;
  advance(game);
  advance(game); // the final "you are ready" step

  if (!coach.finished) throw new Error('tutorial never finished');
  if (storage.get('tutorialDone') !== true) throw new Error('tutorialDone was not stored');
  const raw = localStorage.getItem('spider-web-swing.v1');
  if (!raw || !String(raw).includes('tutorialDone')) throw new Error('nothing was written to localStorage');
});

check('optional steps are skipped when they do not apply', () => {
  const game = newGame();
  game.level.enemies.length = 0; // a level with no bots to wrap
  const coach = game.coach;
  p_runTo(coach, game);
  game.stats.coins = 1;
  // Drive to the end; the bot step must be passed over, not block.
  for (let i = 0; i < 12 && !coach.finished; i++) {
    game.player.onGround = false;
    game.player.rope = { x: 1, y: 1 };
    game.player.state = PLAYER_STATE.SWING;
    for (let k = 0; k < 40; k++) coach.update(1 / 60);
    game.player.rope = null;
    const gap = firstGap(game);
    game.player.x = gap.x + gap.w + 60;
    game.player.state = PLAYER_STATE.CLIMB;
    for (let k = 0; k < 5; k++) coach.update(1 / 60);
  }
  if (!coach.finished) throw new Error(`stuck on ${TUTORIAL_STEPS[coach.index]?.id} with no enemies`);
});

function p_runTo(coach, game) {
  game.player.x += 200;
  coach.update(1 / 60);
}

check('the coach points at a real anchor above the gap', () => {
  const game = newGame();
  const coach = game.coach;
  game.player.x += 200; // -> jump
  coach.update(1 / 60);
  game.player.onGround = false;
  coach.update(1 / 60); // -> web
  const t = coach.target;
  if (!t) throw new Error('web step has no target to point at');
  if (t.y > game.player.y) throw new Error('target should be above the hero');
  if (t.x <= game.player.cx) throw new Error('target should be ahead of the hero');
  const known = game.level.anchors.some((a) => a.x === t.x && a.y === t.y);
  if (!known) throw new Error('target is not one of the level anchors');
  if (coach.prompt.hint !== 'Aim at a glowing ring above the gap') throw new Error('web step should tell the kid where to aim');
});

check('tutorial can be turned off and replayed', () => {
  storage.set('tutorial', 'off');
  const off = newGame();
  if (off.coach.enabled) throw new Error('coach should be off');
  if (off.coach.prompt) throw new Error('no prompt expected when off');

  storage.set('tutorial', 'on');
  const on = newGame();
  if (!on.coach.enabled) throw new Error('coach should be on');
  on.coach.index = 4;
  on.coach.restart();
  if (on.coach.index !== 0 || !on.coach.enabled) throw new Error('restart did not rewind the lesson');

  on.coach.index = 3;
  on.coach.skip();
  if (on.coach.enabled) throw new Error('skip did not disable the coach');
  if (storage.get('tutorialDone') !== true) throw new Error('skip should remember the choice');
  // A skipped lesson must stay away even on a brand new game...
  storage.set('tutorial', 'auto');
  if (newGame().coach.enabled) throw new Error('a skipped tutorial came back');
  // ...until it is asked for again.
  const back = newGame();
  back.coach.restart();
  if (!back.coach.enabled || storage.get('tutorialSkip') !== false) throw new Error('restart did not bring the lesson back');
});

if (failures) {
  console.log(`\n${failures} TUTORIAL CHECK(S) FAILED`);
  process.exit(1);
}
console.log('TUTORIAL OK');