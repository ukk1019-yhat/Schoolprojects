const KEY = 'spider-web-swing.v1';

const DEFAULTS = {
  sound: true,
  music: true,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  quality: 'high', // 'high' | 'low'
  reducedEffects: false,
  showTouch: 'auto', // 'auto' | 'on' | 'off'
  suit: 'classic',
  tutorial: 'auto', // 'auto' | 'on' | 'off'
  tutorialDone: false,
  tutorialSkip: false,
  bestScores: {},
  stars: {},
  ratings: {},
  progress: {},
  achievements: {},
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      bestScores: { ...(parsed.bestScores || {}) },
      stars: { ...(parsed.stars || {}) },
      ratings: { ...(parsed.ratings || {}) },
      progress: { ...(parsed.progress || {}) },
      achievements: { ...(parsed.achievements || {}) },
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let cache = read();

/**
 * SaveSystem: local progress, best scores, star ratings and settings.
 * Every write is flushed straight to localStorage so a refresh never loses
 * a level a child has already beaten.
 */
export class SaveSystem {
  get all() {
    return cache;
  }

  get(key) {
    return cache[key];
  }

  set(key, value) {
    cache[key] = value;
    this.flush();
    return value;
  }

  patch(partial) {
    cache = { ...cache, ...partial };
    this.flush();
    return cache;
  }

  /** Result record for a beaten level. Keeps the best score / rating / time. */
  recordLevelResult(id, { score = 0, stars = 0, rating = 0, time = 0, coins = 0, enemies = 0, damage = 0 }) {
    const prev = cache.progress[id] || {};
    cache.progress = {
      ...cache.progress,
      [id]: {
        cleared: true,
        stars: Math.max(prev.stars || 0, stars),
        rating: Math.max(prev.rating || 0, rating),
        score: Math.max(prev.score || 0, Math.round(score) || 0),
        coins: Math.max(prev.coins || 0, coins),
        enemies: Math.max(prev.enemies || 0, enemies),
        damage: Math.max(prev.damage || 0, damage),
        bestTime: prev.bestTime != null ? Math.min(prev.bestTime, time) : time,
      },
    };
    cache.bestScores = {
      ...cache.bestScores,
      [id]: Math.max(cache.bestScores[id] || 0, Math.round(score) || 0),
    };
    cache.stars = { ...cache.stars, [id]: Math.max(cache.stars[id] || 0, stars) };
    cache.ratings = { ...cache.ratings, [id]: Math.max(cache.ratings[id] || 0, rating) };
    this.flush();
    return cache.progress[id];
  }

  getProgress(id) {
    return cache.progress[id] || null;
  }

  isCleared(id) {
    return !!cache.progress[id]?.cleared;
  }

  /** Level i is unlocked when it is the first level or the previous one is beaten. */
  isUnlocked(index, ids) {
    if (index <= 0) return true;
    return this.isCleared(ids[index - 1]);
  }

  setSuit(id) {
    cache.suit = id;
    this.flush();
    return id;
  }

  unlockAchievement(id) {
    if (cache.achievements[id]) return false;
    cache.achievements = { ...cache.achievements, [id]: true };
    this.flush();
    return true;
  }

  hasAchievement(id) {
    return !!cache.achievements[id];
  }

  resetProgress() {
    cache = {
      ...cache,
      bestScores: {},
      stars: {},
      ratings: {},
      progress: {},
      achievements: {},
    };
    this.flush();
  }

  flush() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* private mode / quota - progress simply won't persist */
    }
  }
}

export const storage = new SaveSystem();
