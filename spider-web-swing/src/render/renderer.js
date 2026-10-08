/**
 * World renderer. Draws the city, entities and effects in world space, then
 * lets the HUD paint over the top in screen space.
 */
import { COLORS, PLAYER_STATE } from '../game/constants.js';
import { themeFor, SkyCache, SkylineCache, drawStars } from './theme.js';
import {
  drawHero,
  drawTrail,
  drawBot,
  drawPickup,
  drawPowerup,
  drawAnchor,
  drawCheckpoint,
  drawGoal,
  drawWebLine,
  roundRect,
} from './sprites.js';

export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.theme = themeFor('city');
    this.t = 0;
    this.sky = new SkyCache();
    this.skyline = new SkylineCache();
    this.suit = 'classic';
  }

  setLevel(level) {
    this.theme = themeFor(level.theme);
    this.skyline.theme = null;
  }

  setSuit(id) {
    this.suit = id;
  }

  render(o) {
    const { ctx } = this;
    const { game, camera } = o;
    const level = game.level;
    const base = o.baseScale || 1;
    this.t += 1 / 60;

    // Sky in screen space, blitted through the device scale so it reaches the
    // edges of the backing store.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(base, 0, 0, base, 0, 0);
    this.sky.get(this.theme, camera.viewW, camera.viewH);
    this.sky.blit(ctx, camera.viewW, camera.viewH);
    drawStars(ctx, this.theme, camera.viewW, camera.viewH, camera.y);
    ctx.restore();

    camera.apply(ctx);
    const pad = 200;
    const view = {
      x0: camera.x - pad,
      y0: camera.y - pad,
      x1: camera.x + camera.viewW / camera.zoom + pad,
      y1: camera.y + camera.viewH / camera.zoom + pad,
    };
    const visible = (r) => r.x + (r.w || 60) > view.x0 && r.x < view.x1 && r.y + (r.h || 60) > view.y0 && r.y < view.y1;

    // Parallax skylines.
    this.skyline.draw(ctx, this.theme, camera.viewW, camera.viewH, camera.x, camera.y, 0.15);
    this.skyline.draw(ctx, this.theme, camera.viewW, camera.viewH, camera.x, camera.y, 0.45);
    this.skyline.draw(ctx, this.theme, camera.viewW, camera.viewH, camera.x, camera.y, 0.8);

    this._water(level, view);
    this._backDecor(level, view);
    for (const l of level.ledges) if (visible(l)) this._ledge(l);
    for (const s of level.solids) if (visible(s)) this._solid(s);
    this._hazards(level, view);
    for (const a of level.anchors) if (visible({ x: a.x, y: a.y, w: 20, h: 20 })) drawAnchor(ctx, a, this.t);
    for (const c of level.checkpoints) {
      if (visible({ x: c.x, y: c.y - 70, w: 40, h: 70 })) drawCheckpoint(ctx, c, this.t);
    }
    if (level.goal) drawGoal(ctx, level.goal, this.t);

    for (const it of level.pickups) {
      if (it.taken && it.pop <= 0) continue;
      if (!visible({ x: it.x, y: it.y, w: 30, h: 30 })) continue;
      drawPickup(ctx, it, this.t);
    }
    for (const pu of level.powerups) {
      if (pu.taken && pu.pop <= 0) continue;
      if (!visible({ x: pu.x, y: pu.y, w: 40, h: 40 })) continue;
      drawPowerup(ctx, pu, this.t);
    }

    this._webs(game);
    for (const e of level.enemies) {
      if (visible({ x: e.x, y: e.y, w: e.w, h: e.h })) drawBot(ctx, e, this.t);
    }

    drawTrail(ctx, game.player);
    if (!game.player.dead) drawHero(ctx, game.player, this.t, this.suit);

    this._frontDecor(level, view);
    game.particles.draw(ctx);
    camera.restore(ctx);
  }

  /* ---------------------------------------------------------------- */

  _water(level, view) {
    const { ctx, theme } = this;
    for (const z of level.waterZones || []) {
      if (z.x + z.w < view.x0 || z.x > view.x1) continue;
      ctx.save();
      ctx.fillStyle = theme.water;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      const off = (this.t * 40) % 26;
      for (let i = 0; i < 3; i++) {
        const y = z.y + 14 + i * 16 + Math.sin(this.t * 2 + i) * 3;
        ctx.beginPath();
        ctx.moveTo(z.x, y);
        for (let x = 0; x <= z.w; x += 26) {
          ctx.lineTo(z.x + x, y + Math.sin((x + off) * 0.05) * 3);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _solid(s) {
    const { ctx, theme } = this;
    const pal = s.alt ? theme.buildingAlt : theme.building;
    ctx.save();
    if (s.kind === 'ledge') {
      ctx.fillStyle = pal[1];
      roundRect(ctx, s.x, s.y, s.w, s.h, 4);
      ctx.fill();
      ctx.fillStyle = theme.roof;
      ctx.fillRect(s.x, s.y, s.w, 3);
    } else if (s.kind === 'mover') {
      ctx.fillStyle = '#2ec4a6';
      roundRect(ctx, s.x, s.y, s.w, s.h, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(s.x + 3, s.y + 3, s.w - 6, 3);
    } else if (s.kind === 'crumble') {
      ctx.fillStyle = s.state === 'idle' ? '#8a6a4a' : '#5a4030';
      roundRect(ctx, s.x, s.y, s.w, s.h, 5);
      ctx.fill();
    } else if (s.kind === 'tower') {
      ctx.fillStyle = pal[1];
      roundRect(ctx, s.x, s.y, s.w, s.h, 6);
      ctx.fill();
      ctx.fillStyle = '#8b5a2b';
      roundRect(ctx, s.x - 4, s.y, s.w + 8, 26, 8);
      ctx.fill();
      ctx.strokeStyle = '#6b4218';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = pal[0];
      ctx.fillRect(s.x + 4, s.y + 30, s.w - 8, s.h - 30);
    } else if (s.kind === 'bridge') {
      ctx.fillStyle = pal[2];
      roundRect(ctx, s.x, s.y, s.w, s.h, 4);
      ctx.fill();
      ctx.fillStyle = theme.trim;
      ctx.fillRect(s.x, s.y, s.w, 4);
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(s.x + i * 40, s.y + s.h);
        ctx.lineTo(s.x + i * 40 + 20, s.y + s.h + 16);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (s.kind === 'alcoveTop') {
      ctx.fillStyle = pal[1];
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(s.x, s.y + s.h - 4, s.w, 4);
    } else if (s.kind === 'ac') {
      ctx.fillStyle = '#9aa8bd';
      roundRect(ctx, s.x, s.y, s.w, s.h, 5);
      ctx.fill();
      ctx.fillStyle = '#6f7d92';
      ctx.fillRect(s.x + 4, s.y + 6, s.w - 8, 5);
      ctx.fillStyle = '#5d6a7d';
      ctx.beginPath();
      ctx.arc(s.x + s.w * 0.35, s.y + s.h * 0.6, 9, 0, Math.PI * 2);
      ctx.arc(s.x + s.w * 0.68, s.y + s.h * 0.6, 9, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.kind === 'ground') {
      this._street(s);
    } else {
      // Buildings.
      const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
      g.addColorStop(0, pal[0]);
      g.addColorStop(1, pal[1]);
      ctx.fillStyle = g;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = pal[2];
      ctx.fillRect(s.x, s.y - 5, s.w, 7);
      ctx.fillStyle = theme.roof;
      ctx.fillRect(s.x, s.y - 6, s.w, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(s.x, s.y + s.h - 6, s.w, 6);
    }
    ctx.restore();
  }

  _street(s) {
    const { ctx, theme } = this;
    const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    g.addColorStop(0, theme.street);
    g.addColorStop(1, '#20263a');
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = theme.trim;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(s.x, s.y - 3, s.w, 4);
    ctx.globalAlpha = 1;
    // Lane dashes.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 4;
    ctx.setLineDash([26, 26]);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + 34);
    ctx.lineTo(s.x + s.w, s.y + 34);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _ledge(b) {
    this._solid(b);
  }

  _backDecor(level, view) {
    const { ctx, theme } = this;
    for (const d of level.decor) {
      if (d.kind !== 'window') continue;
      if (d.x < view.x0 || d.x > view.x1) continue;
      ctx.save();
      ctx.fillStyle = d.lit ? theme.windowLit : theme.window;
      ctx.globalAlpha = d.lit ? 0.75 : 0.35;
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(d.x, d.y, d.w, d.h);
      ctx.restore();
    }
    for (const d of level.decor) {
      if (d.kind !== 'car') continue;
      if (d.x < view.x0 - 120 || d.x > view.x1 + 120) continue;
      this._car(d);
    }
  }

  _car(d) {
    const { ctx } = this;
    const colors = ['#ff6b6b', '#ffd166', '#4dd0ff', '#5ce68a', '#c9a0ff'];
    ctx.save();
    ctx.translate(d.x, d.y + Math.sin(d.x * 0.05) * 1.5);
    ctx.fillStyle = colors[d.hue % colors.length];
    roundRect(ctx, 0, 0, d.w, d.h * 0.6, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    roundRect(ctx, d.w * 0.2, -d.h * 0.22, d.w * 0.5, d.h * 0.28, 4);
    ctx.fill();
    ctx.fillStyle = '#15181f';
    for (const wx of [d.w * 0.22, d.w * 0.78]) {
      ctx.beginPath();
      ctx.arc(wx, d.h * 0.6, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _frontDecor(level, view) {
    const { ctx, theme } = this;
    for (const d of level.decor) {
      if (d.kind !== 'roofEdge' && d.kind !== 'tower' && d.kind !== 'bridge' && d.kind !== 'ac' && d.kind !== 'sign') continue;
      if (d.x < view.x0 - 200 || d.x > view.x1 + 200) continue;
      if (d.kind === 'roofEdge') {
        ctx.save();
        ctx.fillStyle = theme.roof;
        ctx.fillRect(d.x, d.y, d.w, 4);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(d.x, d.y, d.w, 2);
        ctx.restore();
      } else if (d.kind === 'sign') {
        ctx.save();
        ctx.fillStyle = '#ffb020';
        roundRect(ctx, d.x, d.y, d.w, d.h, 8);
        ctx.fill();
        ctx.strokeStyle = '#7a4d00';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.fillStyle = '#3a2400';
        ctx.font = `bold ${Math.round(d.h * 0.4)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.text || '', d.x + d.w / 2, d.y + d.h / 2);
        ctx.restore();
      }
    }
  }

  _hazards(level, view) {
    const { ctx } = this;
    for (const h of level.hazards) {
      if (h.x < view.x0 - 80 || h.x > view.x1 + 80) continue;
      if (h.kind === 'ball') {
        ctx.save();
        // Chain.
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(h.x, h.baseY - 260);
        ctx.lineTo(h.x, h.y);
        ctx.stroke();
        const g = ctx.createRadialGradient(h.x - 6, h.y - 6, 2, h.x, h.y, h.r);
        g.addColorStop(0, '#ff8a5c');
        g.addColorStop(1, '#8c2b2b');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (h.kind === 'crate') {
        if (h.state === 'wait') continue;
        ctx.save();
        ctx.translate(h.x + h.w / 2, h.y + h.h / 2);
        ctx.rotate(h.rot || 0);
        ctx.fillStyle = '#8a5a2b';
        roundRect(ctx, -h.w / 2, -h.h / 2, h.w, h.h, 4);
        ctx.fill();
        ctx.strokeStyle = '#5a3a1b';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-h.w / 2, -h.h / 2);
        ctx.lineTo(h.w / 2, h.h / 2);
        ctx.moveTo(h.w / 2, -h.h / 2);
        ctx.lineTo(-h.w / 2, h.h / 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  _webs(game) {
    const { ctx } = this;
    for (const s of game.web.shots) {
      const from = { x: s.x, y: s.y };
      if (s.tx != null) {
        const k = s.dur > 0 ? Math.min(1, s.t / s.dur) : 1;
        drawWebLine(ctx, from, { x: s.x + (s.tx - s.x) * k, y: s.y + (s.ty - s.y) * k }, 2.4, COLORS.web, 0.95);
      } else {
        drawWebLine(ctx, from, { x: s.x + s.vx * 0.02, y: s.y + s.vy * 0.02 }, 2.4, COLORS.web, 0.9);
      }
    }
    for (const d of game.web.dots) {
      const a = Math.max(0, Math.min(1, d.life / 2));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = COLORS.web;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

export { PLAYER_STATE };