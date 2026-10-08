/**
 * All full-screen menus: title, level select, character (suit) picker,
 * how-to-play, settings, pause, game over, level complete and the big finale.
 */
import { COLORS, SUITS } from '../game/constants.js';
import { roundRect } from '../render/sprites.js';
import { drawHero } from '../render/sprites.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export class Screens {
  constructor() {
    this.t = 0;
  }

  /* ---------------------------------------------------------------- *
   * Shared widgets
   * ---------------------------------------------------------------- */

  _button(ctx, r, label, opts = {}) {
    const { hot = false, down = false, primary = false, disabled = false, sub = null, size } = opts;
    ctx.save();
    const bg = disabled
      ? 'rgba(255,255,255,0.05)'
      : primary
        ? hot ? '#ff6b7d' : COLORS.ui.accent
        : hot ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)';
    ctx.fillStyle = bg;
    const oy = down ? 2 : 0;
    roundRect(ctx, r.x, r.y + oy, r.w, r.h, 14);
    ctx.fill();
    if (!disabled) {
      ctx.strokeStyle = primary ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = disabled ? 'rgba(255,255,255,0.3)' : COLORS.ui.text;
    ctx.font = `800 ${size || Math.min(22, r.h * 0.36)}px ${FONT}`;
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + oy - (sub ? 8 : 0));
    if (sub) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `500 12px ${FONT}`;
      ctx.fillText(sub, r.x + r.w / 2, r.y + r.h / 2 + oy + 12);
    }
    ctx.restore();
  }

  _panel(ctx, w, h, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,28,0.88)';
    roundRect(ctx, x, y, w, h, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  _scrim(ctx, viewW, viewH, a = 0.72) {
    ctx.save();
    ctx.fillStyle = `rgba(4,7,18,${a})`;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }

  _hot(r, pointer) {
    return !!pointer && pointer.x >= r.x && pointer.x <= r.x + r.w && pointer.y >= r.y && pointer.y <= r.y + r.h;
  }

  /* ---------------------------------------------------------------- *
   * Title
   * ---------------------------------------------------------------- */

  title(ctx, viewW, viewH, pointer) {
    this.t += 1 / 60;
    this._scrim(ctx, viewW, viewH, 0.4);
    const w = 460;
    const h = 500;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2;
    this._panel(ctx, w, h, x, y);

    const bob = Math.sin(this.t * 2) * 4;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ui.accent;
    ctx.font = `900 42px ${FONT}`;
    ctx.fillText('SPIDER', viewW / 2, y + 58 + bob);
    ctx.fillStyle = COLORS.ui.accent2;
    ctx.fillText('WEB SWING', viewW / 2, y + 100 + bob);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText('SWING  ·  CLIMB  ·  BE A HERO', viewW / 2, y + 126);
    ctx.restore();

    const bw = w - 96;
    const items = [
      { id: 'play', label: 'PLAY', primary: true, sub: 'Start from level 1' },
      { id: 'select', label: 'LEVEL SELECT' },
      { id: 'character', label: 'CHARACTER' },
      { id: 'achievements', label: 'ACHIEVEMENTS' },
      { id: 'how', label: 'HOW TO PLAY' },
      { id: 'settings', label: 'SETTINGS' },
    ];
    const out = [];
    let by = y + 150;
    for (const it of items) {
      const r = { x: x + 48, y: by, w: bw, h: it.sub ? 52 : 46 };
      this._button(ctx, r, it.label, { hot: this._hot(r, pointer), primary: it.primary, sub: it.sub, size: 18 });
      out.push({ id: it.id, rect: r });
      by += it.sub ? 58 : 48;
    }
    return out;
  }

  /* ---------------------------------------------------------------- *
   * Achievements
   * ---------------------------------------------------------------- */

  achievements(ctx, viewW, viewH, list, pointer) {
    this.t += 1 / 60;
    this._scrim(ctx, viewW, viewH, 0.86);
    const w = 720;
    const h = 520;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2;
    this._panel(ctx, w, h, x, y);

    const earned = list.filter((a) => a.earned).length;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ui.text;
    ctx.font = `900 28px ${FONT}`;
    ctx.fillText('ACHIEVEMENTS', viewW / 2, y + 42);
    ctx.font = `700 14px ${FONT}`;
    ctx.fillStyle = COLORS.ui.accent2;
    ctx.fillText(`${earned} / ${list.length} UNLOCKED`, viewW / 2, y + 68);
    ctx.restore();

    const out = [];
    const cols = 3;
    const cw = (w - 72) / cols;
    const ch = 118;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const r = { x: x + 36 + col * cw, y: y + 86 + row * ch, w: cw - 14, h: ch - 14 };
      const hot = this._hot(r, pointer);
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 14);
      if (a.earned) {
        ctx.fillStyle = hot ? 'rgba(77,208,255,0.22)' : 'rgba(92,230,138,0.16)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(92,230,138,0.75)';
      } else {
        ctx.fillStyle = hot ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.045)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      }
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.globalAlpha = a.earned ? 1 : 0.4;
      ctx.font = `28px ${FONT}`;
      ctx.fillText(a.earned ? a.icon : '🔒', r.x + r.w / 2, r.y + 34);
      ctx.fillStyle = COLORS.ui.text;
      ctx.font = `800 13px ${FONT}`;
      ctx.fillText(a.title, r.x + r.w / 2, r.y + 58);
      ctx.font = `500 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      wrapText(ctx, a.desc, r.x + r.w / 2, r.y + 76, r.w - 20, 14);
      ctx.globalAlpha = 1;

      if (!a.earned && a.need > 1) {
        const pct = Math.min(1, (a.have || 0) / a.need);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        roundRect(ctx, r.x + 14, r.y + r.h - 16, r.w - 28, 6, 3);
        ctx.fill();
        ctx.fillStyle = COLORS.ui.accent2;
        roundRect(ctx, r.x + 14, r.y + r.h - 16, Math.max(4, (r.w - 28) * pct), 6, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = `600 10px ${FONT}`;
        ctx.fillText(`${Math.min(a.have, a.need)} / ${a.need}`, r.x + r.w / 2, r.y + r.h - 24);
      }
      ctx.restore();
    }

    const back = { x: viewW / 2 - 90, y: y + h - 58, w: 180, h: 42 };
    this._button(ctx, back, 'BACK', { hot: this._hot(back, pointer), primary: true });
    out.push({ id: 'back', rect: back });
    return out;
  }

  /* ---------------------------------------------------------------- *
   * Level select
   * ---------------------------------------------------------------- */

  levelSelect(ctx, viewW, viewH, levels, unlocked, progress, pointer) {
    this.t += 1 / 60;
    this._scrim(ctx, viewW, viewH, 0.82);
    const w = 720;
    const h = 430;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2;
    this._panel(ctx, w, h, x, y);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ui.text;
    ctx.font = `900 28px ${FONT}`;
    ctx.fillText('CHOOSE A LEVEL', viewW / 2, y + 42);
    ctx.restore();

    const out = [];
    const cols = 3;
    const cw = (w - 72) / cols;
    const rows = Math.ceil(levels.length / cols);
    const chh = Math.min(140, (h - 150) / rows);
    for (let i = 0; i < levels.length; i++) {
      const lv = levels[i];
      const rec = progress[lv.id];
      const locked = !unlocked(i, levels.map((l) => l.id));
      const col = i % cols;
      const row = Math.floor(i / cols);
      const r = { x: x + 36 + col * cw, y: y + 68 + row * chh, w: cw - 12, h: chh - 12 };
      this._button(ctx, r, '', { hot: this._hot(r, pointer), disabled: locked });
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = locked ? 'rgba(255,255,255,0.3)' : COLORS.ui.accent2;
      ctx.font = `900 26px ${FONT}`;
      ctx.fillText(locked ? '🔒' : `${i + 1}`, r.x + r.w / 2, r.y + 30);
      ctx.fillStyle = locked ? 'rgba(255,255,255,0.3)' : COLORS.ui.text;
      ctx.font = `800 14px ${FONT}`;
      ctx.fillText(lv.name, r.x + r.w / 2, r.y + 58);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = `500 11px ${FONT}`;
      ctx.fillText(lv.icon, r.x + r.w / 2, r.y + 78);
      if (rec?.cleared) {
        ctx.fillStyle = COLORS.ui.good;
        ctx.font = `800 12px ${FONT}`;
        ctx.fillText(`${'★'.repeat(rec.rating || 1)} ${rec.bestScore || 0}`, r.x + r.w / 2, r.y + 104);
      }
      ctx.restore();
      if (!locked) out.push({ id: `level:${lv.id}`, rect: r });
    }

    const back = { x: x + w / 2 - 70, y: y + h - 58, w: 140, h: 42 };
    this._button(ctx, back, 'BACK', { hot: this._hot(back, pointer) });
    out.push({ id: 'back', rect: back });
    return out;
  }

  /* ---------------------------------------------------------------- *
   * Character / suit picker
   * ---------------------------------------------------------------- */

  character(ctx, viewW, viewH, suitId, pointer) {
    this.t += 1 / 60;
    this._scrim(ctx, viewW, viewH, 0.8);
    const w = 620;
    const h = 360;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2;
    this._panel(ctx, w, h, x, y);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ui.text;
    ctx.font = `900 26px ${FONT}`;
    ctx.fillText('CHOOSE YOUR SUIT', viewW / 2, y + 40);
    ctx.restore();

    const out = [];
    const cw = (w - 72) / 4;
    for (let i = 0; i < SUITS.length; i++) {
      const suit = SUITS[i];
      const r = { x: x + 36 + i * cw, y: y + 66, w: cw - 12, h: 190 };
      const hot = this._hot(r, pointer);
      const selected = suit.id === suitId;
      this._button(ctx, r, '', { hot, primary: selected });
      // Suit swatch drawn as a mini hero.
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
      ctx.clip();
      ctx.translate(0, 0);
      const stub = {
        x: r.x + r.w / 2 - 15,
        y: r.y + 40,
        w: 30,
        h: 46,
        facing: 1,
        state: 'idle',
        onGround: true,
        vx: 0,
        vy: 0,
        invuln: 0,
        landSquash: 0,
        trail: [],
        rope: null,
        climbPhase: 0,
        runPhase: 0,
        hasPower: () => false,
      };
      drawHero(ctx, stub, this.t, suit.id);
      ctx.restore();
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = selected ? COLORS.ui.warn : 'rgba(255,255,255,0.75)';
      ctx.font = `800 12px ${FONT}`;
      ctx.fillText(suit.name, r.x + r.w / 2, r.y + 122);
      if (selected) {
        ctx.fillStyle = COLORS.ui.good;
        ctx.font = `700 12px ${FONT}`;
        ctx.fillText('SELECTED', r.x + r.w / 2, r.y + 142);
      }
      ctx.restore();
      out.push({ id: `suit:${suit.id}`, rect: r });
    }

    const bw = 150;
    const back = { x: x + 36, y: y + h - 60, w: bw, h: 44 };
    const play = { x: x + w - 36 - bw, y: y + h - 60, w: bw, h: 44 };
    this._button(ctx, back, 'BACK', { hot: this._hot(back, pointer) });
    this._button(ctx, play, 'PLAY', { hot: this._hot(play, pointer), primary: true });
    out.push({ id: 'back', rect: back });
    out.push({ id: 'play', rect: play });
    return out;
  }

  /* ---------------------------------------------------------------- *
   * How to play
   * ---------------------------------------------------------------- */

  howToPlay(ctx, viewW, viewH, pointer) {
    this.t += 1 / 60;
    this._scrim(ctx, viewW, viewH, 0.82);
    const w = 620;
    const h = 420;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2;
    this._panel(ctx, w, h, x, y);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ui.text;
    ctx.font = `900 26px ${FONT}`;
    ctx.fillText('HOW TO PLAY', viewW / 2, y + 40);
    ctx.textAlign = 'left';
    const rows = [
      ['A / D  or  ← →', 'Run left and right'],
      ['SPACE', 'Jump  ·  press again in the air to double jump'],
      ['W  or  ↑', 'Climb walls  ·  hold under a bridge to crawl'],
      ['E  or  CLICK', 'Shoot a web and start swinging'],
      ['LET GO of E', 'Let go of the web and fly'],
      ['A / D while swinging', 'Pump the swing to go faster'],
      ['W / S while swinging', 'Pull the web in / let it out'],
      ['SHIFT', 'Speed boost while running'],
      ['ESC  or  P', 'Pause'],
    ];
    let ry = y + 76;
    for (const [k, v] of rows) {
      ctx.fillStyle = COLORS.ui.accent2;
      ctx.font = `700 14px ${FONT}`;
      ctx.fillText(k, x + 34, ry);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `500 14px ${FONT}`;
      ctx.fillText(v, x + 234, ry);
      ry += 30;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `500 12px ${FONT}`;
    ctx.fillText('Tip: hold W against a wall while running to grab it instantly.', x + 34, ry + 12);
    ctx.fillText('You have 3 hearts. Falling in the water just moves you back to the last flag.', x + 34, ry + 32);
    ctx.restore();

    const back = { x: viewW / 2 - 80, y: y + h - 56, w: 160, h: 42 };
    this._button(ctx, back, 'GOT IT', { hot: this._hot(back, pointer), primary: true });
    return [{ id: 'back', rect: back }];
  }

  /* ---------------------------------------------------------------- *
   * Settings
   * ---------------------------------------------------------------- */

  settings(ctx, viewW, viewH, s, pointer) {
    this.t += 1 / 60;
    this._scrim(ctx, viewW, viewH, 0.82);
    const w = 520;
    const h = 448;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2;
    this._panel(ctx, w, h, x, y);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ui.text;
    ctx.font = `900 26px ${FONT}`;
    ctx.fillText('SETTINGS', viewW / 2, y + 40);
    ctx.restore();

    const out = [];
    const rowY = y + 70;
    const slider = (i, id, label, value) => {
      const r = { x: x + 40, y: rowY + i * 58, w: w - 80, h: 40 };
      const hot = this._hot(r, pointer);
      ctx.save();
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.ui.text;
      ctx.font = `700 14px ${FONT}`;
      ctx.fillText(label, r.x + 4, r.y + 4);
      const barY = r.y + 22;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      roundRect(ctx, r.x + 4, barY, r.w - 8, 12, 6);
      ctx.fill();
      const frac = hot && pointer ? Math.max(0, Math.min(1, (pointer.x - r.x - 4) / (r.w - 8))) : value;
      ctx.fillStyle = COLORS.ui.accent2;
      roundRect(ctx, r.x + 4, barY, Math.max(10, (r.w - 8) * frac), 12, 6);
      ctx.fill();
      ctx.fillStyle = COLORS.ui.text;
      ctx.font = `600 11px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(frac * 100)}%`, r.x + r.w - 4, r.y + 4);
      ctx.restore();
      out.push({ id, rect: r, slider: true });
    };
    slider(0, 'vol:music', 'MUSIC VOLUME', s.musicVolume);
    slider(1, 'vol:sfx', 'SOUND EFFECTS', s.sfxVolume);

    const toggles = [
      { i: 2, id: 'toggle:reducedEffects', label: 'REDUCED EFFECTS', on: s.reducedEffects },
      { i: 3, id: 'toggle:showTouch', label: 'ALWAYS SHOW TOUCH BUTTONS', on: s.showTouch },
      { i: 4, id: 'toggle:tutorial', label: 'SHOW TUTORIAL', on: s.tutorial !== 'off' },
    ];
    for (const tg of toggles) {
      const r = { x: x + 40, y: rowY + tg.i * 58, w: w - 80, h: 40 };
      const hot = this._hot(r, pointer);
      this._button(ctx, r, tg.label, { hot, primary: tg.on });
      ctx.save();
      ctx.textAlign = 'right';
      ctx.fillStyle = tg.on ? COLORS.ui.good : 'rgba(255,255,255,0.45)';
      ctx.font = `800 12px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(tg.on ? 'ON' : 'OFF', r.x + r.w - 14, r.y + r.h / 2);
      ctx.restore();
      out.push({ id: tg.id, rect: r });
    }

    const bw = (w - 96) / 2;
    const back = { x: x + 40, y: y + h - 58, w: bw, h: 42 };
    const reset = { x: x + 56 + bw, y: y + h - 58, w: bw, h: 42 };
    this._button(ctx, back, 'BACK', { hot: this._hot(back, pointer) });
    this._button(ctx, reset, 'RESET PROGRESS', { hot: this._hot(reset, pointer) });
    out.push({ id: 'back', rect: back });
    out.push({ id: 'reset', rect: reset });
    return out;
  }

  /* ---------------------------------------------------------------- *
   * In-run screens
   * ---------------------------------------------------------------- */

  pause(ctx, viewW, viewH, stats, pointer) {
    this.t += 1 / 60;
    this._scrim(ctx, viewW, viewH, 0.68);
    const w = 360;
    const h = 350;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2;
    this._panel(ctx, w, h, x, y);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ui.text;
    ctx.font = `900 30px ${FONT}`;
    ctx.fillText('PAUSED', viewW / 2, y + 48);
    ctx.restore();

    const out = [];
    const items = [
      { id: 'resume', label: 'RESUME', primary: true },
      { id: 'restart', label: 'RESTART LEVEL' },
      { id: 'how', label: 'REPLAY TUTORIAL' },
      { id: 'quit', label: 'QUIT TO MENU' },
    ];
    let by = y + 76;
    for (const it of items) {
      const r = { x: x + 40, y: by, w: w - 80, h: 50 };
      this._button(ctx, r, it.label, { hot: this._hot(r, pointer), primary: it.primary });
      out.push({ id: it.id, rect: r });
      by += 60;
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `500 12px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`🪙 ${stats.coins}   ⭐ ${stats.stars}   🎁 ${stats.tokens}`, viewW / 2, by + 6);
    ctx.restore();
    return out;
  }

  gameOver(ctx, viewW, viewH, pointer) {
    this.t += 1 / 60;
    this._scrim(ctx, viewW, viewH, 0.75);
    const w = 400;
    const h = 260;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2;
    this._panel(ctx, w, h, x, y);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ui.accent;
    ctx.font = `900 34px ${FONT}`;
    ctx.fillText('OUT OF HEARTS', viewW / 2, y + 56);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `500 14px ${FONT}`;
    ctx.fillText('Every hero tries again!', viewW / 2, y + 88);
    ctx.restore();

    const out = [];
    const items = [
      { id: 'restart', label: 'TRY AGAIN', primary: true },
      { id: 'quit', label: 'MAIN MENU' },
    ];
    let by = y + 116;
    for (const it of items) {
      const r = { x: x + 60, y: by, w: w - 120, h: 52 };
      this._button(ctx, r, it.label, { hot: this._hot(r, pointer), primary: it.primary });
      out.push({ id: it.id, rect: r });
      by += 62;
    }
    return out;
  }

  levelComplete(ctx, viewW, viewH, level, stats, rating, isLast, pointer, score = 0, achievements = []) {
    this.t += 1 / 60;
    this._scrim(ctx, viewW, viewH, 0.76);
    const w = 480;
    const h = 520;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2;
    this._panel(ctx, w, h, x, y);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ui.good;
    ctx.font = `900 34px ${FONT}`;
    ctx.fillText('LEVEL CLEARED!', viewW / 2, y + 50);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText(`${level.icon} ${level.name}`, viewW / 2, y + 76);
    ctx.restore();

    for (let i = 0; i < 3; i++) {
      const filled = i < rating;
      ctx.save();
      ctx.translate(viewW / 2 + (i - 1) * 62, y + 128);
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 === 0 ? 26 : 11;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = filled ? '#ffd166' : 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.strokeStyle = filled ? '#c98a1a' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = `600 15px ${FONT}`;
    let ry = y + 186;
    const rows = [
      `🪙 Coins   ${stats.coins}`,
      `⭐ Stars   ${stats.stars}`,
      `🎁 Tokens  ${stats.tokens}`,
      `⏱ Time    ${this._fmt(stats.time)}`,
      `🤖 Bots wrapped   ${stats.enemiesWebbed}`,
      `🏁 SCORE   ${Math.round(score || 0)}`,
    ];
    for (const r of rows) {
      if (r.startsWith('🏁')) {
        ctx.font = `900 17px ${FONT}`;
        ctx.fillStyle = COLORS.ui.warn;
      }
      ctx.fillText(r, viewW / 2, ry);
      ctx.font = `600 15px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ry += 23;
    }
    ctx.restore();

    // Any achievements earned by this run get their own line, not a toast.
    if (achievements?.length) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `800 13px ${FONT}`;
      ctx.fillStyle = COLORS.ui.good;
      const text = achievements.map((a) => `${a.icon} ${a.title}`).join('   ');
      ctx.fillText(text, viewW / 2, ry + 6);
      ctx.restore();
    }

    const out = [];
    const items = isLast
      ? [{ id: 'quit', label: 'FINISH!', primary: true }]
      : [
          { id: 'next', label: 'NEXT LEVEL', primary: true },
          { id: 'restart', label: 'REPLAY' },
          { id: 'quit', label: 'MAIN MENU' },
        ];
    let by = y + h - 60 - (items.length - 1) * 50;
    for (const it of items) {
      const r = { x: x + 70, y: by, w: w - 140, h: 42 };
      this._button(ctx, r, it.label, { hot: this._hot(r, pointer), primary: it.primary });
      out.push({ id: it.id, rect: r });
      by += 50;
    }
    return out;
  }

  finalVictory(ctx, viewW, viewH, totalScore, pointer) {
    this.t += 1 / 60;
    this._scrim(ctx, viewW, viewH, 0.7);
    const w = 560;
    const h = 340;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2;
    this._panel(ctx, w, h, x, y);
    const bounce = Math.sin(this.t * 3) * 4;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ui.warn;
    ctx.font = `900 44px ${FONT}`;
    ctx.fillText('YOU ARE A WEB MASTER!', viewW / 2, y + 66 + bounce);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText('You swung through the whole city!', viewW / 2, y + 104);
    ctx.fillStyle = COLORS.ui.accent2;
    ctx.font = `900 30px ${FONT}`;
    ctx.fillText(`TOTAL SCORE  ${totalScore}`, viewW / 2, y + 150);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `500 13px ${FONT}`;
    ctx.fillText('Thank you for playing!', viewW / 2, y + 186);
    ctx.restore();

    const out = [];
    const bw = (w - 110) / 2;
    const menu = { x: x + 45, y: y + h - 76, w: bw, h: 46 };
    const again = { x: x + 65 + bw, y: y + h - 76, w: bw, h: 46 };
    this._button(ctx, menu, 'MAIN MENU', { hot: this._hot(menu, pointer) });
    this._button(ctx, again, 'PLAY AGAIN', { hot: this._hot(again, pointer), primary: true });
    out.push({ id: 'quit', rect: menu });
    out.push({ id: 'play', rect: again });
    return out;
  }

  _fmt(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}

function wrapText(ctx, text, cx, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = w;
      yy += lh;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
  return yy;
}

export { wrapText };