/**
 * Procedural drawing for the hero, enemies, pickups and props. No image files:
 * everything is built from canvas primitives so the game ships as pure code.
 */
import { COLORS, PICKUP, PLAYER_STATE, POWER_INFO, suitById } from '../game/constants.js';

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Motion trail left behind by a fast hero. */
export function drawTrail(ctx, p) {
  for (const t of p.trail) {
    const k = 1 - t.t / t.life;
    if (k <= 0) continue;
    ctx.save();
    ctx.globalAlpha = k * 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(t.x, t.y, p.w * 0.4 * k, p.h * 0.45 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * The hero. Suit colours come from the chosen suit, and the pose comes from the
 * real movement state: run cycle, climb, crawl, swing arc, hurt and win.
 */
export function drawHero(ctx, p, t, suitId) {
  const suit = suitById(suitId);
  const cx = p.x + p.w / 2;
  const feet = p.y + p.h;
  const W = p.w;
  const H = p.h;
  const face = p.facing >= 0 ? 1 : -1;

  let sx = 1;
  let sy = 1;
  if (p.landSquash > 0) {
    const k = Math.min(1, p.landSquash / 0.22);
    sx = 1 + 0.24 * k;
    sy = 1 - 0.24 * k;
  } else if (p.state === PLAYER_STATE.JUMP) {
    sy = 1.12;
    sx = 0.9;
  } else if (p.state === PLAYER_STATE.SWING) {
    // Lean into the swing arc.
    sy = 1.06;
    sx = 0.94;
  }

  const running = p.state === PLAYER_STATE.RUN;
  const cycle = running ? Math.sin(p.runPhase * 6) : 0;
  const climbing = p.state === PLAYER_STATE.CLIMB || p.state === PLAYER_STATE.CRAWL;
  const swinging = p.state === PLAYER_STATE.SWING;
  const hurt = p.state === PLAYER_STATE.HURT;
  const winning = p.state === PLAYER_STATE.WIN;

  ctx.save();
  ctx.translate(cx, feet);
  if (swinging) {
    // Tilt toward the rope so the swing direction reads at a glance.
    const dir = Math.atan2(p.cy - (p.rope ? p.rope.ay : p.cy - 100), p.cx - (p.rope ? p.rope.ax : p.cx));
    ctx.rotate(Math.max(-0.5, Math.min(0.5, (dir - Math.PI / 2) * 0.4)));
  }
  ctx.scale(face * sx, sy);
  if (p.invuln > 0 && Math.floor(t * 18) % 2 === 0) ctx.globalAlpha = 0.45;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Speed power-up shimmer.
  if (p.hasPower && p.hasPower('speed')) {
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(t * 20) * 0.15;
    ctx.strokeStyle = POWER_INFO.speed.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-W / 2 - 6, -H * 0.3);
    ctx.lineTo(-W / 2 - 16, -H * 0.36);
    ctx.moveTo(W / 2 + 6, -H * 0.24);
    ctx.lineTo(W / 2 + 18, -H * 0.3);
    ctx.stroke();
    ctx.restore();
  }

  // Legs.
  ctx.strokeStyle = suit.legs;
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  if (climbing) {
    const k = Math.sin(p.climbPhase * 7);
    ctx.moveTo(-3, -14);
    ctx.lineTo(-5 + k * 3, -2);
    ctx.moveTo(4, -14);
    ctx.lineTo(5 - k * 3, -2);
  } else if (winning) {
    ctx.moveTo(-4, -14);
    ctx.lineTo(-6, -2);
    ctx.moveTo(4, -14);
    ctx.lineTo(6, -2);
  } else {
    ctx.moveTo(-3, -15);
    ctx.lineTo(-3 + cycle * 7, 0);
    ctx.moveTo(3, -15);
    ctx.lineTo(3 - cycle * 7, 0);
  }
  ctx.stroke();

  // Torso.
  ctx.fillStyle = suit.body;
  roundRect(ctx, -W / 2, -H * 0.62, W, H * 0.42, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-6, -H * 0.5);
  ctx.lineTo(0, -H * 0.42);
  ctx.lineTo(6, -H * 0.5);
  ctx.stroke();

  // Arms. While swinging one hand holds the web above.
  ctx.strokeStyle = suit.body;
  ctx.lineWidth = 5;
  ctx.beginPath();
  if (swinging) {
    ctx.moveTo(2, -H * 0.54);
    ctx.lineTo(6, -H * 0.92);
    ctx.moveTo(-W / 2 + 2, -H * 0.56);
    ctx.lineTo(-W / 2 - 6 - cycle * 3, -H * 0.4);
  } else if (climbing) {
    const k = Math.sin(p.climbPhase * 7 + Math.PI);
    ctx.moveTo(-W / 2 + 2, -H * 0.56);
    ctx.lineTo(-W / 2 - 3, -H * 0.56 + 8 - k * 5);
    ctx.moveTo(W / 2 - 2, -H * 0.56);
    ctx.lineTo(W / 2 + 3, -H * 0.56 + 8 + k * 5);
  } else if (!p.onGround) {
    ctx.moveTo(-W / 2 + 2, -H * 0.56);
    ctx.lineTo(-W / 2 - 5, -H * 0.44);
    ctx.moveTo(W / 2 - 2, -H * 0.56);
    ctx.lineTo(W / 2 + 5, -H * 0.74);
  } else if (winning) {
    ctx.moveTo(-W / 2 + 2, -H * 0.56);
    ctx.lineTo(-W / 2 - 5, -H * 0.86);
    ctx.moveTo(W / 2 - 2, -H * 0.56);
    ctx.lineTo(W / 2 + 5, -H * 0.86);
  } else {
    ctx.moveTo(-W / 2 + 2, -H * 0.56);
    ctx.lineTo(-W / 2 - 3 - cycle * 5, -H * 0.4);
    ctx.moveTo(W / 2 - 2, -H * 0.56);
    ctx.lineTo(W / 2 + 3 + cycle * 5, -H * 0.4);
  }
  ctx.stroke();

  // Head: mask with big lenses.
  ctx.fillStyle = suit.mask;
  ctx.beginPath();
  ctx.arc(0, -H * 0.78, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = suit.eye;
  ctx.strokeStyle = suit.trim;
  ctx.lineWidth = 1.5;
  const blink = hurt ? 0.6 : 1;
  for (const lx of [-4.4, 4.4]) {
    ctx.beginPath();
    ctx.ellipse(lx, -H * 0.79, 3.8, 3.1 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (winning) {
    ctx.strokeStyle = suit.trim;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -H * 0.68, 3.4, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();

  // The web line itself.
  if (p.rope) {
    drawWebLine(ctx, { x: cx + face * 6, y: p.y + 6 }, { x: p.rope.ax, y: p.rope.ay }, 2.4, COLORS.web, 0.95);
    ctx.save();
    ctx.fillStyle = COLORS.web;
    ctx.beginPath();
    ctx.arc(p.rope.ax, p.rope.ay, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Shooting flash on the hand.
  if (p.shootAnim > 0) {
    ctx.save();
    ctx.globalAlpha = p.shootAnim / 0.32;
    ctx.strokeStyle = COLORS.web;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx + face * 8, p.y + 8, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** A cartoon Web-Bot. Wrapped bots get a web cocoon and spin. */
export function drawBot(ctx, e, t) {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  if (e.wrapped) ctx.rotate((e.spin || 0) * 0.4);
  const bob = Math.sin(e.animT * 4) * 2;
  ctx.translate(0, bob);

  ctx.fillStyle = e.wrapped ? 'rgba(230,240,255,0.95)' : '#8fa8c8';
  roundRect(ctx, -e.w / 2, -e.h / 2, e.w, e.h, 8);
  ctx.fill();
  ctx.strokeStyle = '#3d4f6b';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  if (!e.wrapped) {
    ctx.fillStyle = '#2b3a52';
    roundRect(ctx, -e.w / 2 + 5, -e.h / 2 + 6, e.w - 10, 12, 4);
    ctx.fill();
    const glow = Math.sin(t * 6 + e.phase) * 0.5 + 0.5;
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(-7, -e.h / 2 + 12, 2.6 + glow, 0, Math.PI * 2);
    ctx.arc(7, -e.h / 2 + 12, 2.6 + glow, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2b3a52';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -e.h / 2 + 26);
    ctx.lineTo(6, -e.h / 2 + 26);
    ctx.stroke();
    // Arms.
    ctx.strokeStyle = '#5d7595';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-e.w / 2, -4);
    ctx.lineTo(-e.w / 2 - 8, -4 + Math.sin(e.animT * 4) * 4);
    ctx.moveTo(e.w / 2, -4);
    ctx.lineTo(e.w / 2 + 8, -4 - Math.sin(e.animT * 4) * 4);
    ctx.stroke();
  } else {
    // Cocoon lines.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(-e.w / 2, -e.h / 2 + 8 + i * 9);
      ctx.lineTo(e.w / 2, -e.h / 2 + 4 + i * 9);
      ctx.moveTo(e.w / 2, -e.h / 2 + 8 + i * 9);
      ctx.lineTo(-e.w / 2, -e.h / 2 + 4 + i * 9);
    }
    ctx.stroke();
  }
  ctx.restore();

  if (e.wrapped) {
    ctx.save();
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.max(0, e.wrapT).toFixed(1)}s`, cx, e.y - 8);
    ctx.restore();
  }
}

/** Coins, stars and hidden tokens. */
export function drawPickup(ctx, it, t) {
  ctx.save();
  ctx.translate(it.x, it.y);
  if (it.pop > 0) {
    const k = it.pop;
    ctx.globalAlpha = Math.max(0, k);
    ctx.scale(1 + (1 - k) * 1.6, 1 + (1 - k) * 1.6);
  }
  ctx.translate(0, Math.sin(t * 3 + (it.spin || 0)) * 3);

  if (it.type === PICKUP.COIN) {
    // Spinning coin: squeeze horizontally as it turns.
    const spin = Math.cos(t * 3 + (it.spin || 0));
    ctx.scale(Math.max(0.15, Math.abs(spin)), 1);
    ctx.fillStyle = COLORS.coin;
    ctx.strokeStyle = '#c98a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, it.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(-it.r * 0.3, -it.r * 0.3, it.r * 0.25, it.r * 0.35, -0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (it.type === PICKUP.STAR) {
    ctx.fillStyle = COLORS.star;
    ctx.strokeStyle = '#c98a1a';
    ctx.lineWidth = 2;
    star(ctx, 0, 0, 5, it.r + 3, it.r * 0.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(-3, -4, 2.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Secret token: a little gift box with a ribbon.
    const r = it.r;
    ctx.fillStyle = '#2ec4a6';
    roundRect(ctx, -r, -r * 0.8, r * 2, r * 1.6, 5);
    ctx.fill();
    ctx.strokeStyle = '#0c6b5f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-r * 0.9, -r * 0.8, r * 1.8, r * 0.4);
    ctx.fillRect(-r * 0.18, -r * 1.1, r * 0.36, r * 2);
    ctx.fillStyle = COLORS.token;
    ctx.beginPath();
    ctx.arc(0, -r * 1.05, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawPowerup(ctx, pu, t) {
  const info = POWER_INFO[pu.type] || { color: '#fff', icon: '?' };
  ctx.save();
  ctx.translate(pu.x, pu.y + Math.sin(t * 2.5 + (pu.phase || 0)) * 4);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
  g.addColorStop(0, info.color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.rotate(Math.sin(t * 1.6) * 0.25);
  ctx.fillStyle = info.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2;
  roundRect(ctx, -13, -13, 26, 26, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#12182c';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(info.icon, 0, 1);
  ctx.restore();
}

/** A fixed web anchor above a gap: a glowing hook point. */
export function drawAnchor(ctx, a, t) {
  ctx.save();
  const pulse = 0.5 + Math.sin(t * 2 + a.phase) * 0.2;
  ctx.globalAlpha = 0.35 + pulse * 0.4;
  ctx.strokeStyle = COLORS.web;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(a.x, a.y, 11 + pulse * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.5 + pulse * 0.4;
  ctx.fillStyle = COLORS.web;
  ctx.beginPath();
  ctx.arc(a.x, a.y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawCheckpoint(ctx, c, t) {
  ctx.save();
  ctx.strokeStyle = c.reached ? COLORS.ui.good : COLORS.ui.dim;
  ctx.fillStyle = c.reached ? COLORS.ui.good : COLORS.ui.dim;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(c.x, c.y - 66);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 66);
  ctx.lineTo(c.x + 32, c.y - 55);
  ctx.lineTo(c.x, c.y - 44);
  ctx.closePath();
  ctx.fill();
  if (c.reached) {
    ctx.globalAlpha = 0.25 + Math.sin(t * 4) * 0.15;
    ctx.beginPath();
    ctx.arc(c.x + 4, c.y - 32, 28, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The goal: a big friendly flag with a waving web banner. */
export function drawGoal(ctx, goal, t) {
  ctx.save();
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(goal.x, goal.y);
  ctx.lineTo(goal.x, goal.y - 110);
  ctx.stroke();
  ctx.fillStyle = COLORS.ui.accent;
  ctx.beginPath();
  ctx.moveTo(goal.x, goal.y - 110);
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    ctx.lineTo(goal.x + 62 * k, goal.y - 110 + Math.sin(t * 5 + k * 4) * 7);
  }
  ctx.lineTo(goal.x, goal.y - 74);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COLORS.web;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Sparkle ring.
  ctx.globalAlpha = 0.35 + Math.sin(t * 3) * 0.2;
  ctx.strokeStyle = COLORS.ui.good;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.lineDashOffset = -t * 20;
  ctx.beginPath();
  ctx.arc(goal.x, goal.y - 60, 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function star(ctx, cx, cy, spikes, outer, inner) {
  let rot = -Math.PI / 2;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outer);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
    rot += step;
  }
  ctx.closePath();
}

export function drawWebLine(ctx, a, b, width = 2, color = COLORS.web, alpha = 0.9) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

export function starPath(ctx, cx, cy, spikes, outer, inner) {
  star(ctx, cx, cy, spikes, outer, inner);
}