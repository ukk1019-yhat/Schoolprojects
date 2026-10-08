/**
 * On-screen buttons for phones and tablets. Each button feeds the same
 * Input actions the keyboard uses, so the game code never knows the difference.
 */
import { VIEW_W, VIEW_H, COLORS } from '../game/constants.js';
import { roundRect } from '../render/sprites.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// action, glyph, label
const BUTTONS = [
  { id: 'left', x: 26, y: 424, w: 82, h: 82, glyph: '◀', label: '' },
  { id: 'right', x: 118, y: 424, w: 82, h: 82, glyph: '▶', label: '' },
  { id: 'up', x: 72, y: 336, w: 82, h: 76, glyph: '▲', label: 'CLIMB' },
  { id: 'jump', x: 26, y: 512, w: 82, h: 72, glyph: '⤴', label: 'JUMP' },
  { id: 'boost', x: 118, y: 512, w: 82, h: 72, glyph: '⚡', label: 'BOOST' },
  { id: 'web', x: 778, y: 424, w: 90, h: 86, glyph: '🕸', label: 'WEB', accent: true },
  { id: 'release', x: 852, y: 512, w: 82, h: 72, glyph: '✋', label: 'LET GO' },
];

export class TouchControls {
  constructor(input, canvas) {
    this.input = input;
    this.canvas = canvas;
    this.visible = false;
    this.active = new Map();
    this.buttons = BUTTONS;
    this._on = [];
    this._install();
  }

  setVisible(on) {
    if (this.visible === on) return;
    this.visible = on;
    // Do not leave buttons stuck down when they disappear.
    if (!on) for (const id of [...this.active.keys()]) this.input.virtualRelease(id);
  }

  _hit(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * VIEW_W;
    const py = ((e.clientY - r.top) / r.height) * VIEW_H;
    for (const b of this.buttons) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
  }

  _install() {
    const el = this.canvas;
    const down = (e) => {
      if (!this.visible) return;
      const b = this._hit(e);
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      this.active.set(e.pointerId, b.id);
      this.input.virtualPress(b.id);
    };
    const move = (e) => {
      if (!this.visible || !this.active.has(e.pointerId)) return;
      const b = this._hit(e);
      const prev = this.active.get(e.pointerId);
      if (b?.id === prev) return;
      // Slide between buttons without sticking.
      this.input.virtualRelease(prev);
      if (b) {
        this.active.set(e.pointerId, b.id);
        this.input.virtualPress(b.id);
      } else {
        this.active.delete(e.pointerId);
      }
    };
    const up = (e) => {
      const id = this.active.get(e.pointerId);
      if (id === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      this.input.virtualRelease(id);
      this.active.delete(e.pointerId);
    };
    for (const [type, fn] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['pointerleave', up]]) {
      el.addEventListener(type, fn, { passive: false });
      this._on.push([type, fn]);
    }
  }

  /** Blocks the mouse-shoot handler while a finger is on a button. */
  get pointerOnButton() {
    return this.active.size > 0;
  }

  draw(ctx, alpha = 1) {
    if (!this.visible) return;
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    for (const b of this.buttons) {
      const down = this.active.has(b.id) || this.input.isDown(b.id);
      ctx.fillStyle = b.accent ? 'rgba(255,77,94,0.55)' : 'rgba(12,18,36,0.5)';
      roundRect(ctx, b.x, b.y + (down ? 3 : 0), b.w, b.h, 18);
      ctx.fill();
      ctx.strokeStyle = down ? COLORS.ui.accent2 : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = down ? 3 : 2;
      ctx.stroke();
      ctx.fillStyle = COLORS.ui.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cy = b.y + (down ? 3 : 0) + b.h / 2 - (b.label ? 10 : 0);
      ctx.font = `${b.glyph.length > 2 ? 26 : 30}px ${FONT}`;
      ctx.fillText(b.glyph, b.x + b.w / 2, cy);
      if (b.label) {
        ctx.font = `800 11px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + (down ? 3 : 0) + b.h - 16);
      }
    }
    ctx.restore();
  }

  destroy() {
    for (const [type, fn] of this._on) this.canvas.removeEventListener(type, fn);
    this._on.length = 0;
    this.active.clear();
  }
}