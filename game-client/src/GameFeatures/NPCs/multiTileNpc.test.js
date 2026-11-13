/**
 * Multi-tile NPCs (Utils/npcFootprint.js, owner 2026-11-11): "No part of their tile footprint can
 * make an illegal move." The real NPC class and the real enemy brain walk a 2 x 2 enemy round a
 * small map; after every tick every tile of its body must be legal ground, clear of walls, of the
 * player and of other NPCs. Run: npx react-scripts test --watchAll=false multiTileNpc
 */
import NPC from './AllNPCsShared';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import { npcCells, npcReach, npcCovers, npcNearestCell, npcCentre, anchorsBeside, tilesInReach } from '../../Utils/npcFootprint';
import { buildPassability, findPath, findPathToAny } from '../../Utils/Pathfinding';

const mockWorld = { npcs: {}, player: { playerId: 'p1', username: 'tester', hp: 100, armorclass: 10, position: { x: 0, y: 0 } } };

jest.mock('../../GridState/GridStateNPCs', () => ({ __esModule: true, default: {
  updateNPCPosition: jest.fn(), updateNPC: jest.fn(async () => {}), getNPCsInGrid: () => mockWorld.npcs,
} }));
jest.mock('../../GridState/PlayersInGrid', () => ({ __esModule: true, default: {
  getLocalRecord: () => mockWorld.player, getPlayersInGrid: () => ({ p1: mockWorld.player }), updatePC: jest.fn(), flushAfterTransaction: jest.fn(),
} }));
jest.mock('../../Utils/TuningManager', () => ({
  getMasterResources: () => [{ type: 'g', category: 'tile', passable: true }, { type: 'w', category: 'tile', passable: false }, { type: 'l', category: 'tile', passable: true }],
  getGlobalTuning: () => ({ tileHazards: { l: true } }),
}));
jest.mock('../Doors/Doors.js', () => ({ checkDoorAccess: () => ({ hasAccess: false }) }));
jest.mock('../../Utils/worldHelpers', () => ({ calculateDistance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y) }));
jest.mock('../../Utils/GridManagement', () => ({ isWallBlocking: () => false }));
jest.mock('../../Sound/SoundManager', () => ({ __esModule: true, default: { playSFX: jest.fn() } }));
jest.mock('../../VFX/VFX', () => ({ createImpactEffect: jest.fn() }));
jest.mock('../../Render/PixiRenderer/CombatFX', () => ({ __esModule: true, default: new Proxy({ FX: { WINDUP_MS: 0 } }, { get: (t, k) => (k in t ? t[k] : () => {}) }) }));
jest.mock('./NPCGrazeBehavior', () => ({ attachGrazingBehavior: () => {} }));
jest.mock('./NPCQuestBehavior', () => ({ attachQuestBehavior: () => {} }));
jest.mock('./NPCHealBehavior', () => ({ attachHealBehavior: () => {} }));
jest.mock('./NPCSpawnerBehavior', () => ({ attachSpawnBehavior: () => {} }));
jest.mock('./NPCWorkerBehavior', () => ({ attachFarmerBehavior: () => {} }));
jest.mock('./NPCCitizenBehavior', () => ({ attachCitizenBehavior: () => {} }));
jest.mock('./NPCTraderBehavior', () => ({ attachTraderBehavior: () => {} }));

/** A map from rows of text: '.' grass, '#' a wall (an impassable resource on grass), '~' water, '^' lava. */
function world(rows) {
  const tiles = rows.map((r) => [...r].map((c) => (c === '~' ? 'w' : c === '^' ? 'l' : 'g')));
  const resources = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') resources.push({ type: 'Stone Wall', x, y, passable: false }); }));
  GlobalGridStateTilesAndResources.setTiles(tiles);
  GlobalGridStateTilesAndResources.setResources(resources);
  return { tiles, resources };
}
const enemy = (id, x, y, extra = {}) => new NPC(id, extra.type || 'Phoenix', { x, y }, {
  action: 'attack', symbol: 'P', passable: false, validong: true, range: 30, attackrange: 1, movespeed: 5, hp: 100, maxhp: 100, state: 'roam', ...extra,
}, 'g1');

