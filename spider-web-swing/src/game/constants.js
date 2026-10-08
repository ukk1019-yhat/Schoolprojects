// Logical render resolution. The canvas is letterboxed to this size so the
// game looks identical on every screen and can never cause page scrolling.
export const VIEW_W = 960;
export const VIEW_H = 600;

export const FIXED_DT = 1 / 120;
export const MAX_STEPS = 6;

export const PHYS = {
  gravity: 2400,
  maxFall: 1550,
  runSpeed: 380,
  runAccel: 3000,
  runDecel: 3600,
  airAccel: 2200,
  boostSpeed: 560,
  boostAccel: 3800,
  jumpVel: 900,
  doubleJumpVel: 840,
  jumpCut: 0.42,
  coyoteTime: 0.1,
  jumpBuffer: 0.14,
  climbSpeed: 300,
  climbSlide: 70,
  // How far below a ledge the hero may be and still get pulled up onto it.
  landAssist: 18,
  climbJump: 800,
  crawlSpeed: 250,
  mantleTime: 0.24,
  // Web / swing tuning. Webbing is unlimited so kids never get stuck.
  webRange: 880,
  webCooldown: 0.1,
  swingGravity: 0.92,
  swingPump: 640,
  swingDrag: 0.9965,
  swingReleaseBoost: 1.12,
  ropeMin: 70,
  ropeMax: 940,
  reelSpeed: 260,
  maxSpeed: 1250,
  hurtKnock: 330,
  invulnTime: 1.2,
};

export const PLAYER_W = 30;
export const PLAYER_H = 46;

export const STATE = {
  MENU: 'MENU',
  LEVEL_SELECT: 'LEVEL_SELECT',
  CHARACTER: 'CHARACTER',
  HOW_TO_PLAY: 'HOW_TO_PLAY',
  ACHIEVEMENTS: 'ACHIEVEMENTS',
  SETTINGS: 'SETTINGS',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE',
  FINAL_VICTORY: 'FINAL_VICTORY',
};

export const PLAYER_STATE = {
  IDLE: 'idle',
  RUN: 'run',
  JUMP: 'jump',
  FALL: 'fall',
  CLIMB: 'climb',
  CRAWL: 'crawl',
  MANTLE: 'mantle',
  SWING: 'swing',
  HURT: 'hurt',
  WIN: 'win',
};

export const PICKUP = {
  COIN: 'coin',
  STAR: 'star',
  TOKEN: 'token',
};

export const POWER = {
  SPEED: 'speed',
  MAGNET: 'magnet',
};

export const POWER_INFO = {
  [POWER.SPEED]: { label: 'SPEED UP', icon: '\u26A1', duration: 8, color: '#ffe066' },
  [POWER.MAGNET]: { label: 'COIN MAGNET', icon: '\u2B50', duration: 10, color: '#ffb3e6' },
};

/** Wearable suits. Chosen on the Character screen and saved locally. */
export const SUITS = [
  { id: 'classic', name: 'CLASSIC RED', body: '#e63946', legs: '#2b4c9b', mask: '#1d3557', eye: '#eaf6ff', trim: '#ffd9d9' },
  { id: 'midnight', name: 'MIDNIGHT', body: '#39435c', legs: '#1b2030', mask: '#12172a', eye: '#cfe4ff', trim: '#9fb0d0' },
  { id: 'solar', name: 'GOLDEN SUN', body: '#ffb703', legs: '#e63946', mask: '#7a4d00', eye: '#fff8dc', trim: '#fff3cf' },
  { id: 'jade', name: 'JADE HERO', body: '#2ec4a6', legs: '#146b63', mask: '#0c3f3d', eye: '#e8fffb', trim: '#b8fff2' },
];

export function suitById(id) {
  return SUITS.find((s) => s.id === id) || SUITS[0];
}

export const COLORS = {
  heroRed: '#e63946',
  heroDark: '#1d3557',
  heroBlue: '#2b4c9b',
  heroSkin: '#ffd9b3',
  web: '#f2f7ff',
  coin: '#ffd166',
  star: '#ffe066',
  token: '#7ee0ff',
  ui: {
    bg: '#0b1020',
    panel: '#141c33',
    accent: '#ff4d5e',
    accent2: '#4dd0ff',
    good: '#5ce68a',
    warn: '#ffb020',
    text: '#f4f7ff',
    dim: '#9fb0d0',
  },
};

/** Kid-friendly praise shown for big plays. */
export const CHEERS = [
  'Great Swing!',
  'Awesome!',
  'Web Master!',
  'Amazing Jump!',
  'Super Hero!',
  'Nice Move!',
  'Fantastic!',
];

export const DEPTH = {
  BACKDROP: 0,
  FAR_CITY: 10,
  MID_CITY: 20,
  NEAR_CITY: 30,
  DECOR_BACK: 40,
  SOLIDS: 50,
  DECOR_FRONT: 60,
  ENTITIES: 70,
  PLAYER: 80,
  PARTICLES: 90,
  WEATHER: 95,
  FOREGROUND: 98,
};
