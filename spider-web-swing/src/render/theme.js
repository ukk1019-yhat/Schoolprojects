/**
 * Per-level palettes and backdrop painters.
 *
 * Everything here is procedural: no image files, so the game stays a pure
 * ES-module drop-in with nothing to load. Each theme describes the sky, the
 * three parallax skyline layers and the building/street colours.
 */

export const THEMES = {
  city: {
    name: 'city',
    label: 'CITY ROOFS',
    sky: ['#4fa8e8', '#9ad8ff', '#e8f7ff'],
    sun: '#fff8d0',
    sunGlow: 'rgba(255,248,208,0.55)',
    far: '#b6d2ea',
    mid: '#7ea9d6',
    near: '#5b83b3',
    building: ['#9dbde0', '#6c8cb8', '#c2d8ee'],
    buildingAlt: ['#b0cbe8', '#7f9fc4', '#d2e2f2'],
    roof: '#e6f1fb',
    window: '#ffe9a8',
    windowLit: '#fff8dc',
    water: '#4fc3e8',
    street: '#4a5568',
    trim: '#f2f7ff',
    haze: 'rgba(210,235,255,0.35)',
    stars: 0,
  },
  sunset: {
    name: 'sunset',
    label: 'SUNSET RUN',
    sky: ['#ff7a59', '#ffb26b', '#ffe6ae'],
    sun: '#fff6cf',
    sunGlow: 'rgba(255,214,140,0.6)',
    far: '#bb8db2',
    mid: '#916492',
    near: '#6d4672',
    building: ['#ab81a0', '#7c5a78', '#cba4bf'],
    buildingAlt: ['#bd92b0', '#8a6386', '#d8b3c8'],
    roof: '#ffd9c0',
    window: '#ffd98a',
    windowLit: '#fff2c6',
    water: '#ff9f7a',
    street: '#6b4a52',
    trim: '#fff1e0',
    haze: 'rgba(255,190,150,0.3)',
    stars: 0,
  },
  harbor: {
    name: 'harbor',
    label: 'HARBOR DAWN',
    sky: ['#3d5a9e', '#8aa6dd', '#ffd3b0'],
    sun: '#ffeccf',
    sunGlow: 'rgba(255,220,180,0.55)',
    far: '#7b8fc0',
    mid: '#5f74a8',
    near: '#485c8c',
    building: ['#8290bd', '#5f6d99', '#a8b4d8'],
    buildingAlt: ['#8f9bc4', '#6c7aa4', '#b8c3e0'],
    roof: '#cfd8ef',
    window: '#cfe6ff',
    windowLit: '#ffffff',
    water: '#3fa9d8',
    street: '#3c4460',
    trim: '#eef3ff',
    haze: 'rgba(200,215,255,0.32)',
    stars: 30,
  },
  night: {
    name: 'night',
    label: 'NIGHT PATROL',
    sky: ['#080c22', '#1b2650', '#3a4a86'],
    sun: '#f4f6ff',
    sunGlow: 'rgba(200,215,255,0.35)',
    far: '#26305c',
    mid: '#1a2242',
    near: '#12182c',
    building: ['#39436f', '#232b4c', '#4d5a8c'],
    buildingAlt: ['#414d7d', '#283156', '#5a68a0'],
    roof: '#5f6ea8',
    window: '#ffe08a',
    windowLit: '#fff6cf',
    water: '#20386e',
    street: '#1a2036',
    trim: '#cfe0ff',
    haze: 'rgba(60,80,160,0.34)',
    stars: 120,
  },
  snow: {
    name: 'snow',
    label: 'SNOW DISTRICT',
    sky: ['#8fb8d8', '#cfe4f2', '#ffffff'],
    sun: '#ffffff',
    sunGlow: 'rgba(255,255,255,0.6)',
    far: '#d0e0ee',
    mid: '#b4c8dc',
    near: '#94aec6',
    building: ['#d4e4f2', '#b0c6dc', '#f0f8ff'],
    buildingAlt: ['#c2d6ea', '#9db4cc', '#e6f2ff'],
    roof: '#ffffff',
    window: '#ffe9a8',
    windowLit: '#fff8dc',
    water: '#8ed0e8',
    street: '#9fb0c4',
    trim: '#ffffff',
    haze: 'rgba(255,255,255,0.4)',
    stars: 0,
  },
  summit: {
    name: 'summit',
    label: 'SKY SUMMIT',
    sky: ['#0f3f77', '#3f8fc4', '#d6f0ff'],
    sun: '#ffffff',
    sunGlow: 'rgba(255,255,255,0.6)',
    far: '#7fb6dc',
    mid: '#4f8fb8',
    near: '#2f6b96',
    building: ['#9fd0ec', '#6fa8cc', '#cfeafc'],
    buildingAlt: ['#8cc4e8', '#5f9cc4', '#bfe2f6'],
    roof: '#ffffff',
    window: '#ffe9a8',
    windowLit: '#fff8dc',
    water: '#5fd0f0',
    street: '#6f8fa8',
    trim: '#ffffff',
    haze: 'rgba(230,248,255,0.45)',
    stars: 0,
  },
};

