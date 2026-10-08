/**
 * Achievements: the long-term reward layer on top of per-level scores.
 *
 * Everything is derived from saved progress rather than stored twice, so a
 * corrupted save can never claim an achievement the player never earned.
 */
import { storage } from './storage.js';

/** Seconds under which a level counts as a speed clear. */
export const PAR_TIME = 45;

export const ACHIEVEMENTS = [
  { id: 'first-swing', icon: '🕸️', title: 'FIRST SWING', desc: 'Clear any level' },
  { id: 'clean-sweep', icon: '🫧', title: 'CLEAN SWEEP', desc: 'Clear a level without taking damage' },
  { id: 'speed-swing', icon: '⚡', title: 'SPEED SWING', desc: `Clear a level in under ${PAR_TIME}s` },
  { id: 'star-gazer', icon: '⭐', title: 'STAR GAZER', desc: 'Earn 3 stars on any level' },
  { id: 'coin-hoard', icon: '💰', title: 'COIN HOARD', desc: 'Collect 100 coins across the city' },
  { id: 'bot-buster', icon: '🤖', title: 'BOT BUSTER', desc: 'Wrap 25 Web-Bots' },
  { id: 'tutorial-grad', icon: '🎓', title: 'QUICK LEARNER', desc: 'Finish the tutorial' },
  { id: 'city-cleared', icon: '🏙️', title: 'CITY CLEARED', desc: 'Beat all 6 levels' },
  { id: 'web-master', icon: '🏆', title: 'WEB MASTER', desc: '3 stars on every level' },
];

/** Everything the evaluator needs to know, gathered from one save file. */
export function snapshot(levelIds, prog = storage.all.progress || {}) {
  const rows = levelIds.map((id) => prog[id] || {});
  const cleared = rows.filter((r) => r.cleared).length;
  return {
    cleared,
    ratings: rows.map((r) => r.rating || 0),
    stars: rows.reduce((n, r) => n + (r.stars || 0), 0),
    coins: rows.reduce((n, r) => n + (r.coins || 0), 0),
    enemies: rows.reduce((n, r) => n + (r.enemies || 0), 0),
    damage: rows.reduce((n, r) => n + (r.damage || 0), 0),
    cleanRuns: rows.filter((r) => r.cleared && (r.damage || 0) === 0).length,
    fastRuns: rows.filter((r) => r.cleared && r.bestTime != null && r.bestTime <= PAR_TIME).length,
    tutorialDone: !!storage.get('tutorialDone'),
    total: levelIds.length,
  };
}

/** Maps achievement id -> whether the snapshot earns it. */
export function earnedFlags(s, levelIds) {
  const every = (fn) => levelIds.every((id) => fn(id));
  return {
    'first-swing': s.cleared >= 1,
    'clean-sweep': s.cleanRuns >= 1,
    'speed-swing': s.fastRuns >= 1,
    'star-gazer': s.ratings.some((r) => r >= 3),
    'coin-hoard': s.coins >= 100,
    'bot-buster': s.enemies >= 25,
    'tutorial-grad': s.tutorialDone,
    'city-cleared': s.cleared >= s.total,
    'web-master': s.ratings.length === s.total && s.ratings.every((r) => r >= 3) && s.cleared >= s.total,
    ...(Object.fromEntries(
      levelIds.map((id) => [`three-stars-${id}`, !!(storage.all.progress?.[id]?.rating >= 3)]),
    )),
  };
}

/**
 * Unlocks everything the player now qualifies for.
 * @returns {Array} definitions that were newly earned, for toasts.
 */
export function evaluateAchievements(levelIds) {
  const s = snapshot(levelIds);
  const flags = earnedFlags(s, levelIds);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (flags[a.id] && storage.unlockAchievement(a.id)) fresh.push(a);
  }
  // One badge per three-star level, earned the moment the rating lands.
  for (const id of levelIds) {
    if (!flags[`three-stars-${id}`]) continue;
    const def = {
      id: `three-stars-${id}`,
      icon: '🌟',
      title: `3 STAR ${String(id).toUpperCase()}`,
      desc: `3 stars on ${id}`,
    };
    if (storage.unlockAchievement(def.id)) fresh.push(def);
  }
  return fresh;
}

/** Progress for the achievement panel: earned flag + a 0..1 meter. */
export function achievementProgress(levelIds) {
  const s = snapshot(levelIds);
  const flags = earnedFlags(s, levelIds);
  const meters = {
    'first-swing': [s.cleared, 1],
    'clean-sweep': [s.cleanRuns, 1],
    'speed-swing': [s.fastRuns, 1],
    'star-gazer': [s.ratings.some((r) => r >= 3) ? 1 : 0, 1],
    'coin-hoard': [s.coins, 100],
    'bot-buster': [s.enemies, 25],
    'tutorial-grad': [s.tutorialDone ? 1 : 0, 1],
    'city-cleared': [s.cleared, s.total],
    'web-master': [s.ratings.filter((r) => r >= 3).length, s.total],
  };
  return ACHIEVEMENTS.map((a) => {
    const [have, need] = meters[a.id] || [0, 1];
    return { ...a, earned: !!flags[a.id], have, need };
  });
}
