/**
 * App shell: canvas letterboxing, the fixed-timestep loop and the screen
 * state machine. All gameplay lives in Game; all drawing in Renderer/Hud.
 */
import { STATE, VIEW_W, VIEW_H, FIXED_DT, MAX_STEPS } from './game/constants.js';
import { Input, shouldShowTouchControls, prefersReducedMotion } from './core/input.js';
import { AudioManager } from './core/audio.js';
import { storage } from './core/storage.js';
import { evaluateAchievements, achievementProgress } from './core/achievements.js';
import { CameraController } from './core/camera.js';
import { Game } from './game/game.js';
import { Coach } from './game/tutorial.js';
import { LEVEL_IDS, LEVEL_META, getLevel } from './game/levels.js';
import { Renderer } from './render/renderer.js';
import { UIManager } from './ui/uiManager.js';
import { TouchControls } from './ui/touch.js';

const WIN_DELAY = 1.5;

class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.baseScale = 1;

    this.input = new Input(window, canvas);
    this.audio = new AudioManager();
    this.camera = new CameraController(VIEW_W, VIEW_H);
    this.camera.reducedMotion = prefersReducedMotion();
    this.renderer = new Renderer(this.ctx);
    this.ui = new UIManager(this.input, this.audio);
    this.touch = new TouchControls(this.input, canvas);

    this.state = STATE.MENU;
    this.backState = STATE.MENU;
    this.game = null;
    this.levelIndex = 0;
    this.level = null;
    this.winTimer = 0;
    this.totalScore = 0;
    this.settings = this._loadSettings();
    this.renderer.setSuit(this.settings.suit);

    this._acc = 0;
    this._last = 0;
    this._raf = 0;
    this._resize = this._resize.bind(this);
    this._loop = this._loop.bind(this);

    window.addEventListener('resize', this._resize);
    window.addEventListener('orientationchange', this._resize);
    this._resize();

    this.touch.setVisible(shouldShowTouchControls());
    this._wireKeys();
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._loop);
    // Browsers only allow audio after a real interaction.
    const unlock = () => {
      this.audio.unlock?.();
      // The music engine could not start before this moment.
      this._syncMusic();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /* ---------------------------------------------------------------- */

  _loadSettings() {
    return {
      suit: storage.get('suit') || 'classic',
      musicVolume: storage.get('musicVolume') ?? 0.7,
      sfxVolume: storage.get('sfxVolume') ?? 0.8,
      reducedEffects: !!storage.get('reducedEffects'),
      showTouch: storage.get('showTouch') || 'auto',
    };
  }

  _applySettings() {
    this.audio.setMusicVolume(this.settings.musicVolume);
    this.audio.setSfxVolume(this.settings.sfxVolume);
    this.renderer.setSuit(this.settings.suit);
    this.camera.reducedMotion = this.settings.reducedEffects || prefersReducedMotion();
    this.touch.setVisible(shouldShowTouchControls());
  }

  _resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const availW = window.innerWidth;
    const availH = window.innerHeight;
    const scale = Math.min(availW / VIEW_W, availH / VIEW_H);
    this.dpr = dpr;
    this.baseScale = dpr;
    this.canvas.width = Math.round(VIEW_W * dpr);
    this.canvas.height = Math.round(VIEW_H * dpr);
    this.canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
    this.canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
    this.ctx.imageSmoothingEnabled = true;
  }

  _wireKeys() {
    this.input.onKey((e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === STATE.PLAYING) this._setState(STATE.PAUSED);
        else if (this.state === STATE.PAUSED) this._setState(STATE.PLAYING);
        else if (this.state === STATE.HOW_TO_PLAY || this.state === STATE.SETTINGS || this.state === STATE.ACHIEVEMENTS) {
          this._setState(this.backState);
        } else if (this.state === STATE.LEVEL_SELECT || this.state === STATE.CHARACTER) {
          this._setState(STATE.MENU);
        }
        return;
      }
      if (e.code === 'KeyR' && (this.state === STATE.PLAYING || this.state === STATE.GAME_OVER)) {
        this.startLevel(this.levelIndex);
      }
      if (e.code === 'KeyM') {
        const on = !this.audio.getSound?.();
        this.audio.setSound(on);
      }
      // Keyboard shortcuts on the title screen.
      if (this.state === STATE.MENU && e.code === 'Enter') this.startLevel(this._firstPlayable());
      if (this.state === STATE.HOW_TO_PLAY && e.code === 'Enter') this._setState(this.backState);
    });
  }

  _setState(next) {
    this.state = next;
    const menus = next !== STATE.PLAYING;
    this.ui.setMenuOpen(menus);
    if (menus) this.input.releaseAll();
    this.touch.setVisible(!menus && shouldShowTouchControls());
    if (next !== STATE.GAME_OVER) this._syncMusic();
  }

  /** Mood for whatever is on screen right now. */
  _musicMood() {
    if (this.state === STATE.LEVEL_COMPLETE || this.state === STATE.FINAL_VICTORY) return 'win';
    if (this.state !== STATE.PLAYING) return 'calm';
    const id = LEVEL_IDS[this.levelIndex];
    if (id === 'summit') return 'boss';
    if (id === 'night' || id === 'market') return 'chase';
    return 'calm';
  }

  /**
   * Starts or retunes the generative background loop. Safe to call every
   * time the state changes: without a user gesture there is no AudioContext
   * yet and the call is simply dropped until `unlock()` fires.
   */
  _syncMusic() {
    this.audio.startMusic?.(this._musicMood());
  }

  _firstPlayable() {
    for (let i = 0; i < LEVEL_IDS.length; i++) {
      if (!storage.isCleared(LEVEL_IDS[i])) return i;
    }
    return 0;
  }

  /* ---------------------------------------------------------------- */

  startLevel(index) {
    this.levelIndex = Math.max(0, Math.min(LEVEL_IDS.length - 1, index));
    const id = LEVEL_IDS[this.levelIndex];
    this.level = getLevel(id);
    this.game = new Game(this.level, this._gameEvents());
    this.game.levelIndex = this.levelIndex;
    this.game.activeTip = null;
    this.renderer.setLevel(this.level);
    this.camera.setBoundsRect(this.level.bounds) || this.camera.setBounds(this.level.worldW, this.level.worldH);
    this.camera.targetZoom = 1;
    this.camera.zoom = 1;
    this.camera.snapTo(this.game.player.cx, this.game.player.cy);
    this.winTimer = 0;
    this.lastAchievements = [];
    this._setState(STATE.PLAYING);
    this.game.showHint(this.level.tips?.[0] || 'Press E to shoot a web!', 4);
  }

  _gameEvents() {
    const a = this.audio;
    return {
      onJump: () => a.jump?.(),
      onDoubleJump: () => a.bounce?.(),
      onWallJump: () => a.wallJump?.(),
      onLand: (s) => a.land?.(s),
      onClimb: () => a.climb?.(),
      onWebShot: () => a.webShot?.(),
      onWebHit: () => a.webHit?.(),
      onWebSwing: () => a.webSwing?.(),
      onWebRelease: () => a.zip?.(),
      onHurt: () => {
        a.bump?.();
        this.camera.addShake(9);
      },
      onBump: () => {
        a.bump?.();
        this.camera.addShake(7);
      },
      onCheckpoint: () => a.star?.(1),
      onBotWebbed: () => {
        a.webHit?.();
        this.game?.cheer();
      },
      onCoin: (i) => a.coin?.(i),
      onStar: (i) => a.star?.(i),
      onToken: () => a.token?.(),
      onPowerup: () => a.star?.(2),
      onCrateCrash: () => a.bump?.(),
      onFall: () => a.zip?.(),
      onGameOver: () => {
        a.stopMusic?.();
        this._pendingState = STATE.GAME_OVER;
      },
      onTutorialDone: () => {
        const fresh = evaluateAchievements(LEVEL_IDS);
        if (fresh.length) {
          const [first, ...rest] = fresh;
          this.game?.showToast(
            `${first.icon} ${first.title} UNLOCKED${rest.length ? `  +${rest.length}` : ''}`,
            '#ffd166',
          );
        }
      },
    };
  }

  /* ---------------------------------------------------------------- */

  _step(dt) {
    const game = this.game;
    if (!game) return;
    const aim = this._aimPoint();
    game.update(dt, this.input, aim);
    if (game.finished) {
      this.winTimer += dt;
      if (this.winTimer >= WIN_DELAY) this._finishLevel();
    }
  }

  /** Pointer position in world space, used as the web aim. */
  _aimPoint() {
    const p = this.input.pointer;
    if (!p.active) return null;
    const w = this.camera.screenToWorld(p.x * VIEW_W, p.y * VIEW_H);
    return w;
  }

  _finishLevel() {
    const game = this.game;
    const level = this.level;
    const rating = game.rating();
    const score = Math.round(game.score + game.stats.coins * 10 + game.stats.stars * 50 + game.stats.tokens * 100);
    storage.recordLevelResult(level.id, {
      score,
      stars: game.stats.stars,
      rating,
      time: game.stats.time,
      coins: game.stats.coins,
      enemies: game.stats.enemiesWebbed,
      damage: game.stats.damage,
    });
    this.lastAchievements = evaluateAchievements(LEVEL_IDS);
    this.totalScore += score;
    this.lastResult = { score, rating, stats: game.stats };
    this.audio.stopMusic?.();
    this._setState(this.levelIndex >= LEVEL_IDS.length - 1 ? STATE.FINAL_VICTORY : STATE.LEVEL_COMPLETE);
    // A single line on the results screen beats a queue of toasts.
    if (this.lastAchievements.length) {
      const [first, ...rest] = this.lastAchievements;
      game.showToast(
        `${first.icon} ${first.title} UNLOCKED${rest.length ? `  +${rest.length}` : ''}`,
        '#ffd166',
      );
    }
  }

  /* ---------------------------------------------------------------- */

  _handleMenus() {
    if (this.state === STATE.PLAYING) {
      if (this._pendingState) {
        const next = this._pendingState;
        this._pendingState = null;
        this._setState(next);
      }
      const playClick = this.ui.pollClick(STATE.PLAYING);
      if (playClick === 'pause') {
        this._setState(STATE.PAUSED);
        return;
      }
      if (playClick === 'tutorial:skip') {
        this.game.coach.skip();
        this.game.showToast('🎓 TUTORIAL SKIPPED', '#ffd166');
      }
      return;
    }
    const id = this.ui.pollClick(this.state);
    if (!id) return;
    if (id === 'back') {
      const inPanel =
        this.state === STATE.HOW_TO_PLAY || this.state === STATE.SETTINGS || this.state === STATE.ACHIEVEMENTS;
      this._setState(inPanel ? this.backState : STATE.MENU);
      return;
    }
    if (id.startsWith('level:')) {
      const idx = LEVEL_IDS.indexOf(id.slice(6));
      if (idx >= 0 && storage.isUnlocked(idx, LEVEL_IDS)) this.startLevel(idx);
      return;
    }
    if (id.startsWith('suit:')) {
      this.settings.suit = id.slice(5);
      storage.setSuit(this.settings.suit);
      this._applySettings();
      return;
    }
    if (id.startsWith('vol:')) {
      const key = id === 'vol:music' ? 'musicVolume' : 'sfxVolume';
      const v = this.ui.sliderValue(id) ?? this.settings[key];
      this.settings[key] = v;
      storage.set(key, v);
      this._applySettings();
      if (key === 'sfxVolume') this.audio.coin?.(0);
      return;
    }
    if (id === 'toggle:tutorial') {
      this.settings.tutorial = this.settings.tutorial === 'off' ? 'on' : 'off';
      storage.set('tutorial', this.settings.tutorial);
      // Turning it back on clears an earlier skip so the lesson really returns.
      if (this.settings.tutorial !== 'off') storage.set('tutorialSkip', false);
      if (this.game) {
        this.game.coach.enabled = this.settings.tutorial !== 'off' && Coach.shouldTeach(this.game);
        if (this.game.coach.enabled) this.game.coach.restart();
      }
      return;
    }
    if (id.startsWith('toggle:')) {
      const key = id.slice(7);
      this.settings[key] = !this.settings[key];
      storage.set(key, this.settings[key]);
      this._applySettings();
      return;
    }
    switch (id) {
      case 'play':
        this.startLevel(this.state === STATE.CHARACTER ? this._firstPlayable() : this._firstPlayable());
        break;
      case 'select':
        this._setState(STATE.LEVEL_SELECT);
        break;
      case 'character':
        this.backState = this.state;
        this._setState(STATE.CHARACTER);
        break;
      case 'achievements':
        this.backState = this.state;
        this._setState(STATE.ACHIEVEMENTS);
        break;
      case 'how':
        // "Replay tutorial" from the pause menu restarts the live lesson.
        if (this.state === STATE.PAUSED && this.game) {
          this.game.coach.restart();
          this._setState(STATE.PLAYING);
          break;
        }
        this.backState = this.state;
        this._setState(STATE.HOW_TO_PLAY);
        break;
      case 'settings':
        this.backState = this.state;
        this._setState(STATE.SETTINGS);
        break;
      case 'resume':
        this._setState(STATE.PLAYING);
        break;
      case 'restart':
        this.startLevel(this.levelIndex);
        break;
      case 'next':
        this.startLevel(this.levelIndex + 1);
        break;
      case 'reset':
        storage.resetProgress();
        break;
      case 'quit':
        this._setState(STATE.MENU);
        break;
      default:
        break;
    }
  }

  /* ---------------------------------------------------------------- */

  _loop(now) {
    this._raf = requestAnimationFrame(this._loop);
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.25);

    this._handleMenus();

    if (this.state === STATE.PLAYING && this.game) {
      this._acc += dt;
      let steps = 0;
      while (this._acc >= FIXED_DT && steps < MAX_STEPS) {
        this._step(FIXED_DT);
        this._acc -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS) this._acc = 0;
      const t = this.game.getCameraTarget();
      this.camera.targetZoom = t.zoom;
      this.camera.update(dt, t);
    }

    this._draw();
    this.input.endFrame();
  }

  _draw() {
    const ctx = this.ctx;
    const { canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(this.baseScale, 0, 0, this.baseScale, 0, 0);

    if (this.game && (this.state === STATE.PLAYING || this.state === STATE.PAUSED || this.state === STATE.GAME_OVER)) {
      this.renderer.render({ ctx, game: this.game, camera: this.camera, baseScale: this.baseScale });
    } else if (this.game) {
      // Menu backdrops keep the last frame of the city behind the panels.
      this.renderer.render({ ctx, game: this.game, camera: this.camera, baseScale: this.baseScale });
    } else {
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    this.ui.render(this.state, ctx, {
      game: this.game,
      camera: this.camera,
      levels: LEVEL_IDS.map((id) => LEVEL_META[id]),
      unlocked: (i, ids) => storage.isUnlocked(i, ids),
      progress: storage.all.progress,
      settings: this.settings,
      suit: this.settings.suit,
      stats: this.game?.stats,
      level: LEVEL_META[this.level?.id],
      rating: this.lastResult?.rating,
      isLast: this.levelIndex >= LEVEL_IDS.length - 1,
      totalScore: this.totalScore,
      progress01: this.game ? this.game.getProgress() : 0,
      score: this.lastResult?.score || 0,
      achievements: this.lastAchievements || [],
      achievementList: achievementProgress(LEVEL_IDS),
    });

    if (this.state === STATE.PLAYING) {
      this.touch.draw(ctx, 1);
      this._drawPauseButton(ctx);
    } else if (this.state === STATE.PLAYING || this.state === STATE.PAUSED) {
      this.touch.draw(ctx, 0.4);
    }
  }

  /** Small always-available pause button in the corner. */
  _drawPauseButton(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#0b1020';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(890, 14, 52, 40, 10) : ctx.rect(890, 14, 52, 40);
    ctx.fill();
    ctx.fillStyle = '#f4f7ff';
    ctx.fillRect(908, 24, 6, 20);
    ctx.fillRect(920, 24, 6, 20);
    ctx.restore();
  }
}

function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) throw new Error('canvas #game missing');
  const app = new App(canvas);
  window.__game = app;
  document.body.classList.add('ready');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();