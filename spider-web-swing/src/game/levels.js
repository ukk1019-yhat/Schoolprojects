/**
 * Level generation for Spider Web Swing.
 *
 * Every level is a wide side-scrolling slice of the city: a solid street with
 * gaps, buildings of varying height you climb or swing across, web anchors above
 * the gaps, checkpoints, collectibles and a goal flag on the last building.
 *
 * Difficulty ramps through `cfg`: wider gaps, more enemies, more hazards.
 */
import { makeRng } from '../core/math.js';
import { PICKUP, POWER, POWER_INFO, PLAYER_H } from './constants.js';

const GROUND_THICK = 240;
const GROUND_Y = 1780;
const WORLD_TOP = 520;

/** City building palette per theme. */
export const THEMES = {
  city: {
    label: 'CITY ROOFS',
    sky: ['#5ab6f2', '#9ad8ff', '#e6f6ff'],
    sun: '#fff8d0',
    far: '#a9c8e8',
    mid: '#7ea9d6',
    near: '#5b83b3',
    building: ['#8fb3d9', '#6c8cb8', '#b6cee9'],
    buildingAlt: ['#a7c6e4', '#7f9fc4', '#c6dcf0'],
    roof: '#dbe9f7',
    window: '#ffe9a8',
    water: '#4fc3e8',
    street: '#4a5568',
    trim: '#f2f7ff',
  },
  sunset: {
    label: 'SUNSET RUN',
    sky: ['#ff7a59', '#ffb26b', '#ffe6ae'],
    sun: '#fff6cf',
    far: '#bb8db2',
    mid: '#916492',
    near: '#6d4672',
    building: ['#ab81a0', '#7c5a78', '#cba4bf'],
    buildingAlt: ['#b98fae', '#8a6386', '#d8b3c8'],
    roof: '#ffd9c0',
    window: '#ffd98a',
    water: '#ff9f7a',
    street: '#6b4a52',
    trim: '#fff1e0',
  },
  harbor: {
    label: 'HARBOR DAWN',
    sky: ['#3d5a9e', '#7f9fd8', '#ffd3b0'],
    sun: '#ffeccf',
    far: '#7b8fc0',
    mid: '#5f74a8',
    near: '#485c8c',
    building: ['#8290bd', '#5f6d99', '#a8b4d8'],
    buildingAlt: ['#8f9bc4', '#6c7aa4', '#b8c3e0'],
    roof: '#cfd8ef',
    window: '#cfe6ff',
    water: '#3fa9d8',
    street: '#3c4460',
    trim: '#eef3ff',
  },
  night: {
    label: 'NIGHT PATROL',
    sky: ['#0d1230', '#22306b', '#4a5aa0'],
    sun: '#f4f6ff',
    far: '#2a3565',
    mid: '#1e2748',
    near: '#151c33',
    building: ['#39436f', '#232b4c', '#4d5a8c'],
    buildingAlt: ['#414d7d', '#283156', '#5a68a0'],
    roof: '#5f6ea8',
    window: '#ffe08a',
    water: '#2b4b8c',
    street: '#1a2036',
    trim: '#cfe0ff',
  },
  snow: {
    label: 'SNOW DISTRICT',
    sky: ['#8fb8d8', '#cfe4f2', '#ffffff'],
    sun: '#ffffff',
    far: '#c4d8e8',
    mid: '#a8c0d4',
    near: '#8aa8c0',
    building: ['#d4e4f2', '#b0c6dc', '#f0f8ff'],
    buildingAlt: ['#c2d6ea', '#9db4cc', '#e6f2ff'],
    roof: '#ffffff',
    window: '#ffe9a8',
    water: '#8ed0e8',
    street: '#9fb0c4',
    trim: '#ffffff',
  },
  summit: {
    label: 'SKY SUMMIT',
    sky: ['#123a6b', '#2f7fb8', '#bfe8ff'],
    sun: '#ffffff',
    far: '#5f9fd0',
    mid: '#3f7fb4',
    near: '#2a5f90',
    building: ['#9fd0ec', '#6fa8cc', '#cfeafc'],
    buildingAlt: ['#8cc4e8', '#5f9cc4', '#bfe2f6'],
    roof: '#ffffff',
    window: '#ffe9a8',
    water: '#5fd0f0',
    street: '#6f8fa8',
    trim: '#ffffff',
  },
};