/** Every tile of the body is on the grid, on ground it may stand on, off the walls, off the player, off every other NPC. */
function expectLegal(npc, { tiles, resources }) {
  for (const c of npcCells(npc)) {
    expect(c.y >= 0 && c.x >= 0 && c.y < tiles.length && c.x < tiles[0].length).toBe(true);
    expect(tiles[c.y][c.x]).toBe('g');
    expect(resources.some((r) => r.x === c.x && r.y === c.y)).toBe(false);
    expect(Math.round(mockWorld.player.position.x) === c.x && Math.round(mockWorld.player.position.y) === c.y).toBe(false);
    for (const other of Object.values(mockWorld.npcs)) if (other.id !== npc.id) expect(npcCovers(other, c.x, c.y)).toBe(false);
  }
}
async function run(npc, map, ticks) {
  for (let i = 0; i < ticks; i++) {
    await npc.handleEnemyBehavior('g1', 45);
    expectLegal(npc, map);
  }
}

beforeEach(() => { mockWorld.npcs = {}; mockWorld.player = { playerId: 'p1', username: 'tester', hp: 100000, armorclass: 99, position: { x: 0, y: 0 } }; });

describe('the footprint helpers', () => {
  const big = { sizeX: 2, sizeY: 2, position: { x: 5, y: 5 } };
  test('a body is anchored at its lower-left tile and grows right and up', () => {
    expect(npcCells(big)).toEqual(expect.arrayContaining([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 4 }, { x: 6, y: 4 }]));
    expect(npcCells(big)).toHaveLength(4);
    expect(npcCovers(big, 6, 4)).toBe(true);
    expect(npcCovers(big, 7, 5)).toBe(false);
    expect(npcCovers(big, 5, 6)).toBe(false);
    expect(npcCentre(big)).toEqual({ x: 5.5, y: 4.5 });
  });
  test('reach is from the nearest tile of the body', () => {
    expect(npcNearestCell(big, { x: 9, y: 0 })).toEqual({ x: 6, y: 4 });
    expect(npcReach(big, { x: 7, y: 4 })).toBe(1);
    expect(npcReach(big, { x: 7, y: 3 })).toBe(1);
    expect(npcReach(big, { x: 8, y: 5 })).toBe(2);
    expect(npcReach(big, { x: 6, y: 5 })).toBe(0);
  });
  test('beside a tile: the eight neighbours for a 1 x 1, twelve anchors for a 2 x 2, none of them on it', () => {
    expect(anchorsBeside({ position: { x: 0, y: 0 } }, 4, 4)).toHaveLength(8);
    const spots = anchorsBeside(big, 4, 4);
    expect(spots).toHaveLength(12);
    for (const a of spots) { expect(npcCovers(big, 4, 4, a)).toBe(false); expect(npcReach(big, { x: 4, y: 4 }, a)).toBe(1); }
  });
  test('a 1 x 1 NPC is exactly what it was', () => {
    const small = { position: { x: 3, y: 7 } };
    expect(npcCells(small)).toEqual([{ x: 3, y: 7 }]);
    expect(npcCentre(small)).toEqual({ x: 3, y: 7 });
    expect(npcReach(small, { x: 5, y: 8 })).toBe(2);
  });
});

