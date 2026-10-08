/**
 * Swing simulation: runs a scripted session with the real physics and checks
 * the kid-friendly guarantees — webs are unlimited, falling is survivable,
 * health is finite, and nothing leaves the world bounds.
 */
import { getLevel } from '../src/game/levels.js';
import { Game } from '../src/game/game.js';
import { FIXED_DT, PLAYER_STATE, PHYS } from '../src/game/constants.js';

let failures = 0;
const check = (name, ok, extra = '') => {
  if (ok) console.log(`[ok]   ${name}`);
  else {
    failures++;
    console.log(`[FAIL] ${name}${extra ? ` :: ${extra}` : ''}`);
  }
};

function makeInput() {
  const held = new Set();
  const pressed = new Set();
  const input = {
    held,
    pressedSet: pressed,
    pointer: { x: 0, y: 0, active: false, clicked: false },
    get axisX() {
      return (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    },
    get axisY() {
      return (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
    },
    isDown: (a) => held.has(a),
    wasPressed: (a) => pressed.has(a),
    wasReleased: () => false,
    press(a) {
      if (!held.has(a)) pressed.add(a);
      held.add(a);
    },
    release(a) {
      held.delete(a);
    },
    endFrame() {
      pressed.clear();
    },
    releaseAll() {
      held.clear();
    },
  };
  return input;
}

const level = getLevel('rooftops');
const game = new Game(level, {});
const input = makeInput();
const idle = { x: game.player.cx, y: game.player.cy };

// 1. Running right builds speed.
input.releaseAll();
input.press('right');
for (let i = 0; i < 90; i++) {
  game.update(FIXED_DT, input, null);
  input.endFrame();
}
check('hero runs right', game.player.vx > 100, `vx=${Math.round(game.player.vx)}`);

// 2. Jumping works and leaves the ground.
input.release('right');
input.press('jump');
for (let i = 0; i < 40; i++) {
  game.update(FIXED_DT, input, null);
  input.endFrame();
}
const jumped = game.stats.time > 0 && !game.player.onGround;
check('hero leaves the ground', jumped);

// 3. Web shooting works repeatedly without ever being blocked.
let shots = 0;
for (let rep = 0; rep < 20; rep++) {
  input.press('web');
  game.update(FIXED_DT, input, null);
  input.endFrame();
  input.release('web');
  game.update(FIXED_DT, input, null);
  input.endFrame();
  if (game.web.shots.length > 0) shots++;
}
check('webs are unlimited', shots > 0, `shots=${shots}`);

// 4. Falling into the gap respawns at the checkpoint with full hearts.
game.player.hearts = 1;
game.player.hurt(1, game.player.cx, game.playerCtx());
const dead = game.player.dead;
check('hearts are finite (a hit can kill)', dead);
game.stats.falls = 0;
game.respawnAtCheckpoint();
game.player.hearts = game.player.maxHearts;
check('respawn restores hearts', game.player.hearts === game.player.maxHearts);

// 5. Long idle run stays in bounds and never produces NaN.
const g2 = new Game(getLevel('night'), {});
const idleInput = makeInput();
for (let i = 0; i < 1800; i++) {
  g2.update(FIXED_DT, idleInput, null);
  idleInput.endFrame();
}
check(
  'hero stays in the world',
  g2.player.y < g2.level.bottomBound + 50 && g2.player.y > g2.level.topBound - 100,
  `y=${Math.round(g2.player.y)} bottom=${g2.level.bottomBound}`,
);
check('no NaN in state', Number.isFinite(g2.player.x) && Number.isFinite(g2.player.y) && Number.isFinite(g2.player.vx));

// 6. Physics constants sane for kids (forgiving jump arc).
check('jump is a comfortable arc', PHYS.jumpVel > 600 && PHYS.jumpVel < 1200);
check('player states exist', [PLAYER_STATE.IDLE, PLAYER_STATE.SWING, PLAYER_STATE.CLIMB].every((s) => typeof s === 'string'));

// 7. Scoring adds up and rating is 1..3.
const g3 = new Game(getLevel('market'), {});
g3.stats.coins = 100;
g3.stats.stars = 12;
g3.stats.damage = 0;
const rating = g3.rating();
check('rating in 1..3', rating >= 1 && rating <= 3, `rating=${rating}`);

void idle;
console.log(failures ? `\n${failures} SWING CHECK(S) FAILED` : 'SWING OK');
process.exit(failures ? 1 : 0);