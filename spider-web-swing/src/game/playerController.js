/**
 * PlayerController: every way Spider-Man can move through the city.
 *
 * Ground running, jumping, double jumping, wall climbing, ceiling crawling,
 * web swinging (see swingPhysics.js) and the victory pose. Animation state is
 * derived from the physical state each frame, so the renderer never has to
 * guess what the hero is doing.
 */
import { PHYS, PLAYER_W, PLAYER_H, PLAYER_STATE, POWER } from './constants.js';
import { approach, clamp, sign } from '../core/math.js';
import {
  probeClimbDir,
  enterClimb,
  updateClimb,
  startMantle,
  updateMantle,
  enterCrawl,
  updateCrawl,
  hasCeiling,
} from './wallClimbing.js';
import { attachRope, detachRope, updateSwing } from './swingPhysics.js';

export class PlayerController {
  constructor(world) {
    this.world = world;
    this.w = PLAYER_W;
    this.h = PLAYER_H;
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.state = PLAYER_STATE.IDLE;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpsUsed = 0;
    this.wallDir = 0;
    this.climbWall = null;
    this.climbDir = 0;
    this.climbSliding = false;
    this.crawlCeiling = null;
    this.mantle = null;
    this.rope = null;
    this.ropeTaut = 0;
    this.swingTime = 0;
    this.hearts = 3;
    this.maxHearts = 3;
    this.invuln = 0;
    this.hurtTimer = 0;
    this.animT = 0;
    this.runPhase = 0;
    this.climbPhase = 0;
    this.landSquash = 0;
    this.shootAnim = 0;
    this.collectFlash = 0;
    this.powers = {};
    this.dead = false;
    this.finished = false;
    this.trail = [];
    this.groundRef = null;
  }

  spawnAt(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.state = PLAYER_STATE.IDLE;
    this.climbWall = null;
    this.climbDir = 0;
    this.crawlCeiling = null;
    this.mantle = null;
    this.rope = null;
    this.invuln = 0;
    this.hurtTimer = 0;
    this.dead = false;
    this.finished = false;
    this.powers = {};
    this.trail.length = 0;
    this.onGround = false;
    this.jumpsUsed = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.groundRef = null;
  }

  get cx() {
    return this.x + this.w / 2;
  }

  get cy() {
    return this.y + this.h / 2;
  }

  get speedCap() {
    let s = PHYS.runSpeed;
    if (this.powers.speed > 0) s = PHYS.boostSpeed;
    return s;
  }

  grantPower(type, duration) {
    this.powers[type] = Math.max(this.powers[type] || 0, duration);
  }

  hasPower(type) {
    return (this.powers[type] || 0) > 0;
  }

  /* ---------------------------------------------------------------- */

  update(dt, input, ctx) {
    this.animT += dt;
    this._tickTimers(dt);
    if (this.dead) return;

    if (input.wasPressed('jump')) this.jumpBuffer = PHYS.jumpBuffer;

    switch (this.state) {
      case PLAYER_STATE.MANTLE:
        updateMantle(this, dt);
        break;
      case PLAYER_STATE.CLIMB:
        updateClimb(this, this.world, dt, input, ctx);
        break;
      case PLAYER_STATE.CRAWL:
        updateCrawl(this, this.world, dt, input, ctx);
        break;
      case PLAYER_STATE.SWING:
        this._updateSwingState(dt, input, ctx);
        break;
      default:
        this._updateGroundAir(dt, input, ctx);
        break;
    }

    this._clampToWorld();
    this._updateTrail(dt);
  }

