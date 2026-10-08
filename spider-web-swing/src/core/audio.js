import { storage } from './storage.js';
import { clamp, clamp01 } from './math.js';

/**
 * All audio is synthesised at runtime with the Web Audio API.
 * No sample files, no third-party or copyrighted music.
 */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.ambienceGain = null;
    this.noiseBuffer = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.soundOn = storage.get('sound') !== false;
    this.musicOn = storage.get('music') !== false;
    this.musicVolume = Number(storage.get('musicVolume') ?? 0.7);
    this.sfxVolume = Number(storage.get('sfxVolume') ?? 0.8);
    this.started = false;
    this._ambienceNodes = [];
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) this._create();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _create() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.55 * this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.master);

    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.0;
    this.ambienceGain.connect(this.master);

    this.noiseBuffer = this._makeNoise(2);
    this._startAmbience();
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  get ready() {
    return !!this.ctx && this.soundOn;
  }

  setSound(on) {
    this.soundOn = !!on;
    storage.set('sound', this.soundOn);
    if (this.master) {
      this.master.gain.setTargetAtTime(this.soundOn ? 0.9 : 0, this.ctx.currentTime, 0.05);
    }
  }

  toggleSound() {
    this.setSound(!this.soundOn);
    return this.soundOn;
  }

  setMusic(on) {
    this.musicOn = !!on;
    storage.set('music', this.musicOn);
    this._applyMusicGain();
  }

  /** 0..1 sliders on the settings screen. Persisted immediately. */
  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, Number(v) || 0));
    storage.set('musicVolume', this.musicVolume);
    this._applyMusicGain();
  }

  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, Number(v) || 0));
    storage.set('sfxVolume', this.sfxVolume);
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(0.55 * this.sfxVolume, this.ctx.currentTime, 0.05);
    }
  }

  _applyMusicGain() {
    if (!this.musicGain) return;
    const target = this.musicOn ? 0.26 * this.musicVolume : 0;
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  // ---------- primitives ----------

  tone({ freq = 440, to = null, dur = 0.18, type = 'sine', gain = 0.3, delay = 0, attack = 0.006, curve = 'exp' }) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(clamp(freq, 20, 18000), t0);
    if (to != null) {
      if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(clamp(to, 20, 18000), t0 + dur);
      else osc.frequency.linearRampToValueAtTime(clamp(to, 20, 18000), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(clamp01(gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise({ dur = 0.2, gain = 0.2, freq = 1200, q = 1, type = 'bandpass', delay = 0, sweepTo = null }) {
    if (!this.ready || !this.noiseBuffer) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(clamp(freq, 40, 16000), t0);
    if (sweepTo != null) filt.frequency.exponentialRampToValueAtTime(clamp(sweepTo, 40, 16000), t0 + dur);
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(clamp01(gain), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  arp(notes, { step = 0.075, type = 'triangle', gain = 0.22 } = {}) {
    notes.forEach((n, i) => this.tone({ freq: n, dur: step * 2.1, type, gain, delay: i * step }));
  }

  // ---------- game sounds ----------

  jump() {
    this.tone({ freq: 320, to: 720, dur: 0.16, type: 'square', gain: 0.16 });
    this.noise({ dur: 0.1, gain: 0.05, freq: 900 });
  }

  wallJump() {
    this.tone({ freq: 420, to: 880, dur: 0.14, type: 'triangle', gain: 0.16 });
  }

  land(strength = 1) {
    this.noise({ dur: 0.12, gain: 0.05 + 0.06 * strength, freq: 420, sweepTo: 140 });
    this.tone({ freq: 150, to: 80, dur: 0.1, type: 'sine', gain: 0.1 * strength });
  }

  webShot() {
    this.noise({ dur: 0.16, gain: 0.1, freq: 2600, sweepTo: 900, q: 0.8 });
    this.tone({ freq: 900, to: 300, dur: 0.12, type: 'sawtooth', gain: 0.06 });
  }

  webHit() {
    this.tone({ freq: 700, to: 1100, dur: 0.1, type: 'triangle', gain: 0.16 });
    this.noise({ dur: 0.12, gain: 0.08, freq: 1800, q: 1.5 });
  }

  webSwing() {
    this.noise({ dur: 0.28, gain: 0.07, freq: 500, sweepTo: 2200, q: 0.7 });
  }

  zip() {
    this.tone({ freq: 300, to: 1400, dur: 0.22, type: 'sine', gain: 0.14 });
  }

  star(index = 0) {
    const base = 660 * Math.pow(1.0595, Math.min(index, 12) * 2);
    this.arp([base, base * 1.26, base * 1.5], { step: 0.055, type: 'triangle', gain: 0.16 });
  }

  /** Cheerful coin pickup: a quick two-note chime. */
  coin(index = 0) {
    const base = 880 * Math.pow(1.03, Math.min(index, 16));
    this.tone({ freq: base, to: base * 1.5, dur: 0.11, type: 'triangle', gain: 0.16 });
    this.tone({ freq: base * 2, dur: 0.07, type: 'sine', gain: 0.09, delay: 0.05 });
  }

  /** Bonus token: a sparklier little fanfare. */
  token() {
    this.arp([784, 1047, 1319, 1568], { step: 0.05, type: 'sine', gain: 0.16 });
  }

  climb() {
    this.tone({ freq: 300, to: 420, dur: 0.08, type: 'triangle', gain: 0.08 });
  }

  bounce() {
    this.tone({ freq: 240, to: 560, dur: 0.13, type: 'square', gain: 0.12 });
  }

  gem() {
    this.arp([784, 988, 1175, 1568], { step: 0.05, type: 'sine', gain: 0.15 });
  }

  powerUp() {
    this.arp([523, 659, 784, 1047, 1319], { step: 0.06, type: 'triangle', gain: 0.17 });
  }

  checkpoint() {
    this.arp([659, 880, 1175], { step: 0.09, type: 'sine', gain: 0.17 });
  }

  hurt() {
    this.tone({ freq: 380, to: 150, dur: 0.22, type: 'square', gain: 0.14 });
    this.tone({ freq: 200, to: 90, dur: 0.26, type: 'sine', gain: 0.12, delay: 0.02 });
  }

  dodge() {
    this.noise({ dur: 0.2, gain: 0.09, freq: 1800, sweepTo: 400, q: 0.6 });
  }

  monsterIdle() {
    this.tone({ freq: 210, to: 165, dur: 0.3, type: 'sawtooth', gain: 0.07 });
  }

  monsterAlert() {
    this.arp([440, 587, 440, 587], { step: 0.11, type: 'square', gain: 0.15 });
  }

  monsterBonk() {
    this.tone({ freq: 160, to: 70, dur: 0.3, type: 'square', gain: 0.13 });
    this.noise({ dur: 0.16, gain: 0.1, freq: 300, sweepTo: 90 });
  }

  monsterConfused() {
    this.tone({ freq: 500, to: 260, dur: 0.18, type: 'triangle', gain: 0.12 });
    this.tone({ freq: 480, to: 300, dur: 0.2, type: 'triangle', gain: 0.1, delay: 0.2 });
  }

  monsterCaught() {
    this.arp([392, 523, 659, 784, 1047], { step: 0.08, type: 'triangle', gain: 0.18 });
  }

  friend() {
    this.arp([523, 659, 784, 1047, 784, 1047, 1319], { step: 0.09, type: 'sine', gain: 0.17 });
  }

  uiClick() {
    this.tone({ freq: 660, to: 880, dur: 0.07, type: 'square', gain: 0.1 });
  }

  uiBack() {
    this.tone({ freq: 520, to: 330, dur: 0.09, type: 'square', gain: 0.09 });
  }

  objective() {
    this.arp([880, 1175], { step: 0.07, type: 'sine', gain: 0.13 });
  }

  levelComplete() {
    this.arp([523, 659, 784, 1047, 1319, 1568], { step: 0.1, type: 'triangle', gain: 0.19 });
  }

  victory() {
    this.arp([523, 659, 784, 1047, 988, 1047, 1319, 1568], { step: 0.12, type: 'sine', gain: 0.2 });
  }

  gameOver() {
    this.arp([494, 440, 392, 330], { step: 0.14, type: 'triangle', gain: 0.16 });
  }

  // ---------- ambience & music ----------

  _startAmbience() {
    if (!this.ctx) return;
    // Soft filtered noise = city air / wind.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.ambienceGain);
    src.start();
    this._ambienceNodes.push(src);

    // Gentle drifting pad for atmosphere.
    const pad = this.ctx.createOscillator();
    const padGain = this.ctx.createGain();
    const padFilter = this.ctx.createBiquadFilter();
    pad.type = 'sine';
    pad.frequency.value = 110;
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 700;
    padGain.gain.value = 0.25;
    pad.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(this.ambienceGain);
    pad.start();
    this._ambienceNodes.push(pad);
    this._padOsc = pad;
  }

  setAmbience(level) {
    if (!this.ambienceGain) return;
    this.ambienceGain.gain.setTargetAtTime(clamp01(level) * 0.25, this.ctx.currentTime, 0.6);
  }

  /** Lightweight generative background loop. Never copyrighted, always in-key. */
  startMusic(mood = 'calm') {
    this.musicMood = mood;
    if (!this.ctx || this.musicTimer) return;
    this._applyMusicGain();
    const patterns = {
      calm: [0, 3, 7, 10, 7, 3],
      chase: [0, 5, 7, 12, 7, 5],
      boss: [0, 3, 6, 7, 10, 12],
      win: [0, 4, 7, 12, 7, 4],
    };
    const root = 196; // G3
    const stepDur = mood === 'chase' ? 0.15 : 0.24;
    this.musicStep = 0;
    const tick = () => {
      if (!this.ctx) return;
      const pat = patterns[this.musicMood] || patterns.calm;
      const semis = pat[this.musicStep % pat.length];
      const freq = root * Math.pow(2, semis / 12);
      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = this.musicMood === 'boss' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.3, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + stepDur * 1.7);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(t0);
      osc.stop(t0 + stepDur * 2);

      if (this.musicStep % 4 === 0) {
        const bass = this.ctx.createOscillator();
        const bg = this.ctx.createGain();
        bass.type = 'sine';
        bass.frequency.setValueAtTime(root / 2, t0);
        bg.gain.setValueAtTime(0.0001, t0);
        bg.gain.linearRampToValueAtTime(0.34, t0 + 0.03);
        bg.gain.exponentialRampToValueAtTime(0.0001, t0 + stepDur * 3);
        bass.connect(bg);
        bg.connect(this.musicGain);
        bass.start(t0);
        bass.stop(t0 + stepDur * 3.4);
      }
      this.musicStep++;
    };
    tick();
    this.musicTimer = setInterval(tick, stepDur * 1000);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  destroy() {
    this.stopMusic();
    for (const n of this._ambienceNodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this._ambienceNodes.length = 0;
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const audio = new AudioEngine();

/** Public name used by the app shell and UI. */
export { AudioEngine as AudioManager };
