/**
 * HISTORY. The owner finished d006 in the Editor on 2026-11-11; the layout file is the truth and
 * this script no longer matches it (the kit refuses to write over it). Kept as the worked example.
 *
 * d006_ghosts: THE DROWNED CHANTRY (docs/dungeons-plan.md). Medium, Ghosts (home level 17).
 * A ruined chantry with the water table in it. ONE road, from the porch at the south to the
 * abbots' vault behind the high altar, the long way round:
 *
 *   porch > nave > crossing and chancel > cloister > scriptorium > ossuary > crypt passage > Sepulchre
 *
 * Each stage has at most one side room (a dead end with something in it): the bell tower off
 * the nave, the refectory off the cloister, a walled-up reliquary off the crypt passage.
 * North is up. Rooms are cobblestone; the bare dungeon tile is only the rock outside the walls.
 * Water is drawn by hand (stamps), with mud banks, moss and ferns.
 */
const { Dungeon } = require('./lib');
const d = new Dungeon('d006_ghosts');
const each = (list, fn) => list.forEach((p) => (Array.isArray(p) ? fn(...p) : fn(p)));
// stamp letters on top of the kit's own (. cobble  ~ water  , mud  " moss  ; grass  : slate  # pillar  x rock)
const L = {
  f: ['DI', 'Fern', 'island'],            // a fern on a hummock of mud (out in the water, or on its bank)
  i: ['DI', null, 'island'],              // mud no one can reach (the well's island)
  S: ['DI', 'Ghost Spawner', 'island'],
  W: ['DI', 'Stone Well', 'island'],
  T: ['GR', 'Dead Tree'],
};

// ================================================================ STAGE 1: the porch and the nave
d.floor(37, 56, 43, 60); d.door(40, 55);                                 // the porch: where the player arrives
d.put(40, 60, 'Dungeon Exit');
d.put(38, 56, 'Gargoyle'); d.put(42, 56, 'Gargoyle');                    // either side of the inner door
d.put(37, 60, 'Brazier'); d.put(43, 60, 'Brazier'); d.put(37, 57, 'Bones');

// the nave: the floor has sunk and the water has come up. The east aisle is the dry way north.
// The west aisle is cut in two; the middle is a spit of mud with the best of the room on it.
d.stamp(33, 35, [
  '"".............',
  '"....,~~,......',
  '...#,~~~~,.#...',
  '...,~~~f~~,....',
  '.,,~~~~~~~~,...',
  ',,~#~~~~~~~#...',
  ',~~~~~f~~~~~...',
  '~~~~~~~~~~~,...',
  '~~~#~~~~~~,#...',
  '~~~~f~~~~~,....',
  ',~~~~~~~~~~,...',
  ',,~#~~~~~~~#...',
  '.,,~~~~~~~~~,..',
  '..,~~~,,~~~~~,.',
  '...#~~,,,~~#~,.',
  '...,,~~,~~~,,..',
  '....,,~,~~,....',
  '...#..,,,..#...',
  '...............',
  '...............',
], L);
d.door(40, 34);                                                           // north, to the crossing
d.put(39, 48, 'Gold');                                                    // out on the spit, under the Ghosts
d.put(33, 45, 'Silver'); d.put(33, 41, 'Urns');                           // the two ends of the broken west aisle
d.put(33, 35, 'Mushroom'); d.put(33, 36, 'Mushroom');
d.put(36, 35, 'Brazier'); d.put(44, 35, 'Brazier');
d.put(47, 54, 'Bones'); d.put(35, 53, 'Bones'); d.put(46, 50, 'Fern'); d.put(34, 48, 'Fern');
d.put(38, 43, 'Ghost'); d.put(42, 39, 'Ghost');                           // both hang over the water

d.floor(49, 41, 53, 47); d.door(48, 44);                                  // side room: the foot of the bell tower
each([[53, 41], [52, 41], [53, 42]], (x, y) => d.put(x, y, 'Crate'));
d.put(49, 47, 'Barrel'); d.put(49, 41, 'Bones');
d.put(53, 47, 'Silver'); d.put(51, 41, 'Silver');
d.put(51, 45, 'Ghost');

