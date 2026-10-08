/**
 * WebSystem: aims, shoots and manages every web.
 *
 * Targeting is deliberately forgiving. A shot always tries, in order:
 *   1. a surface exactly where the hero aimed (raycast),
 *   2. a placed anchor, sticky web dot or Web-Bot inside a wide cone,
 *   3. any nearby wall face above the hero as a last resort.
 * A kid aiming roughly at a building always gets a swing; they never have to
 * hit a pixel.
 */
import { PHYS, PICKUP, POWER } from './constants.js';
import { clamp, dist, sign } from '../core/math.js';

const MAX_DOTS = 12;
const DOT_LIFE = 16;
const SHOT_SPEED = 1250;
const SHOT_LIFE = 0.9;

export class WebSystem {
  constructor(game) {
    this.game = game;
    this.shots = [];
    this.dots = [];
    this.cooldown = 0;
    this.missHintTimer = 0;
  }

  reset() {
    this.shots.length = 0;
    this.dots.length = 0;
    this.cooldown = 0;
    this.missHintTimer = 0;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.missHintTimer > 0) this.missHintTimer -= dt;
    this._updateShots(dt);
    for (let i = this.dots.length - 1; i >= 0; i--) {
      this.dots[i].life -= dt;
      if (this.dots[i].life <= 0) this.dots.splice(i, 1);
    }
  }

  /** Unit vector from the hero toward the aim point (or forward). */
  aimVector(aimPoint) {
    const p = this.game.player;
    if (aimPoint) {
      const dx = aimPoint.x - p.cx;
      const dy = aimPoint.y - p.cy;
      const len = Math.hypot(dx, dy);
      if (len > 10) return { x: dx / len, y: dy / len };
    }
    return { x: p.facing, y: -0.35 };
  }

  /**
   * Picks the best attachment point. Returns { x, y, kind } or null.
   */
  findTarget(dir) {
    const g = this.game;
    const p = g.player;
    const world = g.world;
    const cands = [];

    // 1. Exactly where the shot was aimed.
    const hit = world.raycast(p.cx, p.cy, dir.x, dir.y, PHYS.webRange);
    if (hit) cands.push({ x: hit.x, y: hit.y, kind: 'surface', score: 3 });

    const consider = (x, y, kind, bonus) => {
      const dx = x - p.cx;
      const dy = y - p.cy;
      const d = Math.hypot(dx, dy);
      if (d > PHYS.webRange || d < 26) return;
      // Webbing something below the hero is almost never what was meant.
      if (dy > 110 && kind !== 'enemy') return;
      const dot = (dx / (d || 1)) * dir.x + (dy / (d || 1)) * dir.y;
      if (dot < -0.4) return;
      cands.push({ x, y, kind, score: dot * 2 + bonus - d / 1500 });
    };

    for (const a of g.level.anchors) consider(a.x, a.y, 'anchor', 0.7);
    for (const d of this.dots) consider(d.x, d.y, 'dot', 0.25);
    for (const e of g.level.enemies) {
      if (e.wrapped) continue;
      consider(e.x + e.w / 2, e.y + e.h / 2, 'enemy', 0.15);
    }

    // 3. Last resort: the nearest wall face above the hero, so a shot at
    // nothing still latches on to something solid nearby.
    if (!cands.length) {
      let best = null;
      let bestD = PHYS.webRange * 1.15;
      for (const s of world.statics) {
        if (!s.active || s.kind === 'ground') continue;
        for (let sx = s.x + 12; sx < s.x + s.w - 12; sx += 46) {
          for (const sy of [s.y + 4, s.y + Math.min(90, s.h)]) {
            const d = dist(p.cx, p.cy, sx, sy);
            if (sy > p.cy + 60 || d > bestD) continue;
            bestD = d;
            best = { x: sx, y: sy, kind: 'surface' };
          }
        }
        if (best) break;
      }
      if (best) return best;
    }

    let best = null;
    for (const c of cands) {
      if (!best || c.score > best.score) best = c;
    }
    return best;
  }

  /**
   * Shoots a web. Returns 'swing' | 'enemy' | 'miss'.
   */
  shoot(aimPoint) {
    if (this.cooldown > 0) return null;
    const g = this.game;
    const p = g.player;
    const dir = this.aimVector(aimPoint);
    this.cooldown = PHYS.webCooldown;
    g.stats.webShots++;
    g.events.onWebShot?.();

    const target = this.findTarget(dir);
    if (!target) {
      // Miss: the web flies off and fades. No penalty beyond the lost moment.
      this.shots.push({
        x: p.cx + dir.x * 10,
        y: p.cy + dir.y * 10 - 6,
        vx: dir.x * SHOT_SPEED,
        vy: dir.y * SHOT_SPEED,
        life: SHOT_LIFE,
      });
      g.events.onNoTarget?.();
      return 'miss';
    }

    if (target.kind === 'enemy') {
      const enemy = g.level.enemies.find((e) => !e.wrapped && e.x + e.w / 2 === target.x && e.y + e.h / 2 === target.y);
      this.shots.push({
        x: p.cx + dir.x * 10,
        y: p.cy + dir.y * 10 - 6,
        tx: target.x,
        ty: target.y,
        t: 0,
        dur: 0.08,
        enemy,
      });
      if (enemy) g.wrapEnemy(enemy);
      return 'enemy';
    }

    this.shots.push({
      x: p.cx + dir.x * 10,
      y: p.cy + dir.y * 10 - 6,
      tx: target.x,
      ty: target.y,
      t: 0,
      dur: 0.07,
    });
    p.attachWeb(target.x, target.y, dist(p.cx, p.cy, target.x, target.y) * 0.97);
    g.events.onWebSwing?.();
    g.stats.swings++;
    return 'swing';
  }

  _updateShots(dt) {
    const world = this.game.world;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      if (s.t != null) {
        s.t += dt;
        if (s.t >= s.dur) this.shots.splice(i, 1);
        continue;
      }
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 240 * dt;
      if (world.pointSolid(s.x, s.y)) {
        this.addDot(s.x, s.y);
        this.game.events.onWebHit?.();
        this.game.particles.burst(s.x, s.y, 6, { speed: 90, life: 0.3, size: 3, color: '#ffffff' });
        this.shots.splice(i, 1);
        continue;
      }
      if (s.life <= 0) this.shots.splice(i, 1);
    }
  }

  addDot(x, y) {
    if (this.dots.length >= MAX_DOTS) this.dots.shift();
    this.dots.push({ x, y, life: DOT_LIFE });
  }
}

