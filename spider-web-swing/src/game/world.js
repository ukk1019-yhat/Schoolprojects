import { aabb } from '../core/math.js';

const CELL = 160;

/**
 * Static + dynamic collision world.
 * Static geometry goes into a row-band spatial hash; movers are few enough to
 * always test directly.
 */
export class World {
  constructor(level) {
    this.level = level;
    this.width = level.worldW;
    this.height = level.worldH;
    this.statics = [];
    this.dynamic = [];
    this.crumbles = [];
    this.bounds = {
      left: 24,
      right: level.worldW - 24,
      top: level.topBound,
      bottom: level.bottomBound,
    };

    for (const s of level.solids) this.statics.push({ ...s, active: true });
    for (const l of level.ledges) this.statics.push({ ...l, active: true });
    for (const m of level.movers) {
      const d = { ...m, type: 'mover', active: true, climbable: false, dx: 0, dy: 0 };
      this.dynamic.push(d);
    }

    this.rows = new Map();
    for (const s of this.statics) this._index(s);
  }

  _index(s) {
    const r0 = Math.floor(s.y / CELL);
    const r1 = Math.floor((s.y + s.h) / CELL);
    for (let r = r0; r <= r1; r++) {
      if (!this.rows.has(r)) this.rows.set(r, []);
      this.rows.get(r).push(s);
    }
  }

  addCrumble(x, y, w, h) {
    const c = { x, y, w, h, type: 'crumble', climbable: false, active: true, state: 'idle', timer: 0, vy: 0, respawn: 0 };
    this.crumbles.push(c);
    this.dynamic.push(c);
    return c;
  }

  /** Collect colliders whose cells overlap the rect. Reuses `out`. */
  query(x, y, w, h, out = []) {
    out.length = 0;
    const r0 = Math.floor(y / CELL);
    const r1 = Math.floor((y + h) / CELL);
    for (let r = r0; r <= r1; r++) {
      const bucket = this.rows.get(r);
      if (!bucket) continue;
      for (const s of bucket) {
        if (!s.active) continue;
        if (aabb(x, y, w, h, s.x, s.y, s.w, s.h)) out.push(s);
      }
    }
    for (const d of this.dynamic) {
      if (!d.active) continue;
      if (aabb(x, y, w, h, d.x, d.y, d.w, d.h)) out.push(d);
    }
    return out;
  }

  /** Nearest climbable face to a vertical strip, searching outward. */
  findClimbFace(x, y, h, dir) {
    let best = null;
    let bestDist = Infinity;
    for (const s of this.statics) {
      if (!s.climbable || !s.active) continue;
      if (y + h < s.y - 6 || y > s.y + s.h + 6) continue;
      if (dir > 0) {
        const faceX = s.x;
        const d = Math.abs(faceX - x);
        if (d < 26 && d < bestDist && x <= faceX + 4) {
          best = s;
          bestDist = d;
        }
      } else {
        const faceX = s.x + s.w;
        const d = Math.abs(faceX - x);
        if (d < 26 && d < bestDist && x + 26 >= faceX - 4) {
          best = s;
          bestDist = d;
        }
      }
    }
    if (best) return best;
    for (const d of this.dynamic) {
      if (!d.climbable || !d.active) continue;
      if (dir > 0) {
        const dist = Math.abs(d.x - x);
        if (dist < 26 && dist < bestDist && x <= d.x + 4) return d;
      } else {
        const dist = Math.abs(d.x + d.w - x);
        if (dist < 26 && dist < bestDist && x + 26 >= d.x + d.w - 4) return d;
      }
    }
    return null;
  }

  /** Any solid (climbable or not) directly beside the body, for wall detection. */
  wallAt(x, y, h, dir) {
    for (const s of this.statics) {
      if (!s.active) continue;
      if (y + h <= s.y + 1 || y >= s.y + s.h - 1) continue;
      if (dir > 0 && Math.abs(s.x - x) <= 3) return s;
      if (dir < 0 && Math.abs(s.x + s.w - x) <= 3) return s;
    }
    for (const d of this.dynamic) {
      if (!d.active) continue;
      if (y + h <= d.y + 1 || y >= d.y + d.h - 1) continue;
      if (dir > 0 && Math.abs(d.x - x) <= 3) return d;
      if (dir < 0 && Math.abs(d.x + d.w - x) <= 3) return d;
    }
    return null;
  }

  /** True when nothing solid overlaps the rect. */
  isFree(x, y, w, h) {
    return this.query(x, y, w, h, SCRATCH).length === 0;
  }

  isFreeCircle(cx, cy, r) {
    return this.isFree(cx - r, cy - r, r * 2, r * 2);
  }

  /**
   * Horizontal move with resolution. Returns the blocking solid (or null).
   * `body` needs {x,y,w,h}.
   */
  moveX(body, dx) {
    if (dx === 0) return null;
    body.x += dx;
    const hits = this.query(body.x, body.y, body.w, body.h, SCRATCH);
    let block = null;
    for (const s of hits) {
      if (s.type === 'ledge' || s.type === 'mover' || s.type === 'crumble') {
        if (!this._solidForHorizontal(s, body)) continue;
      }
      if (dx > 0) body.x = s.x - body.w;
      else body.x = s.x + s.w;
      block = s;
    }
    return block;
  }