// ================================================================ STAGE 2: the crossing, the chancel, the cloister
d.floor(31, 27, 49, 33);                                                  // the transepts and the crossing
d.floor(36, 19, 44, 26);                                                  // the chancel, open to the crossing
d.fill(36, 19, 37, 19); d.fill(36, 20); d.fill(43, 19, 44, 19); d.fill(44, 20); // the apse's shoulders
each([[35, 28], [45, 28], [35, 32], [45, 32]], (x, y) => d.wall(x, y));   // the four piers of the crossing
for (let y = 29; y <= 31; y++) for (let x = 38; x <= 42; x++) d.tile(x, y, 'SL'); // a slate square under the tower
d.put(39, 21, 'Oak Table');                                               // the altar (two tiles wide)
d.put(38, 21, 'Silver'); d.put(41, 21, 'Silver'); d.put(40, 20, 'Scroll'); // the altar plate
d.put(38, 19, 'Heraldic Banner'); d.put(42, 19, 'Heraldic Banner');
d.put(37, 24, 'Brazier'); d.put(43, 24, 'Brazier');
d.put(36, 26, 'Gargoyle'); d.put(44, 26, 'Gargoyle');                     // the chancel's mouth
each([[33, 27], [35, 27], [45, 27], [47, 27]], (x, y) => d.put(x, y, 'Knight Statue')); // along the north wall, clear of every door
d.put(49, 30, 'Urns'); d.put(49, 33, 'Bones'); d.put(48, 33, 'Bones'); d.put(49, 27, 'Stone Urn'); // the east transept: a dead end
d.put(40, 23, 'Ghost'); d.put(47, 31, 'Ghost');

// the slype: a door in the corner of the west transept, down into the cloister
d.door(31, 34);
// the cloister: a paved walk round the garth, which is a garden gone to marsh. The pond has
// broken through the east walk, so the way round is north then west; the well of souls
// stands on its island in the middle (a Ghost Spawner no one can reach).
d.stamp(13, 35, [
  '...................',
  '...................',
  '..#.#.#.#.#.#.#.#..',
  '...;;;;;;;;;;,;;...',
  '..#;T;;;;,~~~;;;#..',
  '...;;;;f~~~~~~,;...',
  '..#;;;,~~~~~~~~;#..',
  '...;;,~~~~S~~~~~;..',
  '..#;;~~~~iWi~~~~~,.',
  '...;,~~~~~i~~~~~~~~',
  '..#;;~~f~~~~~~~~~~~',
  '...;;,~~~~~~~f~~~~,',
  '..#;;;,~~~~~~~~~#,.',
  '...;;;;,~~~f~~,;...',
  '..#;T;;;,,~~,;;;#..',
  '...;;;;;;;;;;;;;...',
  '..#.#.#.#.#.#.#.#..',
  '...................',
  '...................',
], L);
each([[13, 53], [14, 53], [13, 52]], (x, y) => d.tile(x, y, 'ZZ'));       // a damp corner
d.put(13, 53, 'Mushroom'); d.put(14, 53, 'Mushroom');
d.put(16, 42, 'Fern'); d.put(27, 39, 'Fern'); d.put(19, 48, 'Fern'); d.put(28, 49, 'Fern');
d.put(31, 46, 'Silver');                                                  // in sight from the slype, across the flood: the long way round
d.put(13, 35, 'Bones'); d.put(30, 53, 'Bones');
d.put(25, 41, 'Ghost'); d.put(22, 52, 'Ghost');

d.floor(14, 55, 28, 59); d.door(20, 54);                                  // side room: the refectory, one long table
each([16, 18, 20, 22, 24], (x) => d.put(x, 57, 'Oak Table'));
each([16, 17, 18, 19, 21, 22, 23, 25], (x) => d.put(x, 56, 'Chair'));     // a seat or two gone from each side
each([16, 17, 18, 20, 21, 22, 24, 25], (x) => d.put(x, 58, 'Chair'));
d.put(15, 57, 'Chair'); d.put(26, 57, 'Chair');                           // the head and the foot
d.put(14, 57, 'Brazier');                                                 // the hearth
each([[28, 55], [27, 55], [28, 56]], (x, y) => d.put(x, y, 'Barrel')); d.put(28, 59, 'Crate');
d.put(28, 57, 'Wine'); d.put(27, 59, 'Wine'); d.put(14, 59, 'Wine'); d.put(28, 58, 'Aged Wine');
d.put(22, 59, 'Ghost');

// ================================================================ STAGE 3: the scriptorium and the ossuary
d.floor(4, 39, 11, 50); d.door(12, 44);                                   // the scriptorium: four desks
each([[5, 41], [9, 41], [5, 47], [9, 47]], (x, y) => d.put(x, y, 'Oak Table'));
d.put(5, 42, 'Chair'); d.put(10, 42, 'Chair'); d.put(6, 48, 'Chair'); d.put(9, 48, 'Chair');
each([[4, 39], [11, 39], [4, 50], [5, 50], [11, 50], [11, 49]], (x, y) => d.put(x, y, 'Stack of Books'));
d.put(4, 44, 'Scroll'); d.put(8, 50, 'Scroll');
d.put(8, 43, 'Ghost'); d.put(7, 46, 'Ghost');

