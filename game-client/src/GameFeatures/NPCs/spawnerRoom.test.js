/**
 * The Spawner's room for a multi-tile enemy (NPCSpawnerBehavior.roomFor, owner 2026-11-12): the
 * body is born on the spawner's side of a wall, never through it, even when open ground across
 * the wall is nearer. Run: CI=true npx react-scripts test --watchAll=false spawnerRoom
 */
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { roomFor } from './NPCSpawnerBehavior';
import { npcCells } from '../../Utils/npcFootprint';

jest.mock('../../GridState/GridStateNPCs', () => ({ __esModule: true, default: {} }));
jest.mock('../../GridState/PlayersInGrid', () => ({ __esModule: true, default: {} }));
jest.mock('../../Utils/TuningManager', () => ({
  getMasterResources: () => [{ type: 'g', category: 'tile', passable: true }],
  getGlobalTuning: () => ({ tileHazards: { l: true } }),
}));
jest.mock('../../Utils/worldHelpers', () => ({ calculateDistance: () => 0 }));

function world(rows) {
  const tiles = rows.map((r) => [...r].map(() => 'g'));
  const resources = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') resources.push({ type: 'Stone Wall', x, y, passable: false }); }));
  GlobalGridStateTilesAndResources.setTiles(tiles);
  GlobalGridStateTilesAndResources.setResources(resources);
}
const demon = { type: 'Demon', category: 'npc', action: 'attack', sizeX: 2, sizeY: 2, validong: true };

// the spawner S sits in a one-tile corridor: open ground across the north wall is nearer than
// the 2 x 2 pocket on its own side (the body fits rows 3-4 or 4-5 of columns 3-4)
const ROWS = [
  '........',
  '........',
  '########',
  '.S......',
  '###..###',
  '###..###',
  '########',
];

test('a 2 x 2 enemy is born in the pocket on the spawner side, not across the wall', () => {
  world(ROWS);
  const spot = roomFor(demon, { x: 1, y: 3 }, [], []);
  expect(spot).not.toBeNull();
  for (const c of npcCells(demon, spot)) { expect(c.y).toBeGreaterThanOrEqual(3); expect([3, 4]).toContain(c.x); }
});

test('when the pocket is taken it waits rather than spawning across the wall', () => {
  world(ROWS);
  const other = { id: 'n1', type: 'Imp', sizeX: 2, sizeY: 2, position: { x: 3, y: 5 } }; // fills the pocket
  expect(roomFor(demon, { x: 1, y: 3 }, [other], [])).toBeNull();
});

test('with no room on its side at all it falls back to the nearest fit', () => {
  world(ROWS.map((r, y) => (y === 4 || y === 5 ? '########' : r)));
  const spot = roomFor(demon, { x: 1, y: 3 }, [], []);
  expect(spot).not.toBeNull();
  for (const c of npcCells(demon, spot)) expect(c.y).toBeLessThan(2);
});
