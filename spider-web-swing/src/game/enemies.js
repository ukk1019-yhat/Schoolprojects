/**
 * Web-Bots: friendly-ish cartoon robots that patrol a rooftop.
 *
 * They are never a threat you cannot handle: touching one costs a heart and
 * knocks the hero away, and a single web shot wraps one up for a few seconds.
 */
import { PHYS } from './constants.js';
import { aabb, damp } from '../core/math.js';

const WRAP_TIME = 4.5;

export function updateEnemies(game, dt) {
  const p = game.player;
  for (const e of game.level.enemies) {
    e.animT += dt;

    if (e.wrapped) {
      e.wrapT -= dt;
      // Wrapped bots sink gently and spin, then pop free and carry on.
      e.y = damp(e.y, e.homeY - 6, 2, dt);
      e.spin = (e.spin || 0) + dt * 1.6;
      if (e.wrapT <= 0) {
        e.wrapped = false;
        e.spin = 0;
        e.y = e.homeY;
        game.events.onBotFreed?.(e);
      }
      continue;
    }

    // Patrol: a lazy back and forth around the spawn point.
    const tx = e.homeX + Math.sin(e.animT * (e.speed / 90) + e.phase) * e.range;
    e.x = damp(e.x, tx, 4, dt);
    e.y = damp(e.y, e.homeY + Math.sin(e.animT * 2.4 + e.phase) * 5, 6, dt);
    e.vx = 0;
    e.vy = 0;
    e.spin = 0;

    if (aabb(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h) && p.invuln <= 0 && !p.finished) {
      if (p.hurt(1, e.x + e.w / 2, game.playerCtx())) {
        game.stats.bumps++;
        game.events.onBump?.(e);
      }
    }
  }
}

/** Webbed up by a shot. */
export function wrapEnemy(enemy) {
  if (!enemy || enemy.wrapped) return false;
  enemy.wrapped = true;
  enemy.wrapT = WRAP_TIME;
  return true;
}

export { WRAP_TIME, PHYS };