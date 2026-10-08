/**
 * Every level must load, have sane bounds, a spawn the hero can stand on, and
 * a goal reachable past the spawn.
 */
import { getLevel, LEVEL_IDS, auditLevel } from "../src/game/levels.js";
import { Game } from "../src/game/game.js";
import { PLAYER_W, PLAYER_H } from "../src/game/constants.js";

let ok = true;
const fail = (msg) => { ok = false; console.log("  BAD", msg); };

for (const id of LEVEL_IDS) {
  const lv = getLevel(id);
  console.log(
    id,
    "worldW=" + lv.worldW, "worldH=" + lv.worldH,
    "solids=" + lv.solids.length, "pickups=" + lv.pickups.length,
    "anchors=" + lv.anchors.length, "hazards=" + lv.hazards.length,
    "movers=" + lv.movers.length, "enemies=" + lv.enemies.length,
  );

  if (!Number.isFinite(lv.worldH) || lv.worldH <= 0) fail(`${id} worldH`);
  if (!Number.isFinite(lv.worldW) || lv.worldW <= 0) fail(`${id} worldW`);
  if (!lv.spawn || !Number.isFinite(lv.spawn.x) || !Number.isFinite(lv.spawn.y)) fail(`${id} spawn`);
  if (!lv.goal) fail(`${id} goal`);
  if (lv.goal && lv.goal.x <= lv.spawn.x) fail(`${id} goal before spawn`);
  if (!Array.isArray(lv.solids) || lv.solids.length === 0) fail(`${id} no solids`);

  for (const p of auditLevel(lv)) fail(`${id} audit: ${p}`);

  // The hero must not start inside geometry.
  const spawnBox = { x: lv.spawn.x, y: lv.spawn.y, w: PLAYER_W, h: PLAYER_H };
  for (const s of lv.solids) {
    const overlap =
      spawnBox.x < s.x + s.w && spawnBox.x + spawnBox.w > s.x &&
      spawnBox.y < s.y + s.h && spawnBox.y + spawnBox.h > s.y;
    if (overlap) { fail(`${id} spawn inside solid`); break; }
  }

  // A Game must construct and survive a few steps of zero input.
  const g = new Game(lv, {});
  const idle = { axisX: 0, axisY: 0, isDown: () => false, wasPressed: () => false, wasReleased: () => false, pointer: { x: 0, y: 0, active: false } };
  for (let i = 0; i < 240; i++) g.update(1 / 120, idle, null);
  if (!Number.isFinite(g.player.cx) || !Number.isFinite(g.player.cy)) fail(`${id} player NaN`);
  if (g.player.y > lv.bottomBound + 100) fail(`${id} fell out of world`);
  g.dispose();
}

console.log(ok ? "LOAD OK" : "LOAD FAILED");
process.exit(ok ? 0 : 1);