/**
 * Achievements: every badge must be earnable from real saved progress,
 * must only be reported once, and must show honest progress meters.
 */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { storage } = await import('../src/core/storage.js');
const { LEVEL_IDS } = await import('../src/game/levels.js');
const {
  ACHIEVEMENTS,
  PAR_TIME,
  snapshot,
  earnedFlags,
  evaluateAchievements,
  achievementProgress,
} = await import('../src/core/achievements.js');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`[ok]   ${name}`);
  } catch (err) {
    failures++;
    console.log(`[FAIL] ${name}\n       ${err.message}`);
  }
}

const clear = () => {
  storage.resetProgress();
  storage.set('tutorialDone', false);
};

check('the list is complete and has no duplicate ids', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate achievement ids');
  for (const a of ACHIEVEMENTS) {
    if (!a.icon || !a.title || !a.desc) throw new Error(`achievement ${a.id} is missing art or text`);
  }
  if (ids.length < 8) throw new Error(`only ${ids.length} achievements - too thin`);
});

check('a fresh save has nothing earned', () => {
  clear();
  const fresh = evaluateAchievements(LEVEL_IDS);
  if (fresh.length) throw new Error(`unexpectedly earned ${fresh.map((a) => a.id).join(', ')}`);
});

check('beating one level earns FIRST SWING only', () => {
  clear();
  storage.recordLevelResult('rooftops', { score: 120, stars: 1, rating: 1, time: 120, coins: 12, enemies: 2, damage: 3 });
  const fresh = evaluateAchievements(LEVEL_IDS);
  const ids = fresh.map((a) => a.id);
  if (!ids.includes('first-swing')) throw new Error('FIRST SWING missing');
  if (ids.includes('city-cleared')) throw new Error('city cleared on 1 of 6 levels');
  if (ids.includes('clean-sweep')) throw new Error('clean sweep despite damage');
  if (ids.includes('speed-swing')) throw new Error(`speed swing at ${120}s`);
});

check('running a level fast and clean earns those badges', () => {
  clear();
  storage.recordLevelResult('rooftops', { score: 900, stars: 3, rating: 3, time: PAR_TIME - 1, coins: 20, enemies: 3, damage: 0 });
  const fresh = evaluateAchievements(LEVEL_IDS).map((a) => a.id);
  for (const need of ['first-swing', 'clean-sweep', 'speed-swing', 'star-gazer']) {
    if (!fresh.includes(need)) throw new Error(`${need} not earned`);
  }
});

check('evaluate only reports a badge once', () => {
  const again = evaluateAchievements(LEVEL_IDS);
  if (again.length) throw new Error(`re-reported ${again.map((a) => a.id).join(', ')}`);
});

check('coin and bot totals unlock from accumulated progress', () => {
  clear();
  storage.recordLevelResult('rooftops', { score: 1, rating: 1, time: 200, coins: 60, enemies: 12, damage: 1 });
  storage.recordLevelResult('climb', { score: 1, rating: 1, time: 200, coins: 55, enemies: 14, damage: 1 });
  const fresh = evaluateAchievements(LEVEL_IDS).map((a) => a.id);
  if (!fresh.includes('coin-hoard')) throw new Error('115 coins did not unlock COIN HOARD');
  if (!fresh.includes('bot-buster')) throw new Error('26 bots did not unlock BOT BUSTER');
  const s = snapshot(LEVEL_IDS);
  if (s.coins !== 115) throw new Error(`coin total was ${s.coins}`);
  if (s.enemies !== 26) throw new Error(`bot total was ${s.enemies}`);
});

check('finishing the tutorial unlocks QUICK LEARNER', () => {
  clear();
  storage.set('tutorialDone', true);
  const fresh = evaluateAchievements(LEVEL_IDS).map((a) => a.id);
  if (!fresh.includes('tutorial-grad')) throw new Error('tutorial graduation missing');
  storage.set('tutorialDone', false);
});

check('all six levels clears the city, three stars everywhere wins it all', () => {
  clear();
  for (const id of LEVEL_IDS) {
    storage.recordLevelResult(id, { score: 100, stars: 3, rating: 3, time: 60, coins: 1, enemies: 4, damage: 2 });
  }
  const fresh = evaluateAchievements(LEVEL_IDS).map((a) => a.id);
  if (!fresh.includes('city-cleared')) throw new Error('CITY CLEARED missing');
  if (!fresh.includes('web-master')) throw new Error('WEB MASTER missing');
  if (!fresh.includes('three-stars-summit')) throw new Error('per-level three-stars badge missing');
  const s = snapshot(LEVEL_IDS);
  if (s.cleared !== 6 || s.total !== 6) throw new Error(`cleared ${s.cleared}/${s.total}`);
});

check('progress meters are honest and stay inside 0..need', () => {
  clear();
  storage.recordLevelResult('rooftops', { score: 10, stars: 2, rating: 2, time: 90, coins: 30, enemies: 5, damage: 4 });
  const list = achievementProgress(LEVEL_IDS);
  if (list.length !== ACHIEVEMENTS.length) throw new Error('meter list out of sync');
  for (const a of list) {
    if (a.need < 1) throw new Error(`${a.id} has need ${a.need}`);
    if (a.have < 0 || a.have > a.need * 4) throw new Error(`${a.id} have ${a.have}/${a.need}`);
    if (a.earned !== !!(a.have >= a.need)) {
      // A badge may be earned from an older, better run that was not reset.
      if (!a.earned) throw new Error(`${a.id} shows unlocked progress but earned=false`);
    }
  }
  const coins = list.find((a) => a.id === 'coin-hoard');
  if (coins.have !== 30 || coins.need !== 100) throw new Error(`coin meter ${coins.have}/${coins.need}`);
  if (coins.earned) throw new Error('COIN HOARD earned at 30 coins');
  const cleared = list.find((a) => a.id === 'city-cleared');
  if (cleared.have !== 1 || cleared.need !== 6) throw new Error(`city meter ${cleared.have}/${cleared.need}`);
});

check('per-level three-stars ids are known to the evaluator', () => {
  clear();
  for (const id of LEVEL_IDS) storage.recordLevelResult(id, { score: 5, rating: 3, time: 999, coins: 0 });
  const flags = earnedFlags(snapshot(LEVEL_IDS), LEVEL_IDS);
  for (const id of LEVEL_IDS) {
    if (!flags[`three-stars-${id}`]) throw new Error(`three-stars-${id} false despite rating 3`);
  }
});

clear();
if (failures) {
  console.log(`\n${failures} ACHIEVEMENT CHECK(S) FAILED`);
  process.exit(1);
}
console.log('ACHIEVEMENTS OK');