const BUILD_MIN = 150;
const BUILD_MAX = 300;
const BUILD_H_MIN = 190;
const BUILD_H_MAX = 430;

function overlaps(a, b, m = 0) {
  return a.x - m < b.x + b.w && a.x + a.w + m > b.x && a.y - m < b.y + b.h && a.y + a.h + m > b.y;
}

function createLevel(cfg) {
  const rng = makeRng(cfg.seed);
  const groundY = GROUND_Y;
  const solids = [];
  const ledges = [];
  const movers = [];
  const anchors = [];
  const pickups = [];
  const powerups = [];
  const checkpoints = [];
  const decor = [];
  const hazards = [];
  const enemies = [];
  const waterZones = [];

  // Street: solid slabs with gaps between them. The gaps are the canals the
  // hero has to jump or swing across.
  const gapRange = cfg.gaps;
  const startX = 60;
  let x = -40;
  let prevTop = groundY;
  const segments = [];
  while (x < cfg.worldW) {
    // The opening slab is a building-free runway so the hero always starts
    // standing on open street with room to build speed.
    const isStart = segments.length === 0;
    const w = isStart ? 560 : rng.range(240, 460);
    const seg = { x, w };
    segments.push(seg);
    solids.push({
      x,
      y: groundY,
      w,
      h: GROUND_THICK,
      type: 'solid',
      climbable: false,
      kind: 'ground',
      segment: true,
    });
    decor.push({ kind: 'street', x, y: groundY, w, h: 96, front: false });
    // Buildings sit on this street slab and extend upward.
    const count = isStart ? 0 : Math.max(1, Math.floor(w / rng.range(150, 210)));
    let bx = x + 12;
    for (let i = 0; i < count && bx < x + w - BUILD_MIN; i++) {
      const bw = Math.min(rng.range(BUILD_MIN, BUILD_MAX), x + w - bx - 8);
      if (bw < 110) break;
      const bh = rng.range(BUILD_H_MIN, BUILD_H_MAX);
      const top = groundY - bh;
      const alt = rng.chance(0.35);
      solids.push({
        x: bx,
        y: top,
        w: bw,
        h: bh,
        type: 'solid',
        climbable: true,
        kind: 'building',
        alt,
        topIndex: segments.length - 1,
      });
      // Windows on the facade.
      const cols = Math.max(1, Math.floor((bw - 30) / 40));
      const rows = Math.max(1, Math.floor((bh - 50) / 52));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          decor.push({
            kind: 'window',
            x: bx + 16 + c * ((bw - 24) / cols),
            y: top + 30 + r * ((bh - 46) / rows),
            w: Math.max(12, Math.min(24, (bw - 24) / cols - 10)),
            h: Math.max(14, Math.min(30, (bh - 46) / rows - 14)),
            lit: rng.chance(0.45),
            front: false,
          });
        }
      }
      decor.push({ kind: 'roofEdge', x: bx, y: top, w: bw, h: 14, front: true });
      // Roof props (solid so they are real obstacles).
      let px = bx + 20;
      const propBudget = rng.int(0, 2);
      for (let k = 0; k < propBudget && px < bx + bw - 70; k++) {
        const pw = rng.range(50, 84);
        const ph = rng.range(40, 70);
        solids.push({
          x: px,
          y: top - ph,
          w: pw,
          h: ph,
          type: 'solid',
          climbable: false,
          kind: rng.chance(0.5) ? 'ac' : 'tank',
          decor: true,
        });
        decor.push({ kind: 'ac', x: px, y: top - ph, w: pw, h: ph, front: true });
        px += pw + rng.range(70, 150);
      }
      // Water tower on some roofs: a tall climbable landmark.
      if (rng.chance(0.22) && bw > 190) {
        const tx = bx + bw - 96;
        const th = rng.range(90, 130);
        solids.push({
          x: tx,
          y: top - th,
          w: 62,
          h: th,
          type: 'solid',
          climbable: true,
          kind: 'tower',
        });
        decor.push({ kind: 'tower', x: tx, y: top - th, w: 62, h: th, front: true });
      }
      bx += bw + rng.range(24, 60);
    }
    // Web anchor above every gap, so swinging is always the answer to a canal.
    const gapW = rng.range(gapRange[0], gapRange[1]);
    x += w + gapW;
    const gap = { x: x - gapW, w: gapW };
    segments[segments.length - 1].gapAfter = gap;
    waterZones.push({ x: gap.x, y: groundY + 10, w: gap.w, h: 200 });
    anchors.push({
      x: gap.x + gap.w / 2,
      y: groundY - rng.range(330, 470),
      used: 0,
      phase: rng.range(0, 6.28),
    });
    prevTop = groundY;
  }
  void prevTop;

  // One-way ledges above the street give extra routing and collectible spots.
  const allBuildings = solids.filter((s) => s.kind === 'building');
  for (let i = 0; i < allBuildings.length; i += 5) {
    const b = allBuildings[i];
    const lw = rng.range(90, 140);
    const lx = b.x + b.w + 26;
    if (lx + lw > cfg.worldW - 40) continue;
    ledges.push({
      x: lx,
      y: b.y - rng.range(120, 190),
      w: lw,
      h: 14,
      type: 'ledge',
      climbable: false,
      kind: 'ledge',
    });
  }

  // Bridges over the widest gaps: a crawlable underside plus a walkway on top.
  let bridgeIdx = 0;
  for (const seg of segments) {
    if (!seg.gapAfter || seg.gapAfter.w < 300) continue;
    if (bridgeIdx++ >= 2) break;
    const g = seg.gapAfter;
    const bx = g.x + g.w / 2 - 100;
    const by = groundY - 300;
    solids.push({
      x: bx,
      y: by,
      w: 200,
      h: 22,
      type: 'solid',
      climbable: true,
      kind: 'bridge',
    });
    decor.push({ kind: 'bridge', x: bx, y: by, w: 200, h: 22, front: true });
    pickups.push({
      type: PICKUP.STAR,
      x: bx + 100,
      y: by - 30,
      r: 15,
      taken: false,
      pop: 0,
    });
  }

  // Moving platforms across the mid-size gaps.
  for (const seg of segments) {
    const g = seg.gapAfter;
    if (!g || g.w < 240 || g.w > 330) continue;
    if (rng.chance(0.55)) continue;
    movers.push({
      x: g.x + g.w / 2,
      y: groundY - 170,
      w: 110,
      h: 18,
      ox: g.x + g.w / 2,
      oy: groundY - 170,
      ax: 0,
      ay: -70,
      speed: 0.8,
      phase: rng.range(0, 6.28),
      dx: 0,
      dy: 0,
    });
  }

  // Cars driving along the street: pure decoration that sells the city.
  for (let i = 0; i < 26; i++) {
    decor.push({
      kind: 'car',
      x: rng.range(0, cfg.worldW - 80),
      y: groundY + rng.range(10, 40),
      w: rng.range(56, 78),
      h: 26,
      front: false,
      hue: rng.int(0, 4),
      speed: rng.range(20, 46) * (rng.chance(0.5) ? 1 : -1),
    });
  }

  // Collectibles: coin trails along the roof lines, stars on the hard-to-reach
  // spots, and hidden tokens tucked into the alcoves.
  for (const b of allBuildings) {
    if (rng.chance(0.5)) {
      const n = rng.int(3, 6);
      for (let i = 0; i < n; i++) {
        pickups.push({
          type: PICKUP.COIN,
          x: b.x + 20 + (i * (b.w - 40)) / Math.max(1, n - 1),
          y: b.y - 34 - Math.sin((i / n) * Math.PI) * 40,
          r: 13,
          taken: false,
          pop: 0,
          spin: rng.range(0, 6.28),
        });
      }
    }
    if (rng.chance(0.42)) {
      pickups.push({ type: PICKUP.STAR, x: b.x + b.w / 2, y: b.y - 60, r: 16, taken: false, pop: 0, spin: rng.range(0, 6.28) });
    }
    if (rng.chance(0.16)) {
      pickups.push({ type: PICKUP.TOKEN, x: b.x + rng.range(30, b.w - 30), y: b.y - 110, r: 16, taken: false, pop: 0, hidden: true, spin: rng.range(0, 6.28) });
    }
  }
  // Coins arcing over each gap: the natural reward for a well-timed swing.
  for (const seg of segments) {
    const g = seg.gapAfter;
    if (!g) continue;
    for (let i = 0; i < 4; i++) {
      pickups.push({
        type: PICKUP.COIN,
        x: g.x + ((i + 1) * g.w) / 5,
        y: groundY - 120 - Math.sin(((i + 1) / 5) * Math.PI) * 120,
        r: 13,
        taken: false,
        pop: 0,
        spin: rng.range(0, 6.28),
      });
    }
  }

  // Power-ups: speed and magnet.
  const powerKinds = [POWER.SPEED, POWER.MAGNET];
  for (let i = 0; i < (cfg.powerupCount ?? 3); i++) {
    const b = allBuildings[Math.floor(rng.range(allBuildings.length * 0.1, allBuildings.length * 0.9))];
    if (!b) continue;
    const type = powerKinds[i % powerKinds.length];
    powerups.push({
      type,
      duration: POWER_INFO[type].duration,
      x: b.x + rng.range(34, Math.max(48, b.w - 34)),
      y: b.y - 44,
      r: 20,
      taken: false,
      pop: 0,
      phase: rng.range(0, 6.28),
    });
  }

  // Checkpoints on every ~1800px, placed on a building roof.
  const cpEvery = 1800;
  let cpX = cpEvery;
  for (const b of allBuildings) {
    if (b.x < cpX) continue;
    checkpoints.push({ x: b.x + 30, y: b.y, index: checkpoints.length, reached: false, pop: 0 });
    cpX += cpEvery;
  }

  // Cartoon Web-Bots: mild enemies you can bounce off or web up.
  const enemyPool = allBuildings.filter((b) => b.w > 170);
  for (let i = 0; i < (cfg.enemyCount ?? 3); i++) {
    const b = enemyPool[Math.floor(rng.range(enemyPool.length * 0.08, enemyPool.length * 0.94))];
    if (!b) continue;
    enemies.push({
      x: b.x + b.w / 2 - 20,
      y: b.y - 44,
      homeX: b.x + b.w / 2 - 20,
      homeY: b.y - 44,
      w: 40,
      h: 44,
      range: rng.range(40, 96),
      speed: rng.range(40, 78),
      phase: rng.range(0, 6.28),
      animT: rng.range(0, 6.28),
      vx: 0,
      vy: 0,
      wrapped: false,
      wrapT: 0,
    });
  }

  // Mild hazards: swinging wrecking balls and falling crates over the street.
  for (const seg of segments) {
    if (!seg.gapAfter) continue;
    if (!rng.chance(cfg.hazardChance)) continue;
    hazards.push({
      kind: 'ball',
      x: seg.gapAfter.x + seg.gapAfter.w / 2,
      y: groundY - 420,
      r: 24,
      vy: 0,
      vx: rng.range(-60, 60),
      amp: rng.range(70, 130),
      baseY: groundY - 420,
      phase: rng.range(0, 6.28),
    });
  }
  for (let i = 2; i < allBuildings.length; i += 4) {
    if (!rng.chance(cfg.hazardChance)) continue;
    const b = allBuildings[i];
    hazards.push({
      kind: 'crate',
      x: b.x + b.w / 2,
      y: b.y - 520,
      spawnY: b.y - 520,
      w: 40,
      h: 40,
      vy: 0,
      state: 'wait',
      timer: rng.range(0.5, 3),
      respawn: rng.range(2.4, 3.8),
      rot: 0,
      spin: rng.range(-2.2, 2.2),
    });
  }

  // Hidden alcove: a cavity in a building holding a bonus token.
  const alcoveHost = allBuildings[Math.floor(allBuildings.length * 0.62)] || allBuildings[0];
  let goal = { x: cfg.worldW - 220, y: groundY };
  if (alcoveHost) {
    const ax = alcoveHost.x + 40;
    const ay = alcoveHost.y + 120;
    // Carve the room out of the building by splitting it into three pieces.
    const b = alcoveHost;
    const idx = solids.indexOf(b);
    const cavity = { x: ax, y: ay, w: Math.min(150, b.w - 70), h: 110 };
    solids.splice(idx, 1);
    const leftW = cavity.x - b.x;
    solids.push({ ...b, w: leftW, climbable: true });
    solids.push({ ...b, x: cavity.x + cavity.w, w: b.w - leftW - cavity.w, climbable: true });
    solids.push({ x: cavity.x, y: cavity.y, w: cavity.w, h: 30, type: 'solid', climbable: false, kind: 'alcoveTop' });
    pickups.push({ type: PICKUP.TOKEN, x: cavity.x + cavity.w / 2, y: cavity.y + 70, r: 18, taken: false, pop: 0, hidden: true, bonus: true, spin: 0 });
    pickups.push({ type: PICKUP.STAR, x: cavity.x + 30, y: cavity.y + 74, r: 16, taken: false, pop: 0, spin: 1 });
    pickups.push({ type: PICKUP.COIN, x: cavity.x + cavity.w - 30, y: cavity.y + 74, r: 13, taken: false, pop: 0, spin: 2 });
    goal = alcoveHost;
  }
  // Goal flag on the last building.
  const lastBuilding = allBuildings[allBuildings.length - 1];
  const goalB = lastBuilding || goal;
  const goalX = goalB.x + goalB.w / 2;
  const goalY = goalB.y;

  // Background skyline buildings (parallax only, no collision).
  const backdrop = [];
  for (let i = 0; i < 90; i++) {
    backdrop.push({
      x: rng.range(-200, cfg.worldW + 200),
      w: rng.range(90, 240),
      h: rng.range(180, 700),
      layer: rng.int(0, 2),
      alt: rng.chance(0.4),
      lit: rng.chance(0.4),
    });
  }

  const level = {
    id: cfg.id,
    name: cfg.name,
    subtitle: cfg.subtitle,
    blurb: cfg.blurb,
    icon: cfg.icon,
    theme: cfg.theme,
    seed: cfg.seed,
    worldW: cfg.worldW,
    worldH: groundY + GROUND_THICK - WORLD_TOP,
    topBound: WORLD_TOP,
    bottomBound: groundY + GROUND_THICK,
    // World-space rect the camera is allowed to roam. Note this starts at
    // topBound, not 0: passing just a height would push the camera's clamp to
    // y=0..900 and park the whole city below the viewport.
    bounds: { x: 0, y: WORLD_TOP, w: cfg.worldW, h: groundY + GROUND_THICK - WORLD_TOP },
    groundY,
    // Player-space top-left corner: the hero starts standing on the street.
    spawn: { x: 120, y: groundY - PLAYER_H },
    goal: { x: goalX, y: goalY },
    segments,
    solids,
    ledges,
    movers,
    anchors,
    pickups,
    powerups,
    checkpoints,
    decor,
    hazards,
    enemies,
    waterZones,
    backdrop,
    par: cfg.par,
    tips: cfg.tips || [],
  };

  cfg.decorate?.(level, rng);
  return level;
}

