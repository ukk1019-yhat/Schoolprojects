/**
 * WallClimbing: grabbing, scaling and mantling walls, plus the ceiling crawl.
 *
 * Everything here operates on the shared player/world/input shape so the
 * PlayerController can stay focused on ground and air movement.
 */
import { PHYS, PLAYER_STATE } from './constants.js';
import { clamp, easeOutCubic, lerp } from '../core/math.js';

const GRAB_REACH = 30;

/** Thin strip just above the head, used to find a surface to crawl under. */
function ceilingAt(player, world) {
  const top = player.y;
  const hits = world.query(player.x - 4, top - 20, player.w + 8, 26, []);
  let best = null;
  for (const s of hits) {
    if (!s.active) continue;
    const bottom = s.y + s.h;
    if (bottom < top - 22 || bottom > top + 10) continue;
    if (!best || bottom > best.y + best.h) best = s;
  }
  return best;
}

/** Which climbable face (if any) is within reach of the body. */
export function probeClimbDir(player, world) {
  const top = player.y;
  const bottom = player.y + player.h;
  for (const dir of [1, -1]) {
    const face = world.findClimbFace(dir > 0 ? player.x + player.w : player.x - 6, top, bottom - top, dir);
    if (!face) continue;
    const faceX = dir > 0 ? face.x : face.x + face.w;
    const near = Math.abs(faceX - (dir > 0 ? player.x + player.w : player.x));
    if (near < 22 && top < face.y + face.h - 4 && bottom > face.y + GRAB_REACH) return dir;
  }
  return 0;
}

export function enterClimb(player, world, dir) {
  const face = world.findClimbFace(dir > 0 ? player.x + player.w : player.x - 6, player.y, player.h, dir);
  if (!face) return false;
  player.state = PLAYER_STATE.CLIMB;
  player.climbWall = face;
  player.climbDir = dir;
  player.crawlCeiling = null;
  player.rope = null;
  player.vx = 0;
  player.vy = 0;
  player.jumpBuffer = 0;
  player.climbSliding = true;
  snapToFace(player);
  return true;
}

function snapToFace(player) {
  const wall = player.climbWall;
  if (!wall) return;
  if (player.climbDir > 0) player.x = wall.x - player.w;
  else player.x = wall.x + wall.w;
}

export function exitClimb(player, pushVx = 0) {
  player.state = player.onGround ? PLAYER_STATE.IDLE : PLAYER_STATE.FALL;
  player.climbWall = null;
  player.climbDir = 0;
  player.vx = pushVx;
}

/**
 * Scales the wall. Up/down moves, letting go pushes away from the wall, and
 * reaching the top mantles onto the roof. Pressing jump at any time leaps off.
 */
export function updateClimb(player, world, dt, input, ctx) {
  const wall = player.climbWall;
  if (!wall || !wall.active) {
    exitClimb(player, 0);
    return;
  }
  snapToFace(player);
  player.facing = player.climbDir;

  // A ceiling right overhead means the climb turns into a crawl.
  if (ceilingAt(player, world)) {
    enterCrawl(player, world);
    return;
  }

  const up = input.isDown('up');
  const down = input.isDown('down');
  let climbVy = 0;
  if (up && !down) climbVy = -PHYS.climbSpeed;
  else if (down && !up) climbVy = PHYS.climbSpeed * 0.8;
  player.climbSliding = !up && !down;

  if (input.wasPressed('jump')) {
    player.climbWall = null;
    player.climbDir = 0;
    player.vx = -player.facing * 380;
    player.vy = -PHYS.climbJump * 0.9;
    player.jumpsUsed = 1;
    player.jumpBuffer = 0;
    player.onGround = false;
    player.state = PLAYER_STATE.JUMP;
    ctx?.onWallJump?.(player);
    return;
  }

  // Pushing away from the wall lets go.
  if (input.axisX === -player.climbDir && input.axisX !== 0) {
    exitClimb(player, -player.climbDir * 150);
    return;
  }

  const prevBottom = player.y + player.h;
  player.vy = climbVy;
  if (climbVy !== 0) {
    const res = world.moveY(player, climbVy * dt, prevBottom);
    if (res.ceiling && climbVy < 0) player.vy = 0;
    if (res.ground && climbVy > 0) player.vy = 0;
  } else {
    player.vy = 0;
  }
  player.climbPhase += Math.abs(climbVy) * dt * 0.03 + (player.climbSliding ? dt * 1.1 : 0);

  // Reached the top: pull up onto the roof.
  if (climbVy < 0 && player.y <= wall.y + 8) {
    const targetY = wall.y - player.h - 0.5;
    const halfW = player.w / 2;
    const lo = wall.x + halfW + 1;
    const hi = wall.x + wall.w - halfW - 1;
    const candidates = hi > lo ? [clamp(player.cx, lo, hi) - halfW] : [];
    candidates.push(player.x, player.x + halfW, player.x - halfW);
    for (const tx of candidates) {
      if (!world.isFree(tx, targetY, player.w, player.h)) continue;
      startMantle(player, tx, targetY);
      return;
    }
    for (const lift of [targetY, targetY - 2, targetY - 4]) {
      if (!world.isFree(player.x, lift, player.w, player.h)) continue;
      player.y = lift;
      player.vy = 0;
      break;
    }
  }

  if (player.y + player.h > wall.y + wall.h + 4) exitClimb(player, 0);
}

