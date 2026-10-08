import { World } from './world.js';
import { PlayerController } from './playerController.js';
import { Particles } from '../core/particles.js';
import { WebSystem, CollectibleSystem } from './webSystem.js';
import { updateEnemies, wrapEnemy } from './enemies.js';
import { Coach } from './tutorial.js';
import { CHEERS, PLAYER_STATE } from './constants.js';
import { clamp, dist } from '../core/math.js';

/** Zeroed input used for frames where the hero is frozen (win, death). */
const IDLE_INPUT = {
  axisX: 0,
  axisY: 0,
  isDown: () => false,
  wasPressed: () => false,
  wasReleased: () => false,
  pointer: { x: 0, y: 0, active: false },
};

/**
 * Game: one level run. Owns the world, the hero, the webs, pickups, enemies,
 * checkpoints and scoring, and reports everything interesting through
 * `events` so the app shell never has to reach inside.
 */
export class Game {
  constructor(level, events = {}) {
    this.level = level;
    this.events = events;
    this.world = new World(level);
    this.player = new PlayerController(this.world);
    this.particles = new Particles(320);
    this.web = new WebSystem(this);
    this.collectibles = new CollectibleSystem(this);
    this.time = 0;
    this.score = 0;
    this.paused = false;
    this.finished = false;
    this.state = 'playing';
    this.winTimer = 0;
    this.hintText = '';
    this.hintTimer = 0;
    this.toast = null;
    this.activeTip = level.tips?.[0] || null;
    this.stats = {
      coins: 0,
      stars: 0,
      tokens: 0,
      powerups: 0,
      enemiesWebbed: 0,
      bumps: 0,
      damage: 0,
      falls: 0,
      swings: 0,
      webShots: 0,
      time: 0,
    };
    this.checkpoint = { x: level.spawn.x, y: level.spawn.y, index: -1 };
    this.coach = new Coach(this);
    this.player.spawnAt(level.spawn.x, level.spawn.y);
    this._ctx = null;
  }

  /* ---------------------------------------------------------------- *
   * Frame update
   * ---------------------------------------------------------------- */

  update(dt, input, aimPoint) {
    this.time += dt;
    this.stats.time = this.time;
    if (this.hintTimer > 0) this.hintTimer -= dt;
    if (this.toast && this.toast.life > 0) {
      this.toast.life -= dt;
      if (this.toast.life <= 0) this.toast = null;
    }
    if (this.cheerText && this.cheerText.life > 0) this.cheerText.life -= dt;
    if (this.paused) return;

    const p = this.player;

    this.world.updateMovers(this.time);
    this.world.tickCrumbleTimers(dt);
    if (p.groundRef) this.world.carry(p);

    this.web.update(dt);
    this.particles.update(dt);

    if (this.finished || p.dead) {
      p.update(dt, IDLE_INPUT, this.playerCtx());
      return;
    }

    this._handleActions(input, aimPoint);
    p.update(dt, input, this.playerCtx());

    updateEnemies(this, dt);
    this._updateHazards(dt);
    this.collectibles.update(dt);
    this._updateCheckpoints();
    this._updateDecor(dt);
    this._checkBounds();
    this.coach.update(dt);
    this._checkGoal();

    if (p.dead) {
      this.state = 'gameover';
      this.events.onGameOver?.();
      this.showToast('😢 OUT OF HEARTS! TRY AGAIN!', '#ff6b6b');
    }
  }