/* ------------------------------------------------------------------ *
 * Level definitions
 * ------------------------------------------------------------------ */

function l1() {
  return createLevel({
    id: 'rooftops',
    name: 'FIRST SWING',
    subtitle: 'Learn to swing across the city',
    blurb: 'Tap E or CLICK to shoot a web, then swing and let go to fly.',
    icon: '🕸️',
    theme: 'city',
    seed: 1001,
    worldW: 7200,
    gaps: [110, 200],
    enemyCount: 2,
    hazardChance: 0.2,
    powerupCount: 2,
    par: { coins: 60, stars: 8, time: 180 },
    tips: ['Press E or CLICK to shoot a web', 'Hold left and right to pump your swing', 'Let go of E to fly off the web'],
  });
}

function l2() {
  return createLevel({
    id: 'climb',
    name: 'WALL CLIMB',
    subtitle: 'Hold W to climb buildings',
    blurb: 'Climb tall buildings and crawl under the bridges.',
    icon: '🧗',
    theme: 'sunset',
    seed: 2002,
    worldW: 8400,
    gaps: [150, 260],
    enemyCount: 3,
    hazardChance: 0.35,
    powerupCount: 3,
    par: { coins: 80, stars: 10, time: 200 },
    tips: ['Hold W or UP next to a wall to climb', 'Press SPACE to leap off a wall', 'Hold UP under a bridge to crawl along'],
  });
}

