/**
 * SwingPhysics: the rope constraint that makes web-swinging feel good.
 *
 * A single rope with pendulum physics: gravity pulls, the rope redirects the
 * velocity into an arc, left/right pumps add momentum, and letting go converts
 * the arc into forward flight. No scripted paths - every swing is real physics.
 */
import { PHYS, PLAYER_STATE } from './constants.js';
import { sign } from '../core/math.js';

export function attachRope(player, ax, ay, len) {
  const dx = player.cx - ax;
  const dy = player.cy - ay;
  const d = Math.hypot(dx, dy) || 1;
  const want = len != null ? len : d * 0.97;
  player.rope = {
    ax,
    ay,
    len: Math.max(PHYS.ropeMin, Math.min(PHYS.ropeMax, want)),
  };
  player.state = PLAYER_STATE.SWING;
  player.climbWall = null;
  player.climbDir = 0;
  player.crawlCeiling = null;
  player.mantle = null;
  player.onGround = false;
  player.swingTime = 0;
}

export function detachRope(player, boost = true) {
  if (player.rope && boost) {
    player.vx *= PHYS.swingReleaseBoost;
    player.vy = Math.min(player.vy * 0.97, PHYS.maxFall);
  }
  player.rope = null;
  if (player.state === PLAYER_STATE.SWING) player.state = PLAYER_STATE.FALL;
}

function capSpeed(player) {
  const sp = Math.hypot(player.vx, player.vy);
  if (sp > PHYS.maxSpeed) {
    const k = PHYS.maxSpeed / sp;
    player.vx *= k;
    player.vy *= k;
  }
}

/** One simulation step while attached to a web. */
export function updateSwing(player, world, dt, input, ctx) {
  const rope = player.rope;
  if (!rope) {
    player.state = PLAYER_STATE.FALL;
    return;
  }
  player.swingTime = (player.swingTime || 0) + dt;

  // Reel in with up, let out with down.
  if (input.isDown('up')) rope.len = Math.max(PHYS.ropeMin, rope.len - PHYS.reelSpeed * dt);
  if (input.isDown('down')) rope.len = Math.min(PHYS.ropeMax, rope.len + PHYS.reelSpeed * dt);

  // Gravity plus the pump. Pumping sideways is how a swing gains energy.
  player.vy = Math.min(player.vy + PHYS.gravity * PHYS.swingGravity * dt, PHYS.maxFall);
  const ax = input.axisX;
  player.vx += ax * PHYS.swingPump * dt;
  player.vx *= Math.pow(PHYS.swingDrag, dt * 60);
  if (ax !== 0) player.facing = ax;
  else if (Math.abs(player.vx) > 8) player.facing = sign(player.vx);

  const wasVx = player.vx;
  if (player.vx !== 0) {
    const blocked = world.moveX(player, player.vx * dt);
    if (blocked) player.vx = wasVx * 0.2;
  }
  const prevBottom = player.y + player.h;
  const wasVy = player.vy;
  const res = world.moveY(player, player.vy * dt, prevBottom);
  player.groundRef = res.ground;
  if (res.ceiling && player.vy < 0) player.vy = 0;
  if (res.ground) {
    // Feet touched a rooftop: land and let the web go quietly.
    player.onGround = true;
    player.vy = 0;
    player.coyote = PHYS.coyoteTime;
    player.jumpsUsed = 0;
    player.landSquash = 0.2;
    if (wasVy > 400) ctx?.onLand?.(player, Math.min(1, wasVy / 900));
    player.rope = null;
    player.state = PLAYER_STATE.IDLE;
    return;
  }

  // Rope constraint: never let the hero travel further than the rope allows.
  const dx = player.cx - rope.ax;
  const dy = player.cy - rope.ay;
  const d = Math.hypot(dx, dy);
  if (d > rope.len && d > 0.001) {
    const beforeX = player.x;
    const beforeY = player.y;
    const nx = dx / d;
    const ny = dy / d;
    player.x = rope.ax + nx * rope.len - player.w / 2;
    player.y = rope.ay + ny * rope.len - player.h / 2;
    const radial = player.vx * nx + player.vy * ny;
    if (radial > 0) {
      player.vx -= nx * radial;
      player.vy -= ny * radial;
    }
    // If the correction pushed the hero inside a wall, undo it rather than
    // letting the constraint tunnel through solid geometry.
    if (!world.isFree(player.x, player.y, player.w, player.h)) {
      player.x = beforeX;
      player.y = beforeY;
    }
    player.ropeTaut = 1;
  } else {
    player.ropeTaut = 0;
  }

  capSpeed(player);
}

/** Flat flight: gravity, steering and the velocity cap. */
export function applyAirFlight(player, dt, input) {
  player.vy = Math.min(player.vy + PHYS.gravity * dt, PHYS.maxFall);
  const ax = input.axisX;
  if (ax !== 0) {
    player.vx += ax * PHYS.airAccel * dt;
    player.facing = ax;
  }
  capSpeed(player);
}
