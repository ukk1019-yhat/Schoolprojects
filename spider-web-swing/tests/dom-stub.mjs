/**
 * Minimal CanvasRenderingContext2D stand-in. Records calls and validates
 * numeric arguments, so drawing code that passes NaN to the API is caught
 * instead of silently rendering nothing in a real browser.
 */

const NUMERIC = new Set([
  'fillRect', 'strokeRect', 'clearRect', 'rect', 'roundRect', 'moveTo', 'lineTo',
  'arc', 'arcTo', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'translate',
  'scale', 'rotate', 'setTransform', 'transform', 'drawImage',
]);

function makeGradient() {
  return { addColorStop() {} };
}

export class JSDOMStub {
  constructor() {
    this.calls = 0;
    this.badNumbers = [];
    this.texts = [];
    this.stats = this;
    const self = this;

    const handler = {
      get(target, prop) {
        if (prop in target) return target[prop];
        // Unknown properties become inert no-ops, mirroring the real API's
        // habit of growing new methods.
        return (...args) => self._record(prop, args);
      },
    };

    this.ctx = new Proxy(
      {
        canvas: { width: VIEW, height: VIEW },
        save() {},
        restore() {},
        beginPath() {},
        closePath() {},
        fill() {},
        stroke() {},
        clip() {},
        measureText: (s) => ({ width: String(s).length * 8 }),
        createLinearGradient: makeGradient,
        createRadialGradient: makeGradient,
        createPattern: () => null,
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        setLineDash() {},
        getLineDash: () => [],
      },
      handler,
    );
  }

  _record(prop, args) {
    this.calls++;
    if (NUMERIC.has(prop)) {
      for (const a of args) {
        if (typeof a === 'number' && !Number.isFinite(a)) {
          this.badNumbers.push(`${prop}(${args.join(', ')})`);
        }
      }
    }
    if (prop === 'fillText' || prop === 'strokeText') this.texts.push(args[0]);
    return undefined;
  }
}

const VIEW = 960;

/** Offscreen canvas stand-in good enough for the render caches. */
class StubCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
    this._ctx = null;
  }

  getContext() {
    if (!this._ctx) this._ctx = new StubCtx(this);
    return this._ctx;
  }
}

class StubCtx {
  constructor(canvas) {
    this.canvas = canvas;
  }

  createLinearGradient() {
    return { addColorStop() {} };
  }

  createRadialGradient() {
    return { addColorStop() {} };
  }

  drawImage() {}
  clearRect() {}
  fillRect() {}
  setTransform() {}
  save() {}
  restore() {}
  beginPath() {}
  closePath() {}
  fill() {}
  stroke() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  quadraticCurveTo() {}
  fillText() {}

  measureText(s) {
    return { width: String(s).length * 8 };
  }
}

export function installDom() {
  if (!globalThis.document) {
    globalThis.document = { createElement: (tag) => (tag === 'canvas' ? new StubCanvas() : {}) };
  }
  return globalThis.document;
}
