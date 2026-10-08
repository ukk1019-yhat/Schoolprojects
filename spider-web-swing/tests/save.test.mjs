/**
 * SaveSystem: progress, unlocks, settings and reset must all round-trip
 * through localStorage so a refresh never loses a beaten level.
 */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { storage, SaveSystem } = await import('../src/core/storage.js');
const { LEVEL_IDS } = await import('../src/game/levels.js');

let failures = 0;
const check = (name, ok, extra = '') => {
  if (ok) console.log(`[ok]   ${name}`);
  else {
    failures++;
    console.log(`[FAIL] ${name}${extra ? ` :: ${extra}` : ''}`);
  }
};

// Fresh defaults.
check('level 1 always unlocked', storage.isUnlocked(0, LEVEL_IDS));
check('level 2 locked at start', !storage.isUnlocked(1, LEVEL_IDS));

// Record a win and confirm persistence.
const before = storage.getProgress('rooftops');
check('no win recorded yet', before === null);
storage.recordLevelResult('rooftops', { score: 1200, stars: 5, rating: 3, time: 84, coins: 40 });
check('win recorded', storage.isCleared('rooftops'));
check('level 2 unlocks after level 1', storage.isUnlocked(1, LEVEL_IDS));
check('level 3 still locked', !storage.isUnlocked(2, LEVEL_IDS));

// The write actually reached localStorage.
const raw = JSON.parse(mem.get('spider-web-swing.v1') || '{}');
check('flushed to localStorage', !!raw.progress?.rooftops?.cleared);

// Best results only ever improve.
storage.recordLevelResult('rooftops', { score: 500, stars: 1, rating: 1, time: 200, coins: 5 });
const rec = storage.getProgress('rooftops');
check('score not downgraded', rec.score === 1200, `score=${rec.score}`);
check('rating not downgraded', rec.rating === 3);
check('best time kept', rec.bestTime === 84, `time=${rec.bestTime}`);

// Settings round-trip.
storage.set('musicVolume', 0.25);
storage.set('sfxVolume', 0.9);
storage.setSuit('solar');
check('music volume saved', storage.get('musicVolume') === 0.25);
check('sfx volume saved', storage.get('sfxVolume') === 0.9);
check('suit saved', storage.get('suit') === 'solar');

// A second instance reading the same storage sees the same world.
const again = new SaveSystem();
check('second reader sees progress', again.isCleared('rooftops'));
check('second reader sees suit', again.get('suit') === 'solar');

// Achievements unlock exactly once.
check('first achievement returns true', storage.unlockAchievement('first-swing') === true);
check('second unlock returns false', storage.unlockAchievement('first-swing') === false);
check('achievement readable', storage.hasAchievement('first-swing'));

// Reset clears progress but keeps settings.
storage.resetProgress();
check('reset clears levels', !storage.isCleared('rooftops'));
check('reset re-locks level 2', !storage.isUnlocked(1, LEVEL_IDS));
check('reset keeps settings', storage.get('suit') === 'solar');

console.log(failures ? `\n${failures} SAVE CHECK(S) FAILED` : 'SAVE OK');
process.exit(failures ? 1 : 0);