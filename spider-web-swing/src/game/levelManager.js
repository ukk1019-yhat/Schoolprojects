/**
 * LevelManager: the app-facing view of the six levels.
 *
 * Wraps the generator in `levels.js` with the metadata the menus need and the
 * unlock rules that tie a level to the one before it.
 */
import { LEVEL_IDS, LEVEL_META, getLevel, allLevels, auditLevel } from './levels.js';
import { storage } from '../core/storage.js';

export class LevelManager {
  get ids() {
    return LEVEL_IDS;
  }

  get count() {
    return LEVEL_IDS.length;
  }

  /** Menu rows: id, name, icon, blurb plus the player's saved result. */
  list() {
    return LEVEL_IDS.map((id, i) => ({
      ...LEVEL_META[id],
      index: i,
      unlocked: this.isUnlocked(i),
      record: storage.getProgress(id),
    }));
  }

  meta(id) {
    return LEVEL_META[id] || null;
  }

  /** A fresh, mutable level instance. */
  build(id) {
    return getLevel(id);
  }

  /** Every built level object, cached and read-only (menu/debug use). */
  all() {
    return allLevels();
  }

  isUnlocked(index) {
    return storage.isUnlocked(index, LEVEL_IDS);
  }

  indexOf(id) {
    return LEVEL_IDS.indexOf(id);
  }

  next(id) {
    return LEVEL_IDS[this.indexOf(id) + 1] || null;
  }

  isLast(id) {
    return this.indexOf(id) === LEVEL_IDS.length - 1;
  }

  /** First level the player has not beaten yet. */
  firstPlayable() {
    for (let i = 0; i < LEVEL_IDS.length; i++) if (!storage.isCleared(LEVEL_IDS[i])) return i;
    return 0;
  }

  audit(id) {
    return auditLevel(getLevel(id));
  }
}

export const levelManager = new LevelManager();
export { LEVEL_IDS, LEVEL_META, getLevel, allLevels, auditLevel };