describe('a 2 x 2 enemy moves only where its whole body may', () => {
  test('a step is refused when any tile of the body would land on a wall, water, lava, the player or another NPC', () => {
    const map = world([
      '........',
      '...#....',
      '........',
      '.....~..',
      '........',
      '........',
    ]);
    const npc = enemy('big', 2, 3, { sizeX: 2, sizeY: 2 }); mockWorld.npcs = { big: npc };
    const ok = (x, y) => npc.isValidTile(x, y, map.tiles, map.resources, Object.values(mockWorld.npcs));
    mockWorld.player.position = { x: 7, y: 5 };
    expect(ok(2, 3)).toBe(true);
    expect(ok(2, 2)).toBe(false);   // its upper right tile would be the wall at (3, 1)
    expect(ok(3, 2)).toBe(false);   // its upper left tile would be the wall
    expect(ok(4, 3)).toBe(false);   // its lower right tile would be the water at (5, 3)
    expect(ok(4, 4)).toBe(false);   // its upper right tile would be the water
    expect(ok(7, 3)).toBe(false);   // off the east edge
    expect(ok(2, 0)).toBe(false);   // off the north edge
    expect(ok(6, 5)).toBe(false);   // its lower right tile would be the player
    const small = enemy('small', 4, 5, { type: 'Coyote' }); mockWorld.npcs.small = small;
    expect(ok(3, 5)).toBe(false);   // its lower right tile would be the small enemy
    expect(small.isValidTile(3, 3, map.tiles, map.resources, Object.values(mockWorld.npcs))).toBe(false); // and the small one may not step into the big one's body
    expect(small.isValidTile(2, 2, map.tiles, map.resources, Object.values(mockWorld.npcs))).toBe(false);
    expect(small.isValidTile(4, 4, map.tiles, map.resources, Object.values(mockWorld.npcs))).toBe(true);
  });

  test('it chases the player through a two-wide gap, never illegally, and ends touching them', async () => {
    const map = world([
      '............',
      '............',
      '............',
      '#####..#####',
      '............',
      '............',
      '............',
    ]);
    const npc = enemy('big', 1, 2, { sizeX: 2, sizeY: 2 }); mockWorld.npcs = { big: npc };
    mockWorld.player.position = { x: 9, y: 6 };
    expectLegal(npc, map);
    await run(npc, map, 60);
    expect(npcReach(npc, mockWorld.player.position)).toBe(1);
    expect(npc.state).toBe('attack');
  });

  test('a one-wide gap stops it (a 1 x 1 enemy goes through)', async () => {
    const map = world([
      '............',
      '............',
      '............',
      '######.#####',
      '............',
      '............',
      '............',
    ]);
    const big = enemy('big', 1, 2, { sizeX: 2, sizeY: 2 }); mockWorld.npcs = { big };
    mockWorld.player.position = { x: 9, y: 6 };
    await run(big, map, 60);
    expect(big.position.y).toBeLessThanOrEqual(2);              // still north of the wall
    const small = enemy('small', 1, 1, { type: 'Coyote' }); mockWorld.npcs = { small };
    await run(small, map, 60);
    expect(npcReach(small, mockWorld.player.position)).toBe(1);
  });

  test('a 2 x 4 enemy and a 1 x 2 enemy do the same', async () => {
    const map = world([
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
      '######..######',
      '######..######',
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
    ]);
    const dragon = enemy('dragon', 0, 4, { sizeX: 2, sizeY: 4, type: 'Dragon' }); mockWorld.npcs = { dragon };
    mockWorld.player.position = { x: 12, y: 11 };
    await run(dragon, map, 90);
    expect(npcReach(dragon, mockWorld.player.position)).toBe(1);
    // a 1 x 2 demon comes after it and has to find its way round the dragon's body
    const demon = enemy('demon', 12, 3, { sizeX: 1, sizeY: 2, type: 'Demon' }); mockWorld.npcs = { dragon, demon };
    await run(demon, map, 90);
    expect(npcReach(demon, mockWorld.player.position)).toBe(1);
    expectLegal(dragon, map);
  });

  test('with no legal way through, it stays on its side rather than squeeze', async () => {
    const map = world([
      '......',
      '......',
      '##..##',
      '......',
    ]);
    // the gap is two wide but the room beyond is one tile deep: a 2 x 2 body cannot stand in it
    const npc = enemy('big', 0, 1, { sizeX: 2, sizeY: 2 }); mockWorld.npcs = { big: npc };
    mockWorld.player.position = { x: 5, y: 3 };
    await run(npc, map, 40);
    expect(npc.position.y).toBeLessThanOrEqual(1);
  });
});