function l3() {
  return createLevel({
    id: 'market',
    name: 'MARKET HOP',
    subtitle: 'Wide canals and moving platforms',
    blurb: 'Ride the lifts, time your swings and web up the guards.',
    icon: '🛒',
    theme: 'harbor',
    seed: 3003,
    worldW: 9600,
    gaps: [200, 320],
    enemyCount: 4,
    hazardChance: 0.45,
    powerupCount: 3,
    par: { coins: 100, stars: 12, time: 220 },
    tips: ['Green platforms carry you across the water', 'Shoot a Web-Bot to wrap it up'],
    decorate(level) {
      level.decor.push({ kind: 'sign', x: 340, y: level.groundY - 150, w: 170, h: 80, front: true, text: 'GOAL!' });
    },
  });
}

function l4() {
  return createLevel({
    id: 'night',
    name: 'NIGHT PATROL',
    subtitle: 'Rooftop guards everywhere',
    blurb: 'Dodge the wrecking balls and wrap up every Web-Bot.',
    icon: '🌙',
    theme: 'night',
    seed: 4004,
    worldW: 10800,
    gaps: [230, 360],
    enemyCount: 6,
    hazardChance: 0.6,
    powerupCount: 4,
    par: { coins: 120, stars: 14, time: 240 },
    tips: ['Hold SHIFT to speed up your run', 'Careful: the crates fall from above'],
  });
}

