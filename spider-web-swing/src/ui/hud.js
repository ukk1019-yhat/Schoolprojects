/**
 * Heads-up display, drawn in screen space after the world.
 */
import { COLORS, POWER_INFO } from '../game/constants.js';
import { roundRect } from '../render/sprites.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export class Hud {
  constructor() {
    this.t = 0;
  }

  /**
   * @param {object} o { game, camera, viewW, viewH, progress, level }
   */
  draw(ctx, o) {
    this.t += 1 / 60;
    const { game, viewW, viewH, progress, level } = o;
    const p = game.player;
    ctx.save();
    ctx.textBaseline = 'middle';

    this._hearts(ctx, p, 22, 26);
    this._counts(ctx, game, viewW);
    this._progress(ctx, viewW, progress);
    this._powers(ctx, p, 22, 58);
    this._levelTag(ctx, level, viewW, viewH);
    this._toast(ctx, game, viewW, viewH);
    this._hint(ctx, game, viewW, viewH);
    this._cheer(ctx, game, viewW, viewH);
    this._coach(ctx, o);

    ctx.restore();
  }

  _hearts(ctx, p, x, y) {
    ctx.save();
    for (let i = 0; i < p.maxHearts; i++) {
      const hx = x + i * 26;
      const full = i < p.hearts;
      ctx.save();
      ctx.translate(hx + 9, y);
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-9, -3, -5, -11, 0, -6);
      ctx.bezierCurveTo(5, -11, 9, -3, 0, 6);
      ctx.closePath();
      if (full) {
        const g = ctx.createLinearGradient(0, -10, 0, 7);
        g.addColorStop(0, '#ff7b8a');
        g.addColorStop(1, COLORS.ui.accent);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /** Coin / star / token counters, one tidy row. */
  _counts(ctx, game, viewW) {
    const s = game.stats;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = `800 18px ${FONT}`;
    const items = [
      { icon: '🪙', n: s.coins, color: COLORS.coin },
      { icon: '⭐', n: s.stars, color: COLORS.star },
      { icon: '🎁', n: s.tokens, color: COLORS.token },
    ];
    let x = viewW - 24;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const label = `${it.icon} ${it.n}`;
      ctx.fillStyle = it.color;
      ctx.fillText(label, x, 30);
      x -= ctx.measureText(label).width + 22;
    }
    ctx.restore();
  }

  /** Progress toward the goal flag. */
  _progress(ctx, viewW, progress) {
    const bw = 220;
    const bx = viewW - bw - 24;
    const by = 50;
    ctx.save();
    ctx.fillStyle = 'rgba(6,10,22,0.55)';
    roundRect(ctx, bx - 3, by - 6, bw + 6, 16, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, bx, by - 2, bw, 8, 4);
    ctx.fill();
    ctx.fillStyle = COLORS.ui.accent2;
    roundRect(ctx, bx, by - 2, Math.max(6, bw * progress), 8, 4);
    ctx.fill();
    ctx.fillStyle = COLORS.ui.text;
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('TO THE FLAG', viewW - 24, by + 18);
    ctx.restore();
  }

  _powers(ctx, p, x, y) {
    const active = Object.entries(p.powers || {}).filter(([, v]) => v > 0);
    if (!active.length) return;
    ctx.save();
    let px = x;
    for (const [type, left] of active) {
      const info = POWER_INFO[type] || { color: '#fff', label: type, icon: '?' };
      ctx.fillStyle = 'rgba(6,10,22,0.6)';
      roundRect(ctx, px, y - 2, 128, 28, 8);
      ctx.fill();
      ctx.fillStyle = info.color;
      roundRect(ctx, px + 3, y + 1, 24, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#12182c';
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.icon, px + 15, y + 12);
      ctx.fillStyle = COLORS.ui.text;
      ctx.font = `700 12px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(info.label, px + 33, y + 9);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `500 10px ${FONT}`;
      ctx.fillText(`${left.toFixed(0)}s`, px + 33, y + 20);
      px += 136;
    }
    ctx.restore();
  }

  _levelTag(ctx, level, viewW, viewH) {
    if (!level) return;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = `800 13px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(`${level.icon} ${level.name}`, 22, viewH - 22);
    ctx.restore();
  }

  _toast(ctx, game, viewW, viewH) {
    const toast = game.toast;
    if (!toast || toast.life <= 0) return;
    const a = Math.min(1, toast.life / 0.4);
    const pop = Math.min(1, (toast.max - toast.life) / 0.18);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = `800 24px ${FONT}`;
    const w = Math.min(viewW - 60, ctx.measureText(toast.text).width + 56);
    const y = viewH * 0.2 - (1 - pop) * 18;
    ctx.fillStyle = 'rgba(6,10,22,0.8)';
    roundRect(ctx, viewW / 2 - w / 2, y - 24, w, 48, 24);
    ctx.fill();
    ctx.strokeStyle = toast.color || COLORS.ui.accent2;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = toast.color || COLORS.ui.text;
    ctx.fillText(toast.text, viewW / 2, y + 1);
    ctx.restore();
  }

  _cheer(ctx, game, viewW, viewH) {
    if (!game.cheerText) return;
    const c = game.cheerText;
    ctx.save();
    ctx.globalAlpha = Math.min(1, c.life);
    ctx.textAlign = 'center';
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = COLORS.ui.warn;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 5;
    const y = viewH * 0.34 - (c.max - c.life) * 22;
    ctx.strokeText(c.text, viewW / 2, y);
    ctx.fillText(c.text, viewW / 2, y);
    ctx.restore();
  }

  _hint(ctx, game, viewW, viewH) {
    const tip = game.activeTip;
    if (!tip) return;
    // Sit above the coach panel while the tutorial is teaching, and stay inside
    // the middle channel so it never lands on the touch buttons.
    const coaching = game.coach?.enabled && !game.coach.finished;
    const y = coaching ? viewH - 200 : viewH - 96;
    const maxW = coaching ? 520 : viewW - 80;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `600 15px ${FONT}`;
    const w = Math.min(maxW, ctx.measureText(tip).width + 40);
    ctx.fillStyle = 'rgba(6,10,22,0.72)';
    roundRect(ctx, viewW / 2 - w / 2, y, w, 34, 10);
    ctx.fill();
    ctx.fillStyle = COLORS.ui.accent2;
    ctx.textBaseline = 'middle';
    ctx.fillText(tip, viewW / 2, y + 18);
    ctx.restore();
  }

  /* ---------------------------------------------------------------- *
   * The tutorial coach
   * ---------------------------------------------------------------- */

  _coach(ctx, o) {
    const { game, camera, viewW, viewH } = o;
    const coach = game.coach;
    const prompt = coach?.prompt;
    if (!prompt || !coach.enabled) return;

    const panelW = Math.min(560, viewW - 260);
    const panelH = prompt.hint ? 84 : 66;
    const px = viewW / 2 - panelW / 2;
    const py = viewH - panelH - 96;
    const pulse = 0.5 + Math.sin(this.t * 4) * 0.5;

    ctx.save();
    // Panel.
    ctx.fillStyle = 'rgba(10,16,34,0.88)';
    roundRect(ctx, px, py, panelW, panelH, 18);
    ctx.fill();
    ctx.strokeStyle = `rgba(77,208,255,${0.5 + pulse * 0.5})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Step dots.
    const dots = Math.max(1, prompt.total - 1);
    const dotR = 4;
    const gap = 13;
    const dotsW = dots * gap;
    let dx = px + 22;
    for (let i = 0; i < dots; i++) {
      ctx.beginPath();
      ctx.arc(dx + i * gap, py + panelH - 15, i < prompt.index ? dotR + 1 : dotR, 0, Math.PI * 2);
      ctx.fillStyle = i < prompt.index ? COLORS.ui.good : 'rgba(255,255,255,0.25)';
      ctx.fill();
    }

    // Icon + text.
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `26px ${FONT}`;
    ctx.fillText(prompt.icon, px + 22, py + 30);
    ctx.font = `800 17px ${FONT}`;
    ctx.fillStyle = COLORS.ui.text;
    ctx.fillText(prompt.text, px + 60, py + (prompt.hint ? 26 : 33));
    if (prompt.hint) {
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = COLORS.ui.accent2;
      ctx.fillText(prompt.hint, px + 60, py + 52);
    }

    // Step counter.
    ctx.textAlign = 'right';
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(`STEP ${Math.min(prompt.index + 1, prompt.total)}/${prompt.total}`, px + panelW - 22, py + 16);

    // Arrow to whatever this step is talking about.
    const target = coach.target;
    if (target && camera) {
      const s = camera.worldToScreen(target.x, target.y);
      if (s.x > -40 && s.x < viewW + 40 && s.y > -40 && s.y < viewH) {
        this._pointer(ctx, px + panelW / 2, py, s.x, s.y, pulse);
        // Ring around the target so it is obvious what to look at.
        ctx.globalAlpha = 0.35 + pulse * 0.35;
        ctx.strokeStyle = COLORS.ui.accent2;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 26 + pulse * 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** A bouncing arrow from the coach panel to a screen point. */
  _pointer(ctx, x0, y0, x1, y1, pulse) {
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const len = Math.min(150, Math.max(40, Math.hypot(x1 - x0, y1 - y0) * 0.5));
    const tipX = x1 - Math.cos(ang) * (34 + pulse * 6);
    const tipY = y1 - Math.sin(ang) * (34 + pulse * 6);
    const tailX = tipX - Math.cos(ang) * len;
    const tailY = tipY - Math.sin(ang) * len;
    ctx.save();
    ctx.strokeStyle = COLORS.ui.accent2;
    ctx.fillStyle = COLORS.ui.accent2;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(ang - 0.5) * 16, tipY - Math.sin(ang - 0.5) * 16);
    ctx.lineTo(tipX - Math.cos(ang + 0.5) * 16, tipY - Math.sin(ang + 0.5) * 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}