describe('the player and a 2 x 2 enemy', () => {
  test('every tile of its body blocks the player, and a tap on it routes to a tile beside it', () => {
    const map = world(['......', '......', '......', '......', '......', '......']);
    const npc = enemy('big', 2, 3, { sizeX: 2, sizeY: 2 });
    const passable = buildPassability({ tiles: map.tiles, resources: map.resources, npcs: [npc], masterResources: [{ type: 'g', category: 'tile', passable: true }], currentPlayer: {} });
    for (const c of npcCells(npc)) expect(passable(c.x, c.y)).toBe(false);
    expect(passable(4, 3)).toBe(true);
    const path = findPath({ x: 0, y: 5 }, { x: 3, y: 2 }, passable);   // a tile of its body
    const end = path[path.length - 1];
    expect(npcCovers(npc, end.x, end.y)).toBe(false);
    expect(npcReach(npc, end)).toBe(1);
  });
});

describe('a tap on an enemy out of reach walks to a tile it can be struck from', () => {
  test('the tiles in reach: the ring round the body for a sword, wider for a bow, never on the body', () => {
    const small = { position: { x: 5, y: 5 } }, big = { sizeX: 2, sizeY: 2, position: { x: 5, y: 5 } };
    expect(tilesInReach(small, 1)).toHaveLength(8);
    expect(tilesInReach(big, 1)).toHaveLength(12);
    expect(tilesInReach(small, 3)).toHaveLength(48);
    for (const npc of [small, big]) for (const range of [1, 2, 4]) {
      for (const t of tilesInReach(npc, range)) { expect(npcCovers(npc, t.x, t.y)).toBe(false); expect(npcReach(npc, t)).toBeGreaterThanOrEqual(1); expect(npcReach(npc, t)).toBeLessThanOrEqual(range); }
    }
  });
  test('the walk ends on the nearest such tile; with every one walled off there is no walk', () => {
    const open = world(['.......', '.......', '.......', '.......', '.......', '.......']);
    const npc = enemy('big', 4, 2, { sizeX: 2, sizeY: 2 });
    const pass = (map) => buildPassability({ tiles: map.tiles, resources: map.resources, npcs: [npc], masterResources: [{ type: 'g', category: 'tile', passable: true }], currentPlayer: {} });
    const path = findPathToAny({ x: 0, y: 5 }, npc.position, tilesInReach(npc, 1), pass(open));
    const end = path[path.length - 1];
    expect(npcReach(npc, end)).toBe(1);
    expect(path.length).toBe(3); // (3, 3) is the nearest tile of the ring, three steps away
    const bow = findPathToAny({ x: 0, y: 5 }, npc.position, tilesInReach(npc, 3), pass(open));
    expect(bow.length).toBe(1);  // a bow needs only one step for the shot
    const walled = world(['...#...', '...#...', '...#...', '...#...', '...#...', '...#...']);
    expect(findPathToAny({ x: 0, y: 5 }, npc.position, tilesInReach(npc, 1), pass(walled))).toEqual([]);
  });
});

describe('a multi-tile enemy placed where its body does not fit', () => {
  test('a 2 x 2 placed against a wall settles on the nearest anchor where all four tiles are open', () => {
    const map = world([
      '########',
      '#......#',
      '#......#',
      '#......#',
      '########',
    ]);
    const demon = enemy('d1', 1, 1, { sizeX: 2, sizeY: 2 }); // its top row would be in the wall
    mockWorld.npcs = { d1: demon };
    mockWorld.player.position = { x: 6, y: 3 };
    demon.settleBody('g1');
    expectLegal(demon, map);
    expect(Math.max(Math.abs(demon.position.x - 1), Math.abs(demon.position.y - 1))).toBe(1);
  });
  test('two 1 x 2 enemies placed one above the other move apart; one that fits stays where it is', () => {
    const map = world([
      '......',
      '......',
      '......',
      '......',
    ]);
    const a = enemy('a', 2, 2, { sizeX: 1, sizeY: 2 });
    const b = enemy('b', 2, 3, { sizeX: 1, sizeY: 2 }); // b's upper tile is a's anchor
    const c = enemy('c', 5, 3, { sizeX: 1, sizeY: 2 });
    mockWorld.npcs = { a, b, c };
    mockWorld.player.position = { x: 0, y: 0 };
    for (const n of [a, b, c]) n.settleBody('g1');
    for (const n of [a, b, c]) expectLegal(n, map);
    expect(c.position).toEqual({ x: 5, y: 3 });
  });
});