export function startMantle(player, tx, ty) {
  player.state = PLAYER_STATE.MANTLE;
  player.mantle = { t: 0, dur: PHYS.mantleTime, fx: player.x, fy: player.y, tx, ty };
  player.vx = 0;
  player.vy = 0;
  player.climbWall = null;
}

export function updateMantle(player, dt) {
  const m = player.mantle;
  if (!m) {
    player.state = PLAYER_STATE.IDLE;
    return;
  }
  m.t += dt;
  const k = easeOutCubic(Math.min(1, m.t / m.dur));
  player.x = lerp(m.fx, m.tx, k);
  player.y = lerp(m.fy, m.ty, k);
  player.runPhase += dt * 8;
  if (m.t >= m.dur) {
    player.mantle = null;
    player.state = PLAYER_STATE.IDLE;
    player.onGround = true;
    player.coyote = PHYS.coyoteTime;
    player.jumpsUsed = 0;
    player.vy = 0;
  }
}

/* ---------------------------------------------------------------- *
 * Ceiling crawl
 * ---------------------------------------------------------------- */

export function enterCrawl(player, world) {
  const ceil = ceilingAt(player, world);
  if (!ceil) return false;
  player.state = PLAYER_STATE.CRAWL;
  player.crawlCeiling = ceil;
  player.climbWall = null;
  player.climbDir = 0;
  player.rope = null;
  player.vy = 0;
  player.y = ceil.y + ceil.h;
  player.onGround = false;
  player.jumpsUsed = 1;
  return true;
}

/**
 * Hangs from the underside of a surface and shuffles along it. Letting go of
 * the direction (or walking off the edge) drops the hero back into free fall.
 */
export function updateCrawl(player, world, dt, input, ctx) {
  const ceil = ceilingAt(player, world);
  if (!ceil) {
    player.crawlCeiling = null;
    player.state = PLAYER_STATE.FALL;
    player.vy = 0;
    return;
  }
  player.crawlCeiling = ceil;
  player.y = ceil.y + ceil.h;
  player.vy = 0;

  const ax = input.axisX;
  if (ax !== 0) {
    player.facing = ax;
    const hit = world.moveX(player, ax * PHYS.crawlSpeed * dt);
    if (hit) player.vx = 0;
    else player.vx = ax * PHYS.crawlSpeed;
  } else {
    player.vx = 0;
  }
  player.climbPhase += dt * 6;

  if (input.wasPressed('jump')) {
    player.state = PLAYER_STATE.JUMP;
    player.vy = -PHYS.jumpVel * 0.85;
    player.crawlCeiling = null;
    player.jumpBuffer = 0;
    ctx?.onJump?.(player);
    return;
  }
  if (input.isDown('down')) {
    player.crawlCeiling = null;
    player.state = PLAYER_STATE.FALL;
    player.vy = 40;
  }
}

/** True when a crawlable ceiling is right overhead (used for the entry hint). */
export function hasCeiling(player, world) {
  return !!ceilingAt(player, world);
}

export { ceilingAt };
