/**
 * UIManager: owns the HUD, all menu screens and pointer routing.
 *
 * Menus hand back a list of `{ id, rect }` regions; the manager converts the
 * pointer into logical coordinates, reports hover and clicks, and never lets
 * gameplay input leak through while a menu is open.
 */
import { STATE, VIEW_W, VIEW_H, PLAYER_STATE } from '../game/constants.js';
import { Hud } from './hud.js';
import { Screens } from './screens.js';

export class UIManager {
  constructor(input, audio = null) {
    this.input = input;
    this.audio = audio;
    this.hud = new Hud();
    this.screens = new Screens();
    this.pointer = { x: -1, y: -1, active: false };
    this.hoverId = null;
    this.clickedId = null;
    this.regions = [];
    this.pauseRegions = [];
    this._pointerDown = false;
    this._listen();
  }

  get menuOpen() {
    return this._menuOpen === true;
  }

  setMenuOpen(on) {
    this._menuOpen = on;
    this.input.enabled = !on;
  }

  _listen() {
    this.canvas = this.input.canvas;
    if (!this.canvas) return;
    this.canvas.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left) / r.width) * VIEW_W;
      this.pointer.y = ((e.clientY - r.top) / r.height) * VIEW_H;
      this.pointer.active = true;
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.pointer.active = false;
      this.pointer.x = -1;
    });
  }

  _hot(r) {
    const p = this.pointer;
    return p.active && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  /** Called by the app shell. Draws whatever belongs to the current state. */
  render(state, ctx, data = {}) {
    const p = this.pointer;
    const hot = (r) => this._hot(r);
    let regions = [];
    switch (state) {
      case STATE.MENU:
        regions = this.screens.title(ctx, VIEW_W, VIEW_H, p);
        break;
      case STATE.LEVEL_SELECT:
        regions = this.screens.levelSelect(ctx, VIEW_W, VIEW_H, data.levels, data.unlocked, data.progress, p);
        break;
      case STATE.CHARACTER:
        regions = this.screens.character(ctx, VIEW_W, VIEW_H, data.suit, p);
        break;
      case STATE.HOW_TO_PLAY:
        regions = this.screens.howToPlay(ctx, VIEW_W, VIEW_H, p);
        break;
      case STATE.ACHIEVEMENTS:
        regions = this.screens.achievements(ctx, VIEW_W, VIEW_H, data.achievementList || [], p);
        break;
      case STATE.SETTINGS:
        regions = this.screens.settings(ctx, VIEW_W, VIEW_H, data.settings, p);
        break;
      case STATE.PAUSED:
        regions = this.screens.pause(ctx, VIEW_W, VIEW_H, data.stats || { coins: 0, stars: 0, tokens: 0 }, p);
        break;
      case STATE.GAME_OVER:
        regions = this.screens.gameOver(ctx, VIEW_W, VIEW_H, p);
        break;
      case STATE.LEVEL_COMPLETE:
        regions = this.screens.levelComplete(ctx, VIEW_W, VIEW_H, data.level, data.stats, data.rating, data.isLast, p, data.score, data.achievements);
        break;
      case STATE.FINAL_VICTORY:
        regions = this.screens.finalVictory(ctx, VIEW_W, VIEW_H, data.totalScore || 0, p);
        break;
      case STATE.PLAYING:
        this.hud.draw(ctx, {
          game: data.game,
          camera: data.camera,
          viewW: VIEW_W,
          viewH: VIEW_H,
          progress: data.progress01 || 0,
          level: data.level,
        });
        // Corner pause button plus a tutorial skip, both normal hit regions.
        this.regions = [{ id: 'pause', rect: { x: 890, y: 14, w: 52, h: 40 } }];
        if (data.game?.coach?.enabled && !data.game.coach.finished) {
          this.regions.push({ id: 'tutorial:skip', rect: { x: 762, y: 14, w: 116, h: 40 } });
        }
        this.hoverId = this.regions.find((r) => this._hot(r.rect))?.id ?? null;
        return;
      default:
        break;
    }
    this.regions = regions;
    this.hoverId = regions.find((r) => hot(r.rect))?.id ?? null;
    this.pauseRegions = state === STATE.PLAYING ? regions : this.pauseRegions;
  }

  /** Returns the id of the region clicked this frame, or null. */
  pollClick(state) {
    const down = this.input.pointer.clicked || this._pointerDown;
    this._pointerDown = false;
    if (!down) {
      this.clickedId = null;
      return null;
    }
    const hit = this.regions.find((r) => this._hot(r.rect));
    this.clickedId = hit?.id ?? null;
    if (hit) this.audio?.click?.();
    return this.clickedId;
  }

  /** True while a finger/mouse is holding on a menu, for visual press feedback. */
  setPointerDown(on) {
    this._pointerDown = on;
  }

  /** Slider value 0..1 for a settings region, or null. */
  sliderValue(id) {
    const r = this.regions.find((x) => x.id === id);
    if (!r || !this._hot(r.rect)) return null;
    const inner = r.rect.w - 8;
    return Math.max(0, Math.min(1, (this.pointer.x - r.rect.x - 4) / inner));
  }
}

export { PLAYER_STATE };