  playerCtx() {
    if (this._ctx) return this._ctx;
    this._ctx = {
      onJump: (pl) => {
        this.events.onJump?.();
        this.particles.burst(pl.cx, pl.y + pl.h, 6, { speed: 90, life: 0.3, size: 3, color: '#ffffff', grav: 300 });
      },
      onDoubleJump: (pl) => {
        this.events.onDoubleJump?.();
        this.particles.burst(pl.cx, pl.cy, 12, { speed: 200, life: 0.4, size: 3, color: '#cfe6ff', grav: 260, shape: 'streak' });
      },
      onWallJump: (pl) => {
        this.events.onWallJump?.();
        this.particles.burst(pl.cx + pl.facing * 10, pl.cy, 10, { speed: 160, life: 0.35, size: 3, color: '#ffffff', grav: 400 });
      },
      onSwingKick: (pl) => {
        this.particles.burst(pl.cx, pl.cy, 10, { speed: 200, life: 0.35, size: 3, color: WEB_COLOR, grav: 200 });
      },
      onClimb: (pl) => this.particles.burst(pl.cx, pl.cy, 6, { speed: 70, life: 0.3, size: 2.5, color: '#ffffff', grav: 120 }),
      onCrawl: (pl) => this.particles.burst(pl.cx, pl.y, 6, { speed: 60, life: 0.3, size: 2.5, color: '#ffffff', grav: 60 }),
      onLand: (pl, strength) => {
        this.events.onLand?.(strength);
        this.particles.burst(pl.cx, pl.y + pl.h, Math.round(4 + strength * 8), {
          speed: 70 + strength * 130,
          life: 0.35,
          size: 3.4,
          color: 'rgba(255,255,255,0.85)',
          angle: -Math.PI / 2,
          spread: 2.4,
        });
      },
      onWebRelease: (pl) => this.particles.burst(pl.cx, pl.cy, 6, { speed: 120, life: 0.3, size: 2.5, color: '#ffffff' }),
      onHurt: (pl, amount) => {
        this.stats.damage += amount;
        this.events.onHurt?.(pl, amount);
        this.particles.burst(pl.cx, pl.cy, 16, { speed: 240, life: 0.5, size: 4, color: '#ff7a8a' });
      },
    };
    return this._ctx;
  }

  _handleActions(input, aimPoint) {
    const p = this.player;
    if (input.wasPressed('web')) this.web.shoot(aimPoint);
    // The dedicated release button lets go early without waiting for the mouse.
    if (input.wasPressed('release') && p.rope) p.releaseWeb(true);
  }

  /* ---------------------------------------------------------------- *
   * Hazards: wrecking balls and falling crates
   * ---------------------------------------------------------------- */

  _updateHazards(dt) {
    const p = this.player;
    const w = this.world;
    for (const h of this.level.hazards) {
      if (h.kind === 'ball') {
        h.phase += dt * 1.5;
        h.x = h.baseX != null ? h.baseX + Math.sin(h.phase) * h.amp : h.x;
        h.y = h.baseY + Math.cos(h.phase) * h.amp * 0.4;
        if (this._touches(p, h) && p.invuln <= 0) {
          if (p.hurt(1, h.x, this.playerCtx())) this.events.onBump?.(h);
        }
      } else if (h.kind === 'crate') {
        if (h.state === 'wait') {
          h.timer -= dt;
          if (h.timer <= 0) {
            h.state = 'fall';
            h.vy = 0;
          }
        } else if (h.state === 'fall') {
          h.vy = Math.min(h.vy + 1400 * dt, 1500);
          h.y += h.vy * dt;
          h.rot += h.spin * dt;
          if (this._touches(p, h) && p.invuln <= 0) {
            if (p.hurt(1, h.x + h.w / 2, this.playerCtx())) this.events.onBump?.(h);
            this._resetCrate(h);
          } else if (w.pointSolid(h.x + h.w / 2, h.y + h.h + 2) || h.y > this.level.bottomBound) {
            this._resetCrate(h);
          }
        } else if (h.state === 'done') {
          h.timer -= dt;
          if (h.timer <= 0) {
            h.state = 'wait';
            h.timer = 0.8 + Math.random() * 2.4;
            h.y = h.spawnY;
            h.rot = 0;
          }
        }
      }
    }
  }

  _resetCrate(h) {
    h.state = 'done';
    h.timer = h.respawn;
    this.particles.burst(h.x + h.w / 2, h.y + h.h, 12, { speed: 170, life: 0.4, size: 4, color: '#c98a4b' });
    this.events.onCrateCrash?.(h);
  }

  _touches(p, h) {
    if (h.r != null) return dist(p.cx, p.cy, h.x, h.y) < h.r + p.w * 0.42;
    return p.x < h.x + h.w && p.x + p.w > h.x && p.y < h.y + h.h && p.y + p.h > h.y;
  }

  /* ---------------------------------------------------------------- *
   * Checkpoints, decor, bounds and goal
   * ---------------------------------------------------------------- */

  _updateCheckpoints() {
    const p = this.player;
    for (const cp of this.level.checkpoints) {
      if (cp.reached) continue;
      if (Math.abs(p.cx - cp.x) < 90 && Math.abs(p.y + p.h - cp.y) < 80) {
        cp.reached = true;
        cp.pop = 1;
        this.checkpoint = { x: cp.x, y: cp.y - p.h - 2, index: cp.index };
        this.events.onCheckpoint?.(cp);
        this.showToast('🚩 CHECKPOINT!', '#5ce68a');
        this.particles.burst(cp.x, cp.y - 34, 24, { speed: 240, life: 0.6, size: 4, color: '#5ce68a', glow: true });
      }
    }
  }