  _tickTimers(dt) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.landSquash > 0) this.landSquash -= dt;
    if (this.shootAnim > 0) this.shootAnim -= dt;
    if (this.collectFlash > 0) this.collectFlash -= dt;
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
    if (this.coyote > 0) this.coyote -= dt;
    for (const key of Object.keys(this.powers)) {
      if (this.powers[key] > 0) this.powers[key] -= dt;
    }
  }

  _clampToWorld() {
    const b = this.world.bounds;
    if (this.x < b.left) {
      this.x = b.left;
      if (this.vx < 0) this.vx = 0;
    }
    if (this.x + this.w > b.right) {
      this.x = b.right - this.w;
      if (this.vx > 0) this.vx = 0;
    }
    if (this.y < b.top) {
      this.y = b.top;
      if (this.vy < 0) this.vy = 0;
    }
  }

  _updateTrail(dt) {
    const fast = Math.abs(this.vx) > 300 || this.state === PLAYER_STATE.SWING;
    if (fast) {
      this.trail.push({ x: this.cx, y: this.cy, t: 0, life: this.hasPower(POWER.SPEED) ? 0.34 : 0.2 });
      if (this.trail.length > 14) this.trail.shift();
    }
    for (const p of this.trail) p.t += dt;
    while (this.trail.length && this.trail[0].t > this.trail[0].life) this.trail.shift();
  }

  /* ---------------------------------------------------------------- *
   * Ground and air
   * ---------------------------------------------------------------- */

  _updateGroundAir(dt, input, ctx) {
    const ax = input.axisX;
    const boosting = input.isDown('boost') && ax !== 0;

    const target = ax * (boosting ? PHYS.boostSpeed : this.speedCap);
    const rate = this.onGround
      ? ax === 0 ? PHYS.runDecel : boosting ? PHYS.boostAccel : PHYS.runAccel
      : PHYS.airAccel;
    this.vx = approach(this.vx, target, rate * dt);
    if (ax !== 0) this.facing = ax;

    this.vy = Math.min(this.vy + PHYS.gravity * dt, PHYS.maxFall);

    // Wall detection for climbing.
    this.wallDir = 0;
    if (!this.onGround || input.isDown('up')) {
      if (this.world.wallAt(this.x, this.y, this.h, 1)) this.wallDir = 1;
      else if (this.world.wallAt(this.x, this.y, this.h, -1)) this.wallDir = -1;
    }

    // Grabbing a wall (W / Up) or sticking to a ceiling overhead.
    if (input.isDown('up')) {
      const dir = probeClimbDir(this, this.world);
      if (dir !== 0 && enterClimb(this, this.world, dir)) {
        ctx?.onClimb?.(this);
        return;
      }
      if (!this.onGround && this.vy <= 90 && hasCeiling(this, this.world)) {
        if (enterCrawl(this, this.world)) {
          ctx?.onCrawl?.(this);
          return;
        }
      }
    }

    // Jump: ground, coyote, double jump, then wall jump.
    if (this.jumpBuffer > 0) {
      if (this.onGround || this.coyote > 0) {
        this._doJump(ctx, PHYS.jumpVel);
      } else if (this.jumpsUsed < 2) {
        this._doJump(ctx, PHYS.doubleJumpVel);
        ctx?.onDoubleJump?.(this);
      } else if (this.wallDir !== 0) {
        this.vy = -PHYS.climbJump;
        this.vx = -this.wallDir * 400;
        this.jumpsUsed = 1;
        this.jumpBuffer = 0;
        this.facing = -this.wallDir;
        ctx?.onWallJump?.(this);
      }
    }
    if (this.vy < 0 && !input.isDown('jump')) this.vy *= Math.pow(0.06, dt);

    const prevBottom = this.y + this.h;
    if (this.vx !== 0) {
      const hit = this.world.moveX(this, this.vx * dt);
      if (hit) {
        if (!this._tryLandAssist(hit)) this.vx = 0;
      }
    }
    const res = this.world.moveY(this, this.vy * dt, prevBottom);
    this.groundRef = res.ground;
    if (res.ground) {
      if (!this.onGround && this.vy > 120) {
        this.landSquash = 0.22;
        ctx?.onLand?.(this, Math.min(1, this.vy / 900));
      }
      this.onGround = true;
      this.coyote = PHYS.coyoteTime;
      this.jumpsUsed = 0;
      this.vy = 0;
    } else {
      this.onGround = false;
      this.groundRef = null;
    }
    if (res.ceiling && this.vy < 0) this.vy = 0;

    // Animation state.
    if (this.hurtTimer > 0) {
      this.state = PLAYER_STATE.HURT;
    } else if (!this.onGround) {
      this.state = this.vy < -20 ? PLAYER_STATE.JUMP : PLAYER_STATE.FALL;
    } else if (Math.abs(this.vx) > 24) {
      this.state = PLAYER_STATE.RUN;
    } else {
      this.state = PLAYER_STATE.IDLE;
    }
    if (this.onGround) this.runPhase += Math.abs(this.vx) * dt * 0.055;
  }

  /**
   * Corner correction: a jump that clips the lip of a ledge pulls the hero up
   * onto it instead of slamming into the side, which is what makes the wider
   * rooftop gaps feel fair for small hands.
   */
  _tryLandAssist(hit) {
    if (this.onGround) return false;
    if (this.vy < -PHYS.jumpVel * 0.4) return false;
    const lipY = hit.y - this.h;
    const rise = this.y - lipY;
    if (rise <= -PHYS.landAssist || rise >= PHYS.landAssist) return false;
    if (!this.world.isFree(this.x, lipY - 0.5, this.w, this.h)) return false;
    this.y = lipY - 0.5;
    this.vy = 0;
    this.onGround = true;
    this.coyote = PHYS.coyoteTime;
    this.jumpsUsed = 0;
    this.groundRef = hit;
    this.vx = 0;
    this.state = PLAYER_STATE.IDLE;
    this.landSquash = 0.18;
    return true;
  }

  _doJump(ctx, vel) {
    this.vy = -vel;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpsUsed = Math.max(1, this.jumpsUsed);
    this.state = PLAYER_STATE.JUMP;
    ctx?.onJump?.(this);
  }

  /* ---------------------------------------------------------------- *
   * Web swing
   * ---------------------------------------------------------------- */

  _updateSwingState(dt, input, ctx) {
    const lettingGo =
      input.wasReleased('web') ||
      input.wasPressed('release') ||
      input.wasPressed('jump');
    if (lettingGo) {
      const kick = input.wasPressed('jump');
      detachRope(this, true);
      this.jumpBuffer = 0;
      if (kick) {
        this.vy = Math.min(this.vy, -300);
        ctx?.onSwingKick?.(this);
      }
      ctx?.onWebRelease?.(this);
      this.state = PLAYER_STATE.FALL;
      return;
    }
    updateSwing(this, this.world, dt, input, ctx);
  }

  attachWeb(ax, ay, len) {
    attachRope(this, ax, ay, len);
    this.shootAnim = 0.32;
  }

  releaseWeb(boost = true) {
    detachRope(this, boost);
    if (this.state === PLAYER_STATE.SWING) this.state = PLAYER_STATE.FALL;
  }

  /* ---------------------------------------------------------------- *
   * Damage
   * ---------------------------------------------------------------- */

  hurt(amount, fromX, ctx) {
    if (this.invuln > 0 || this.dead || this.finished) return false;
    this.hearts = Math.max(0, this.hearts - amount);
    this.invuln = PHYS.invulnTime;
    this.hurtTimer = 0.34;
    this.state = PLAYER_STATE.HURT;
    this.climbWall = null;
    this.climbDir = 0;
    this.crawlCeiling = null;
    this.mantle = null;
    this.rope = null;
    const dir = this.cx < fromX ? -1 : 1;
    this.vx = dir * PHYS.hurtKnock;
    this.vy = -300;
    this.onGround = false;
    if (this.hearts <= 0) this.dead = true;
    ctx?.onHurt?.(this, amount);
    return true;
  }

  heal(n = 1) {
    this.hearts = clamp(this.hearts + n, 0, this.maxHearts);
  }

  celebrate() {
    this.state = PLAYER_STATE.WIN;
    this.vx = 0;
    this.vy = 0;
    this.rope = null;
    this.finished = true;
  }
}

/** Back-compat alias for modules that still import { Player }. */
export const Player = PlayerController;
export { PLAYER_STATE, sign };