export function themeFor(name) {
  return THEMES[name] || THEMES.city;
}

/** Deterministic hash so skies look identical every run. */
function hash(i, salt = 0) {
  let h = (i * 374761393 + salt * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Cached sky gradient + sun + stars. Re-rasterised only when the view changes. */
export class SkyCache {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.theme = null;
  }

  ensure(w, h, dpr) {
    if (this.canvas && this.w === w && this.h === h && this.dpr === dpr) return;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.ctx = this.canvas.getContext('2d');
    this.theme = null;
  }

  /** Static backdrop: gradient + sun, rebuilt only when theme or size changes. */
  get(theme, viewW, viewH) {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.ensure(viewW, viewH, dpr);
    if (this.theme !== theme) {
      this.theme = theme;
      const c = this.ctx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSky(c, theme, viewW, viewH);
    }
    return this.canvas;
  }

  blit(ctx, viewW, viewH) {
    ctx.drawImage(this.canvas, 0, 0, viewW, viewH);
  }
}

/** Stars drift with the camera; drawn live so the sky itself never rebuilds. */
export function drawStars(ctx, theme, viewW, viewH, camY) {
  if (!theme.stars) return;
  ctx.save();
  for (let i = 0; i < theme.stars; i++) {
    const sx = hash(i, 1) * viewW;
    const depth = hash(i, 2);
    const sy = (((hash(i, 3) * viewH * 1.4 - camY * depth * 0.35) % (viewH + 60)) + viewH + 60) % (viewH + 60) - 30;
    if (sy < 0 || sy > viewH) continue;
    const a = Math.max(0, 0.8 - (sy / viewH) * 0.8) * (0.4 + hash(i, 4) * 0.6);
    if (a <= 0.02) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff';
    const s = hash(i, 5) > 0.9 ? 2 : 1;
    ctx.fillRect(sx, sy, s, s);
  }
  ctx.restore();
}

/** Sky gradient, sun/moon and (optionally) a star field. Screen space. */
export function drawSky(ctx, theme, viewW, viewH) {
  const g = ctx.createLinearGradient(0, 0, 0, viewH);
  g.addColorStop(0, theme.sky[0]);
  g.addColorStop(0.55, theme.sky[1]);
  g.addColorStop(1, theme.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);

  const horizon = viewH * 0.72;
  const cx = viewW * 0.74;
  const cy = horizon - viewH * 0.16;
  const r = 46;
  ctx.save();
  const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.2);
  gg.addColorStop(0, theme.sunGlow);
  gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.sun;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Tileable parallax skyline strip, rasterised once per layer. */
export class SkylineCache {
  constructor() {
    this.theme = null;
    // One rasterised strip per parallax depth; sharing a single canvas made
    // every layer draw whatever was built last.
    this.strips = new Map();
  }

  _build(theme, viewH, depth, dpr) {
    const period = 320;
    const canvas = document.createElement('canvas');
    const h = Math.max(240, Math.round(viewH * 0.9));
    canvas.width = Math.round(period * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const layer = depth < 0.34 ? theme.far : depth < 0.67 ? theme.mid : theme.near;
    const bw = 44 + depth * 46;
    const bh = 90 + depth * 150;
    const baseY = h - 6;

    for (let k = 0; k < 4; k++) {
      const bwid = bw * (0.6 + hash(k, 11) * 0.9);
      const bhei = bh * (0.55 + hash(k, 12) * 1.0);
      const x = k * (period / 4);
      const y = baseY - bhei;
      ctx.fillStyle = layer;
      ctx.fillRect(x, y, bwid, h);
      const cols = Math.max(1, Math.floor(bwid / 22));
      const rows = Math.max(1, Math.floor(bhei / 26));
      for (let cxi = 0; cxi < cols; cxi++) {
        for (let cyi = 0; cyi < rows; cyi++) {
          if (hash(k * 97 + cxi * 7 + cyi * 13, 14) > 0.62) continue;
          ctx.globalAlpha = 0.16 + hash(k + cxi + cyi, 15) * 0.3;
          ctx.fillStyle = theme.window;
          ctx.fillRect(x + 6 + cxi * 22, y + 10 + cyi * 26, 8, 12);
        }
      }
    }
    ctx.globalAlpha = 1;
    return { canvas, period, h };
  }

  draw(ctx, theme, viewW, viewH, camX, camY, depth) {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    if (this.theme !== theme) {
      this.theme = theme;
      this.strips.clear();
    }
    const key = `${depth.toFixed(2)}@${viewH}`;
    let strip = this.strips.get(key);
    if (!strip) {
      strip = this._build(theme, viewH, depth, dpr);
      this.strips.set(key, strip);
    }
    const parallax = 0.12 + depth * 0.5;
    const off = (((camX * parallax) % strip.period) + strip.period) % strip.period;
    const y = viewH - strip.h - (((camY * parallax * 0.05) % 160) + 160) % 160;
    for (let x = -off; x < viewW; x += strip.period) {
      ctx.drawImage(strip.canvas, x, y, strip.period, strip.h);
    }
  }
}