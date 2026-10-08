import { storage } from './storage.js';

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'web', 'release', 'boost'];

const KEY_MAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyE: 'web',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
};

const PREVENT_DEFAULT = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space',
]);

export class Input {
  constructor(target = window, canvas = null) {
    this.target = target;
    this.canvas = canvas;
    this.held = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.anyKeyPressed = false;
    this.pointer = { x: 0, y: 0, active: false, clicked: false };
    this.enabled = true;
    this._bound = [];
    this._listeners = new Set();
    this._install();
  }

  _on(el, type, fn, opts) {
    el.addEventListener(type, fn, opts);
    this._bound.push([el, type, fn, opts]);
  }

  _install() {
    this._on(this.target, 'keydown', (e) => {
      if (e.repeat) return;
      const action = KEY_MAP[e.code];
      if (PREVENT_DEFAULT.has(e.code) && !e.ctrlKey && !e.metaKey) e.preventDefault();
      if (!action) {
        this.anyKeyPressed = true;
        this._emit('key', e);
        return;
      }
      this.anyKeyPressed = true;
      this._emit('key', e);
      if (!this.enabled) return;
      if (!this.held.has(action)) this.pressedSet.add(action);
      this.held.add(action);
    });

    this._on(this.target, 'keyup', (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      this.held.delete(action);
      this.releasedSet.add(action);
    });

    // Losing focus must not leave keys stuck down.
    this._on(window, 'blur', () => this.releaseAll());

    const canvas = this.canvas;
    if (canvas) {
      this._on(canvas, 'pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        this.pointer.x = (e.clientX - r.left) / r.width;
        this.pointer.y = (e.clientY - r.top) / r.height;
        this.pointer.active = true;
      });
      this._on(canvas, 'pointerdown', (e) => {
        const r = canvas.getBoundingClientRect();
        this.pointer.x = (e.clientX - r.left) / r.width;
        this.pointer.y = (e.clientY - r.top) / r.height;
        this.pointer.active = true;
        this.pointer.clicked = true;
        if (!this.enabled) return;
        // Left button shoots a web, right button lets go of it.
        const action = e.button === 2 ? 'release' : 'web';
        if (!this.held.has(action)) this.pressedSet.add(action);
        this.held.add(action);
      });
      this._on(window, 'pointerup', () => {
        for (const a of ['web', 'release']) {
          this.pressedSet.delete(a);
          if (this.held.has(a)) {
            this.held.delete(a);
            this.releasedSet.add(a);
          }
        }
      });
      this._on(canvas, 'contextmenu', (e) => e.preventDefault());
    }
  }

  /** Subscribe to raw key events (menus, pause, mute). Returns an unsubscribe fn. */
  onKey(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(type, e) {
    for (const fn of this._listeners) fn(e, type);
  }

  isDown(action) {
    return this.held.has(action);
  }

  /** True only on the frame the action began. */
  wasPressed(action) {
    return this.pressedSet.has(action);
  }

  wasReleased(action) {
    return this.releasedSet.has(action);
  }

  /** Virtual button input for touch controls. */
  virtualPress(action) {
    if (!this.enabled) return;
    if (!this.held.has(action)) this.pressedSet.add(action);
    this.held.add(action);
  }

  virtualRelease(action) {
    if (this.held.has(action)) this.releasedSet.add(action);
    this.held.delete(action);
  }

  get axisX() {
    return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
  }

  get axisY() {
    return (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
  }

  releaseAll() {
    for (const a of this.held) this.releasedSet.add(a);
    this.held.clear();
  }

  /** Call once at the end of every frame. */
  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.pointer.clicked = false;
    this.anyKeyPressed = false;
  }

  destroy() {
    for (const [el, type, fn, opts] of this._bound) el.removeEventListener(type, fn, opts);
    this._bound.length = 0;
    this._listeners.clear();
  }
}

export function prefersTouch() {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
  );
}

export function shouldShowTouchControls() {
  const mode = storage.get('showTouch');
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return prefersTouch();
}

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}
