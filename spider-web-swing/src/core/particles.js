import { clamp01, TAU } from './math.js';

const MAX_PARTICLES = 260;

/**
 * Fixed-size pooled particle system. Never allocates during play,
 * so the particle count cannot tank the frame rate.
 */
export class Particles {
  constructor(max = MAX_PARTICLES) {
    this.max = max;
    this.pool = new Array(max);
    for (let i = 0; i < max; i++) {
      this.pool[i] = {
        alive: false,
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1,
        size: 2, grav: 0, drag: 0.98,
        color: '#fff', shape: 'circle',
        spin: 0, rot: 0, glow: false, fade: true,
      };
    }
    this.cursor = 0;
  }

  get activeCount() {
    let n = 0;
    for (const p of this.pool) if (p.alive) n++;
    return n;
  }

  _acquire() {
    for (let i = 0; i < this.max; i++) {
      const idx = (this.cursor + i) % this.max;
      if (!this.pool[idx].alive) {
        this.cursor = (idx + 1) % this.max;
        return this.pool[idx];
      }
    }
    // All busy: recycle the oldest slot rather than dropping the effect.
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    return p;
  }

  spawn(opts) {
    const p = this._acquire();
    p.alive = true;
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.life = opts.life ?? 0.5;
    p.maxLife = p.life;
    p.size = opts.size ?? 3;
    p.grav = opts.grav ?? 0;
    p.drag = opts.drag ?? 0.98;
    p.color = opts.color ?? '#ffffff';
    p.shape = opts.shape ?? 'circle';
    p.spin = opts.spin ?? 0;
    p.rot = opts.rot ?? 0;
    p.glow = !!opts.glow;
    p.fade = opts.fade !== false;
    return p;
  }

  burst(x, y, count, opts = {}) {
    const n = Math.min(count, this.max);
    for (let i = 0; i < n; i++) {
      const a = opts.angle != null ? opts.angle + (Math.random() - 0.5) * (opts.spread ?? TAU) : Math.random() * TAU;
      const sp = (opts.speed ?? 120) * (0.4 + Math.random() * 0.8);
      this.spawn({
        ...opts,
        x: x + (Math.random() - 0.5) * (opts.jitter ?? 6),
        y: y + (Math.random() - 0.5) * (opts.jitter ?? 6),
        vx: Math.cos(a) * sp + (opts.vx ?? 0),
        vy: Math.sin(a) * sp + (opts.vy ?? 0),
        life: (opts.life ?? 0.5) * (0.6 + Math.random() * 0.7),
        size: (opts.size ?? 3) * (0.6 + Math.random() * 0.8),
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 8,
      });
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vy += p.grav * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }

  draw(ctx) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      const t = clamp01(p.life / p.maxLife);
      const alpha = p.fade ? t : 1;
      ctx.globalAlpha = alpha;
      if (p.glow) {
        ctx.globalCompositeOperation = 'lighter';
      }
      ctx.fillStyle = p.color;
      if (p.shape === 'square') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size * (0.4 + t * 0.6);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      } else if (p.shape === 'streak') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillRect(-p.size * 2, -p.size * 0.35, p.size * 4, p.size * 0.7);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.35 + t * 0.65), 0, TAU);
        ctx.fill();
      }
      if (p.glow) ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    for (const p of this.pool) p.alive = false;
  }
}