function l5() {
  return createLevel({
    id: 'snow',
    name: 'SNOW DISTRICT',
    subtitle: 'Slippery, bouncy, huge gaps',
    blurb: 'The biggest jumps yet. Find the hidden tokens.',
    icon: '❄️',
    theme: 'snow',
    seed: 5005,
    worldW: 12000,
    gaps: [260, 400],
    enemyCount: 7,
    hazardChance: 0.65,
    powerupCount: 4,
    par: { coins: 140, stars: 16, time: 260 },
    tips: ['Magnet power pulls coins to you', 'Look inside buildings for secret rooms'],
  });
}

function l6() {
  return createLevel({
    id: 'summit',
    name: 'SKY SUMMIT',
    subtitle: 'The final swing to the top',
    blurb: 'Everything you have learned, all in one long ride.',
    icon: '🏆',
    theme: 'summit',
    seed: 6006,
    worldW: 13200,
    gaps: [280, 420],
    enemyCount: 8,
    hazardChance: 0.7,
    powerupCount: 5,
    par: { coins: 160, stars: 18, time: 280 },
    tips: ['You are almost a real web master!', 'Double jump in mid-air for extra height'],
  });
}

const BUILDERS = { rooftops: l1, climb: l2, market: l3, night: l4, snow: l5, summit: l6 };