  _updateDecor(dt) {
    for (const d of this.level.decor) {
      if (d.kind === 'car') d.x += d.speed * dt;
    }
    for (const cp of this.level.checkpoints) if (cp.pop > 0) cp.pop = Math.max(0, cp.pop - dt * 2);
  }

  _checkBounds() {
    const p = this.player;
    if (p.dead) return;
    if (p.y > this.level.bottomBound) {
      // Falling into the canal is never fatal: back to the last checkpoint.
      this.stats.falls++;
      this.events.onFall?.();
      this.showToast('🙂 WHOOPS! BACK TO THE CHECKPOINT', '#7ee0ff');
      this.respawnAtCheckpoint();
    }
  }

  _checkGoal() {
    if (this.finished) return;
    const p = this.player;
    const g = this.level.goal;
    if (!g) return;
    if (Math.abs(p.cx - g.x) < 70 && p.y + p.h <= g.y + 20 && p.cy > g.y - 140) {
      this.completeLevel();
    }
  }

  /** Puts the hero back on his feet at the last checkpoint, hearts intact. */
  respawnAtCheckpoint() {
    const cp = this.checkpoint;
    this.player.spawnAt(cp.x, cp.y);
    this.player.hearts = this.player.maxHearts;
    this.web.reset();
    this.particles.clear();
    this.events.onRespawn?.();
  }

  /* ---------------------------------------------------------------- *
   * Scoring and endings
   * ---------------------------------------------------------------- */

  completeLevel() {
    if (this.finished) return;
    this.finished = true;
    this.state = 'complete';
    this.player.celebrate();
    this.particles.burst(this.player.cx, this.player.cy, 40, {
      speed: 300, life: 1, size: 5, color: '#ffd166', grav: 300,
    });
    this.winTimer = 0;
  }

  /** 1-3 stars from how much of the level was collected and how cleanly. */
  rating() {
    const par = this.level.par || { coins: 100, stars: 10 };
    const coinFrac = clamp(this.stats.coins / Math.max(1, par.coins), 0, 1);
    const starFrac = clamp(this.stats.stars / Math.max(1, par.stars), 0, 1);
    const clean = this.stats.damage === 0 ? 1 : 0.8;
    const v = (coinFrac * 0.4 + starFrac * 0.6) * clean;
    return v >= 0.9 ? 3 : v >= 0.6 ? 2 : 1;
  }

  cheer() {
    const text = CHEERS[Math.floor(Math.random() * CHEERS.length)];
    this.cheerText = { text, life: 1.4, max: 1.4 };
    this.events.onCheer?.(text);
  }

  showHint(text, dur = 2.4) {
    this.hintText = text;
    this.hintTimer = dur;
    // The HUD reads activeTip, so a hint must show up on screen too.
    this.activeTip = text;
  }

  showToast(text, color) {
    this.toast = { text, color: color || '#ffffff', life: 2.2, max: 2.2 };
    this.events.onToast?.(this.toast);
  }

  /* ---------------------------------------------------------------- *
   * Helpers used by other systems
   * ---------------------------------------------------------------- */

  wrapEnemy(enemy) {
    if (!wrapEnemy(enemy)) return;
    this.stats.enemiesWebbed++;
    this.score += 150;
    this.events.onBotWebbed?.(enemy);
    this.particles.burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 20, {
      speed: 240, life: 0.5, size: 4, color: '#ffffff', glow: true,
    });
    this.showToast('🤖 WEB-BOT WRAPPED!', '#7ee0ff');
  }

  /** Camera framing: swing pulls back and leads the velocity. */
  getCameraTarget() {
    const p = this.player;
    const swinging = p.state === PLAYER_STATE.SWING;
    const fast = Math.abs(p.vx) > 700;
    return {
      x: p.cx,
      y: p.cy,
      vx: p.vx,
      vy: p.vy,
      zoom: swinging || fast ? 0.86 : p.onGround ? 1 : 0.94,
      swinging,
    };
  }

  /** 0..1 progress along the level, for the HUD bar. */
  getProgress() {
    const p = this.player;
    const goal = this.level.goal || { x: this.level.worldW };
    return clamp((p.cx - this.level.spawn.x) / Math.max(1, goal.x - this.level.spawn.x), 0, 1);
  }

  dispose() {
    this.particles.clear();
    this.web.reset();
  }
}

const WEB_COLOR = '#f2f7ff';