/**
 * CollectibleSystem: coins, stars, hidden tokens and power-ups, plus the coin
 * magnet. Kept separate from the game loop so scoring stays in one place.
 */
export class CollectibleSystem {
  constructor(game) {
    this.game = game;
    this.coinStreak = 0;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const magnet = p.hasPower(POWER.MAGNET);
    const MAG = 210;

    for (const item of g.level.pickups) {
      item.spin = (item.spin || 0) + dt * 2.6;
      if (item.taken) {
        if (item.pop > 0) item.pop -= dt * 3;
        continue;
      }
      if (magnet) {
        const d = dist(p.cx, p.cy, item.x, item.y);
        if (d < MAG && d > 1) {
          const s = 700 * (1 - d / MAG) + 160;
          item.x += ((p.cx - item.x) / d) * s * dt;
          item.y += ((p.cy - item.y) / d) * s * dt;
        }
      }
      if (dist(p.cx, p.cy, item.x, item.y) < item.r + p.w * 0.5) this.collect(item);
    }

    for (const pu of g.level.powerups) {
      if (pu.taken) {
        if (pu.pop > 0) pu.pop -= dt * 3;
        continue;
      }
      pu.phase += dt * 3;
      if (dist(p.cx, p.cy, pu.x, pu.y) < pu.r + p.w * 0.5) {
        pu.taken = true;
        pu.pop = 1;
        p.grantPower(pu.type, pu.duration);
        g.stats.powerups++;
        g.events.onPowerUp?.(pu.type);
        g.particles.burst(pu.x, pu.y, 26, { speed: 300, life: 0.7, size: 5, color: '#ff9de0', glow: true });
        g.showToast(`${pu.type === POWER.SPEED ? '⚡ SPEED UP!' : '⭐ COIN MAGNET!'}`, '#ffb3e6');
      }
    }
  }

  collect(item) {
    const g = this.game;
    const p = g.player;
    item.taken = true;
    item.pop = 1;
    p.collectFlash = 0.3;
    if (item.type === PICKUP.COIN) {
      this.coinStreak++;
      g.stats.coins++;
      g.score += 10;
      g.events.onCoin?.(g.stats.coins);
      g.particles.burst(item.x, item.y, 8, { speed: 150, life: 0.35, size: 3, color: '#ffd166', glow: true });
      if (this.coinStreak > 0 && this.coinStreak % 25 === 0) g.cheer();
    } else if (item.type === PICKUP.STAR) {
      g.stats.stars++;
      g.score += 250;
      g.events.onStar?.(g.stats.stars);
      g.particles.burst(item.x, item.y, 18, { speed: 220, life: 0.6, size: 4, color: '#ffe066', glow: true });
      g.cheer();
    } else if (item.type === PICKUP.TOKEN) {
      g.stats.tokens++;
      g.score += 1000;
      g.events.onToken?.(g.stats.tokens);
      g.particles.burst(item.x, item.y, 30, { speed: 280, life: 0.8, size: 5, color: '#7ee0ff', glow: true });
      g.showToast('🎁 SECRET TOKEN FOUND!', '#7ee0ff');
    }
  }
}

export { clamp, sign };