export const LEVEL_IDS = ['rooftops', 'climb', 'market', 'night', 'snow', 'summit'];

export const LEVEL_META = {
  rooftops: { id: 'rooftops', name: 'FIRST SWING', icon: '🕸️', blurb: 'Learn to swing across the city.' },
  climb: { id: 'climb', name: 'WALL CLIMB', icon: '🧗', blurb: 'Climb tall buildings.' },
  market: { id: 'market', name: 'MARKET HOP', icon: '🛒', blurb: 'Canals and moving platforms.' },
  night: { id: 'night', name: 'NIGHT PATROL', icon: '🌙', blurb: 'Rooftop guards everywhere.' },
  snow: { id: 'snow', name: 'SNOW DISTRICT', icon: '❄️', blurb: 'Big jumps and secret rooms.' },
  summit: { id: 'summit', name: 'SKY SUMMIT', icon: '🏆', blurb: 'The final swing.' },
};

const cache = new Map();

/** Fresh, mutable copy of a level every call: run state must never leak. */
export function getLevel(id) {
  if (!cache.has(id)) {
    const build = BUILDERS[id] || BUILDERS.rooftops;
    cache.set(id, build());
  }
  return structuredClone(cache.get(id));
}

/** Cached level objects for menu metadata. Read-only. */
export function allLevels() {
  return LEVEL_IDS.map((id) => {
    if (!cache.has(id)) cache.set(id, (BUILDERS[id] || BUILDERS.rooftops)());
    return cache.get(id);
  });
}

/** Sanity check used by the tests: the hero must be able to stand at spawn. */
export function auditLevel(level) {
  const problems = [];
  const p = level.spawn;
  if (overlaps({ x: p.x, y: p.y, w: 30, h: 46 }, level.solids[0])) {
    problems.push('spawn overlaps geometry');
  }
  if (!level.goal) problems.push('no goal');
  return problems;
}