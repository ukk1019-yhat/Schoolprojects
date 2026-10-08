/**
 * Coach: the friendly tutorial that teaches a kid how to cross the city.
 *
 * Steps are simple predicates over the live game, so the tutorial can never
 * get out of sync with the physics: it advances only when the hero has
 * actually done the thing it is asking for.
 */
import { PLAYER_STATE } from './constants.js';
import { storage } from '../core/storage.js';

/** The first gap the hero has to clear, i.e. the whole point of the game. */
function firstGap(game) {
  for (const seg of game.level.segments || []) {
    if (seg.gapAfter) return seg.gapAfter;
  }
  return null;
}

function nearestOf(list, cx, cy, maxDist) {
  let best = null;
  let bestD = maxDist ?? Infinity;
  for (const it of list) {
    const d = Math.hypot(it.x - cx, it.y - cy);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}

export const TUTORIAL_STEPS = [
  {
    id: 'run',
    icon: '🏃',
    text: 'Hold  D  or  →  to run',
    done: (g) => g.player.cx - g.level.spawn.x > 150,
  },
  {
    id: 'jump',
    icon: '⤴️',
    text: 'Press  SPACE  to jump  (twice = double jump!)',
    done: (g, c) => c.jumped,
  },
  {
    id: 'web',
    icon: '🕸️',
    text: 'Press  E  (or click) to shoot a web!',
    hint: 'Aim at a glowing ring above the gap',
    target: (g) => {
      const ahead = (g.level.anchors || [])
        .filter((a) => a.x > g.player.cx + 40)
        .sort((a, b) => a.x - b.x)[0];
      return ahead || (g.level.anchors || [])[0] || null;
    },
    done: (g, c) => c.webbed || g.player.rope != null,
  },
  {
    id: 'pump',
    icon: '💪',
    text: 'Hold  A  and  D  together to pump your swing!',
    done: (g, c) => c.swingTime > 0.5,
  },
  {
    id: 'release',
    icon: '🕊️',
    text: 'Let go of  E  to fly to the other side!',
    done: (g, c) => c.releasedWhileSwinging,
  },
  {
    id: 'cross',
    icon: '🎯',
    text: 'Nice! That is how you cross every gap',
    done: (g) => {
      const gap = firstGap(g);
      if (!gap) return true;
      return g.player.cx > gap.x + gap.w + 30;
    },
  },
  {
    id: 'climb',
    icon: '🧗',
    text: 'Hold  W  next to a wall to climb it',
    optional: true,
    target: (g) =>
      nearestOf(
        (g.level.solids || []).filter((s) => s.climbable && s.x > g.player.cx - 100),
        g.player.cx,
        g.player.cy,
        900,
      ),
    done: (g) => g.player.state === PLAYER_STATE.CLIMB || g.player.state === PLAYER_STATE.CRAWL,
  },
  {
    id: 'coin',
    icon: '🪙',
    text: 'Grab the coins  🪙  and stars  ⭐',
    optional: true,
    target: (g) => nearestOf(g.level.pickups || [], g.player.cx, g.player.cy, 1400),
    done: (g) => g.stats.coins > 0,
  },
  {
    id: 'bot',
    icon: '🤖',
    text: 'Shoot a Web-Bot to wrap it up!',
    optional: true,
    onlyIf: (g) => g.level.enemies.length > 0,
    target: (g) => (g.level.enemies || []).find((e) => !e.wrapped) || null,
    done: (g) => g.stats.enemiesWebbed > 0,
  },
  {
    id: 'go',
    icon: '🏁',
    text: 'You are a Web Master now. GO!',
    done: () => true,
  },
];

export class Coach {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.timer = 0;
    this.jumped = false;
    this.webbed = false;
    this.swingTime = 0;
    this.releasedWhileSwinging = false;
    this.finished = false;
    this.enabled = Coach.shouldTeach(game);
    this.holdTimer = 0;
  }

  static shouldTeach(game) {
    const mode = storage.get('tutorial');
    if (mode === 'off') return false;
    if (mode === 'on') return true;
    // A kid who pressed SKIP should never be nagged again.
    if (storage.get('tutorialSkip')) return false;
    // Otherwise it shows until it has been finished once, and always on the
    // first level so a new player is never left guessing.
    const done = !!storage.get('tutorialDone');
    return !done || (game.levelIndex ?? 0) === 0;
  }

  get step() {
    return this.enabled ? TUTORIAL_STEPS[this.index] || null : null;
  }

  /** Progress through the steps that actually apply to this level. */
  get progress() {
    const total = this.applicableCount();
    if (!total) return 1;
    return Math.min(1, this.index / total);
  }

  applicableCount() {
    let n = 0;
    for (const s of TUTORIAL_STEPS) {
      if (s.optional && s.onlyIf && !s.onlyIf(this.game)) continue;
      n++;
    }
    return n;
  }

  /** Text for the HUD prompt, or null when there is nothing to teach. */
  get prompt() {
    const s = this.step;
    if (!s) return null;
    return { icon: s.icon, text: s.text, hint: s.hint || null, index: this.index, total: this.applicableCount() };
  }

  /** World point the HUD should point at, if this step has one. */
  get target() {
    const s = this.step;
    if (!s || !s.target) return null;
    const t = s.target(this.game);
    if (!t) return null;
    return { x: t.x, y: t.y, w: t.w || 30, h: t.h || 30 };
  }

  update(dt) {
    if (!this.enabled || this.finished) return;
    const g = this.game;
    const p = g.player;

    // Watch what the hero is doing so steps can react to it.
    if (!p.onGround) this.jumped = true;
    if (p.rope) {
      this.webbed = true;
      if (p.state === PLAYER_STATE.SWING) this.swingTime += dt;
    }
    if (!p.rope && this.swingTime > 0 && this.swingTime < 3) this.releasedWhileSwinging = true;

    // Skip optional steps that do not apply to this level.
    const step = TUTORIAL_STEPS[this.index];
    if (step && step.optional && step.onlyIf && !step.onlyIf(g)) {
      this.index++;
      return;
    }

    this.timer += dt;
    if (step && step.done(g, this)) {
      this.index++;
      this.holdTimer = 0;
      if (this.index >= this.applicableCount()) {
        this.finished = true;
        storage.set('tutorialDone', true);
        g.showToast('🎓 TUTORIAL DONE! YOU ARE READY!', '#5ce68a');
        g.events.onTutorialDone?.();
      } else {
        g.events.onCoachStep?.(this.index);
      }
    }
  }

  /** Called by the pause menu so a grown-up can replay the lesson. */
  restart() {
    this.index = 0;
    this.jumped = false;
    this.webbed = false;
    this.swingTime = 0;
    this.releasedWhileSwinging = false;
    this.finished = false;
    this.enabled = true;
    storage.set('tutorialSkip', false);
  }

  skip() {
    this.enabled = false;
    this.finished = true;
    storage.set('tutorialDone', true);
    storage.set('tutorialSkip', true);
  }
}

export { firstGap };