d.door(7, 38); d.floor(7, 33, 8, 37);                                     // the night stair, north
// the ossuary: a charnel heap in the north-west, a sump in the south-east where the damp comes in
d.stamp(3, 21, [
  'xx,,........xx',
  'x,,,..........',
  ',,,...........',
  ',,............',
  ',.....,,......',
  '......,,,.....',
  '.......,......',
  '...........""~',
  '.........""~~~',
  'x........"~f~~',
  'xx......."""~x',
  'xxx.........xx',
], L);
each([[5, 21], [6, 21], [4, 22], [5, 22], [6, 22], [3, 23], [4, 23], [3, 24]], (x, y) => d.put(x, y, 'Bones')); // the heap
each([[9, 25], [10, 26], [11, 26]], (x, y) => d.put(x, y, 'Bones'));
d.put(9, 21, 'Gargoyle'); d.put(12, 21, 'Gargoyle');
d.put(13, 21, 'Urns'); d.put(3, 25, 'Urns'); d.put(16, 22, 'Stone Urn'); d.put(16, 27, 'Silver');
d.put(14, 28, 'Mushroom'); d.put(12, 30, 'Mushroom'); d.put(13, 31, 'Magic Mushroom');
d.put(8, 24, 'Ghost'); d.put(12, 23, 'Ghost'); d.put(6, 29, 'Ghost'); d.put(13, 26, 'Ghost');

// ================================================================ STAGE 4: the crypt passage and the Sepulchre
d.door(17, 24);
d.floor(18, 23, 34, 24);                                                  // east, under the cloister's north wall
d.floor(33, 9, 34, 22);                                                   // then north, along the chancel's flank
// burial niches, one tile each
each([[20, 22, 'Bones'], [24, 22, 'Knight Statue'], [28, 22, 'Urns'], [22, 25, 'Gargoyle'], [26, 25, 'Bones'], [30, 25, 'Stone Urn'], [32, 19, 'Bones'], [32, 11, 'Knight Statue']],
  (x, y, t) => { d.tile(x, y, 'CB'); d.put(x, y, t); });
// a fall of rock half across the passage: one lane open
each([[25, 23], [26, 23], [27, 23], [26, 24]], (x, y) => d.tile(x, y, 'SL')); d.put(26, 23, 'Rocks'); d.put(27, 23, 'Rocks');
// side room: a reliquary walled up behind a fall of rock (a pick opens it)
d.floor(29, 14, 31, 16); d.tile(32, 15, 'SL'); d.put(32, 15, 'Rocks');
d.put(29, 14, 'Gold'); d.put(29, 16, 'Gold'); d.put(29, 15, 'Gargoyle'); d.put(31, 14, 'Bones');
d.put(29, 23, 'Ghost'); d.put(33, 17, 'Ghost');

// the Sepulchre of the Abbots: behind the high altar, and the end of the road
d.door(35, 11);
d.stamp(36, 6, [
  'xx.........xx',
  'x...........x',
  '.............',
  '.............',
  '.............',
  '.::::::::....',
  '.............',
  '.............',
  '.............',
  '...........,~',
  'x.........,f~',
  'xx.......,~~x',
], L);
each([38, 40, 42, 44], (x) => { d.put(x, 9, 'Knight Statue'); d.put(x, 13, 'Knight Statue'); }); // the abbots' effigies, either side of the aisle
d.put(38, 6, 'Gargoyle'); d.put(46, 6, 'Gargoyle');
d.put(46, 9, 'Brazier'); d.put(46, 13, 'Brazier');
d.put(48, 9, 'Heraldic Banner'); d.put(48, 13, 'Heraldic Banner'); d.put(37, 7, 'Stone Urn');
d.put(48, 11, 'Book');                                                    // the one thing worth the whole road
d.put(48, 10, 'Gold'); d.put(48, 12, 'Gold'); d.put(47, 7, 'Gold');
d.put(48, 14, 'Urns'); d.put(45, 6, 'Scroll'); d.put(37, 16, 'Silver');
d.put(41, 11, 'Ghost'); d.put(39, 15, 'Ghost'); d.put(43, 7, 'Ghost'); d.put(46, 11, 'Ghost'); d.put(45, 15, 'Ghost');
d.put(48, 15, 'Ghost Spawner');                                           // in the flooded corner

d.build();
console.log(d.print());
console.log(JSON.stringify(d.counts()));
console.log('needs mining:', d.needsMining.join(', ') || 'nothing');
if (process.argv.includes('--write')) console.log('written', d.write());
