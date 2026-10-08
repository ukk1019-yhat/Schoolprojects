import { clamp, damp, lerp } from './math.js';

/**
 * CameraController: smooth side-scrolling follow camera.
 *
 * While a web swing is underway the game raises the lead factor and drops the
 * zoom, so Spider-Man is always framed slightly behind his momentum with the
 * city pulled back around him.
 */
export class CameraController {
  constructor(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.targetZoom = 1;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.reducedMotion = false;
    this.bounds = { x: 0, y: 0, w: viewW, h: viewH };
    this._t = 0;
  }

  setBounds(w, h) {
    this.bounds = { x: 0, y: 0, w, h };
  }

  /** World-space rect to stay inside, with its real origin. */
  setBoundsRect(rect) {
    if (!rect) return null;
    this.bounds = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    return this.bounds;
  }

  setViewport(w, h) {
    this.viewW = w;
    this.viewH = h;
  }

  snapTo(x, y) {
    this.x = x - this.viewW / 2;
    this.y = y - this.viewH / 2;
    this._clampToBounds();
  }

  addShake(amount) {
    if (this.reducedMotion) amount *= 0.25;
    this.shake = Math.min(this.shake + amount, 14);
  }

  /** follow: {x,y,vx,vy} */
  update(dt, follow, opts = {}) {
    this._t += dt;
    const leadX = opts.leadX ?? 0.18;
    const leadY = opts.leadY ?? 0.12;
    const rateX = opts.rateX ?? 6.5;
    const rateY = opts.rateY ?? 5.5;

    const tx = follow.x + clamp(follow.vx || 0, -420, 420) * leadX;
    const ty = follow.y + clamp(follow.vy || 0, -520, 520) * leadY;

    this.zoom = damp(this.zoom, this.targetZoom, 3, dt);

    const halfW = this.viewW / (2 * this.zoom);
    const halfH = this.viewH / (2 * this.zoom);
    const desiredX = tx - halfW;
    const desiredY = ty - halfH;

    this.x = damp(this.x, desiredX, rateX, dt);
    this.y = damp(this.y, desiredY, rateY, dt);
    this._clampToBounds(halfW, halfH);

    // Shake decays quickly so it never becomes nauseating.
    this.shake = Math.max(0, this.shake - this.shake * 9 * dt - 6 * dt);
    if (this.shake > 0.01) {
      const f = this._t * 46;
      this.shakeX = Math.sin(f * 1.7) * this.shake;
      this.shakeY = Math.cos(f * 2.3) * this.shake * 0.7;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shake = 0;
    }
  }

  _clampToBounds(halfW, halfH) {
    const b = this.bounds;
    if (halfW == null) {
      halfW = this.viewW / (2 * this.zoom);
      halfH = this.viewH / (2 * this.zoom);
    }
    const maxX = b.x + b.w - halfW * 2;
    const maxY = b.y + b.h - halfH * 2;
    if (maxX <= 0) this.x = b.x + b.w / 2 - halfW;
    else this.x = clamp(this.x, b.x, maxX);
    if (maxY <= 0) this.y = b.y + b.h / 2 - halfH;
    else this.y = clamp(this.y, b.y, maxY);
  }

  /** Applies the world transform to a context already scaled to logical pixels. */
  apply(ctx) {
    ctx.save();
    ctx.translate(this.viewW / 2 + this.shakeX, this.viewH / 2 + this.shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x - this.viewW / (2 * this.zoom), -this.y - this.viewH / (2 * this.zoom));
  }

  restore(ctx) {
    ctx.restore();
  }

  /**
   * Inverse of `apply()`. Those transforms cancel their own viewW/2 offset, so
   * a world point lands at zoom * (world - cameraPos) + shake.
   */
  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + this.shakeX,
      y: (wy - this.y) * this.zoom + this.shakeY,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.shakeX) / this.zoom + this.x,
      y: (sy - this.shakeY) / this.zoom + this.y,
    };
  }
}

/** Back-compat alias: existing modules import { Camera }. */
export const Camera = CameraController;