  _solidForHorizontal(s, body) {
    if (s.type === 'ledge') {
      // One-way ledges only exist for downward movement.
      return false;
    }
    if (s.type === 'crumble' && s.state !== 'idle') return false;
    return true;
  }

  /**
   * Vertical move with resolution and one-way platform support.
   * Returns { ground, ceiling, block }.
   */
  moveY(body, dy, prevBottom) {
    const res = { ground: null, ceiling: null, block: null };
    if (dy === 0) return res;
    body.y += dy;
    const hits = this.query(body.x, body.y, body.w, body.h, SCRATCH);
    for (const s of hits) {
      if (s.type === 'ledge' || s.type === 'mover') {
        // One-way surfaces: land on top, pass straight through from below.
        // Without this a moving platform parked over a wall becomes an
        // invisible ceiling that traps a climbing hero in place forever.
        if (dy <= 0) continue;
        if (prevBottom > s.y + 2 && body.groundRef !== s) continue;
        body.y = s.y - body.h;
        res.ground = s;
        res.block = s;
        continue;
      }
      if (s.type === 'crumble' && s.state !== 'idle') continue;
      if (dy > 0) {
        body.y = s.y - body.h;
        res.ground = s;
        res.block = s;
      } else {
        body.y = s.y + s.h;
        res.ceiling = s;
        res.block = s;
      }
    }
    return res;
  }

  /**
   * Moves a body along with the mover it is standing on. Called right after
   * updateMovers() and before the body's own update, so riding a lift feels
   * solid instead of sliding off.
   */
  carry(body) {
    const m = body.groundRef;
    if (!m || !m.active || m.type !== 'mover') return false;
    if (m.dx) body.x += m.dx;
    if (m.dy) body.y += m.dy;
    return true;
  }

  /** Coarse line-of-sight test used by the monster's vision cone. */
  losClear(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1) return true;
    const steps = Math.min(96, Math.ceil(len / 14));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      if (this.pointSolid(px, py)) return false;
    }
    return true;
  }

  pointSolid(px, py) {
    for (const s of this.statics) {
      if (!s.active) continue;
      if (px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) return true;
    }
    for (const d of this.dynamic) {
      if (!d.active) continue;
      if (px >= d.x && px <= d.x + d.w && py >= d.y && py <= d.y + d.h) return true;
    }
    return false;
  }

  /**
   * Marches a ray from (x0,y0) along a unit direction and returns the first
   * solid surface it touches, or null. Used by the web shooter so aiming at a
   * building always attaches exactly where the web lands.
   */
  raycast(x0, y0, dx, dy, maxDist, step = 8) {
    const steps = Math.ceil(maxDist / step);
    for (let i = 1; i <= steps; i++) {
      const d = Math.min(maxDist, i * step);
      const px = x0 + dx * d;
      const py = y0 + dy * d;
      if (this.pointSolid(px, py)) return { x: px, y: py, dist: d };
    }
    return null;
  }

  /** Nearest solid surface below a point (used for safe spawn placement). */
  groundBelow(x, y, maxDist = 4000) {
    let bestY = Infinity;
    let found = null;
    for (const s of this.statics) {
      if (!s.active) continue;
      if (x < s.x || x > s.x + s.w) continue;
      if (s.y < y - 2) continue;
      if (s.y - y > maxDist) continue;
      if (s.y < bestY) {
        bestY = s.y;
        found = s;
      }
    }
    return found;
  }

  updateMovers(t) {
    for (const d of this.dynamic) {
      if (d.type === 'crumble') {
        this._updateCrumble(d, 0);
        continue;
      }
      if (d.type !== 'mover') continue;
      const px = d.x;
      const py = d.y;
      const k = t * d.speed + d.phase;
      d.x = d.ox + Math.sin(k) * d.ax;
      d.y = d.oy + Math.sin(k * 1.31) * d.ay;
      d.dx = d.x - px;
      d.dy = d.y - py;
    }
  }

  _updateCrumble(c, dt) {
    if (c.state === 'idle') return;
    if (c.state === 'shaking') {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = 'falling';
        c.vy = 0;
        c.active = false;
      }
      return;
    }
    if (c.state === 'falling') {
      c.vy += 2000 * dt;
      c.y += c.vy * dt;
      c.respawn -= dt;
      if (c.respawn <= 0) {
        c.state = 'idle';
        c.active = true;
        c.y = c.homeY;
        c.vy = 0;
      }
    }
  }

  tickCrumbleTimers(dt) {
    for (const c of this.crumbles) this._updateCrumble(c, dt);
  }

  startCrumble(c) {
    if (c.state !== 'idle') return;
    c.state = 'shaking';
    c.timer = 0.55;
    c.homeY = c.y;
  }

  resetCrumbles() {
    for (const c of this.crumbles) {
      c.state = 'idle';
      c.active = true;
      c.vy = 0;
      if (c.homeY != null) c.y = c.homeY;
    }
  }
}

const SCRATCH = [];
