/**
 * d007_BearGarden: THE BEAR GARDEN (docs/dungeons-plan.md). Mild, home level 8 to 12, small.
 * A baiting house: a round building (a "wooden O") with a sand pit in the middle. Arena Doors
 * throughout, so it needs no key. ONE road, clockwise round the ring and then into the pit:
 *
 *   gatehouse > yard > kennels > feed store > bear house > the ward's room > THE PIT
 *
 * Side rooms (dead ends): two cages in the bear house (a Bear each, shut in behind a door:
 * one at a time, and only if you open it), a pocket of rubble off the feed store (a pick),
 * and the keeper's lodge off the ward's room.
 * Bears and the Great Bear may only be PLACED on dirt, grass, sand or moss (their validon
 * flags), so every bear stands on a patch of its own; once roused they go anywhere.
 * North is up. Centre of the ring (31,30).
 */
const { Dungeon } = require('./lib');
const d = new Dungeon('d007_BearGarden');
const each = (list, fn) => list.forEach((p) => (Array.isArray(p) ? fn(...p) : fn(p)));
const CX = 31, CY = 30;
// an octagon: |dx|,|dy| <= r and |dx|+|dy| <= diag
const oct = (x, y, r, diag) => { const a = Math.abs(x - CX), b = Math.abs(y - CY); return Math.max(a, b) <= r && a + b <= diag; };
const A = 'Arena Door';

// ---------------------------------------------------------------- the ring: 5 tiles wide, round the pit
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (oct(x, y, 12, 17) && !oct(x, y, 7, 10)) d.tile(x, y, 'CB');
// the cross walls that cut the ring into rooms (clockwise from the gate at the south)
for (let y = 38; y <= 42; y++) { d.wall(28, y); d.wall(34, y); }          // yard | kennels, and yard | lodge (no door: the ring is one way)
for (let x = 19; x <= 23; x++) d.wall(x, 27);                              // kennels | feed store
for (let y = 18; y <= 22; y++) d.wall(28, y);                              // feed store | bear house
for (let x = 39; x <= 43; x++) { d.wall(x, 27); d.wall(x, 33); }           // bear house | ward's room | lodge
d.door(28, 40, A); d.door(21, 27, A); d.door(28, 20, A); d.door(41, 27, A); d.door(41, 33, A);

// ================================================================ STAGE 1: the gatehouse, the yard, the kennels
d.floor(29, 44, 33, 47); d.door(31, 43, A);                               // the gatehouse: where the player arrives
d.put(31, 47, 'Dungeon Exit');
each([[30, 45], [32, 45], [30, 47], [32, 47]], (x, y) => d.put(x, y, 'Brazier'));
// the yard (29..33, 38..42): where the crowd came in. Nothing to fight.
d.put(29, 38, 'Heraldic Banner'); d.put(33, 38, 'Heraldic Banner');
d.put(33, 41, 'Barrel'); d.put(33, 42, 'Barrel'); d.put(32, 42, 'Crate'); d.put(29, 42, 'Sack');

// the kennels: straw and mud underfoot, a pen against the west wall, the dogs' water
d.stamp(19, 28, [
  '.,,..    ',
  ',,,,.    ',
  ',,,,,    ',
  ',,,,,    ',
  ',,,,.    ',
  ',,,..    ',
  '~",,,.   ',
  '~~",,,.  ',
  ' ""~,,,. ',
  '  ",,,,..',
  '   ",,,,.',
  '    ,,,..',
  '     ,,..',
  '      "..',
  '       ".',
], {});
each([[19, 29], [20, 29], [21, 30], [21, 31], [19, 33], [20, 33], [21, 33]], (x, y) => d.put(x, y, 'Wooden Fence')); // the pen: its gate (21,32) hangs open
d.put(19, 31, 'Coyote'); d.put(20, 30, 'Coyote'); d.put(22, 31, 'Coyote');       // the first pack: two in the pen, one out
d.put(20, 32, 'Coyote Spawner'); d.put(19, 32, 'Meat'); d.put(19, 30, 'Bones');
d.put(24, 37, 'Coyote'); d.put(25, 39, 'Coyote'); d.put(23, 36, 'Coyote');       // the second pack, loose by the yard door
each([[27, 42], [27, 41], [23, 39]], (x, y) => d.put(x, y, 'Haybale'));
d.put(21, 37, 'Mushroom'); d.put(25, 41, 'Mushroom');
d.put(24, 40, 'Bones'); d.put(23, 33, 'Bones'); d.put(23, 28, 'Sack'); d.put(23, 29, 'Sack');
d.put(22, 35, 'Fern'); d.put(23, 38, 'Fern');

// ================================================================ STAGE 2: the feed store (no fight: a breath)
each([[22, 24], [23, 24], [22, 25], [23, 25], [24, 25], [21, 25], [20, 26], [19, 26]], (x, y) => d.tile(x, y, 'DI')); // the butcher's corner
each([[26, 18], [27, 18], [25, 19]], (x, y) => d.tile(x, y, 'ZZ'));        // damp under the eaves
d.put(23, 23, 'Oak Table');                                                // the block
d.put(22, 25, 'Meat'); d.put(24, 25, 'Meat'); d.put(21, 25, 'Bones'); d.put(19, 26, 'Bones');
each([[19, 25], [20, 24], [21, 23]], (x, y) => d.put(x, y, 'Barrel'));
d.put(25, 21, 'Hand Cart');                                                // two tiles wide
d.put(27, 22, 'Sack'); d.put(26, 22, 'Sack'); d.put(27, 19, 'Crate');
d.put(24, 20, 'Honey'); d.put(27, 23, 'Honey'); d.put(26, 18, 'Mushroom');
// side pocket: a corner of the store has come down. Behind the rubble, what the keeper hid.
d.floor(21, 20, 22, 20); d.tile(21, 21, 'CB'); d.tile(22, 21, 'SL'); d.put(22, 21, 'Rocks');
d.put(21, 20, 'Silver'); d.put(22, 20, 'Honey'); d.put(21, 21, 'Bones');

// ================================================================ STAGE 3: the bear house
// two cages against the north wall, each shut behind its own door; a third bear has got out
each([[30, 18], [30, 19], [30, 20], [31, 20], [33, 20], [34, 20], [34, 18], [34, 19], [35, 20], [37, 20], [38, 20]], (x, y) => d.wall(x, y));
d.door(32, 20, A); d.door(36, 20, A);
each([[31, 18], [32, 18], [33, 18], [31, 19], [32, 19], [33, 19]], (x, y) => d.tile(x, y, 'DI'));
each([[35, 18], [36, 18], [35, 19], [36, 19], [37, 19]], (x, y) => d.tile(x, y, 'DI')); d.tile(36, 18, 'ZZ');
d.put(32, 18, 'Bear'); d.put(31, 18, 'Honey'); d.put(33, 19, 'Bones');
d.put(35, 19, 'Bear'); d.put(37, 19, 'Silver'); d.put(35, 18, 'Meat'); d.put(36, 18, 'Mushroom');
each([[39, 23], [40, 23], [40, 24], [41, 24], [41, 25], [42, 25], [43, 25], [43, 26], [42, 26]], (x, y) => d.tile(x, y, 'DI')); // where the loose one dens
d.put(40, 24, 'Bear'); d.put(43, 26, 'Bear Spawner'); d.put(42, 25, 'Bones'); d.put(39, 23, 'Bones');
each([[29, 22], [30, 22], [38, 21]], (x, y) => d.put(x, y, 'Haybale'));
d.put(29, 18, 'Brazier'); d.put(40, 22, 'Crate'); d.put(39, 21, 'Barrel');
each([[38, 26], [39, 26], [38, 25]], (x, y) => d.tile(x, y, 'ZZ')); d.tile(37, 25, 'WA'); d.put(38, 26, 'Mushroom'); // a leak by the pit wall

// ================================================================ STAGE 4: the ward's room, the lodge, the pit
each([[42, 29], [43, 29], [42, 30], [43, 30], [43, 31], [42, 31]], (x, y) => d.tile(x, y, 'DI'));
d.put(43, 29, 'Bear'); d.put(42, 31, 'Bear');                              // the two brought up for the next bout
d.put(39, 28, 'Brazier'); d.put(39, 32, 'Brazier');           // either side of the bear gate d.put(43, 28, 'Haybale');
d.door(38, 30, A);                                                         // the bear gate, west into the pit

// side room: the keeper's lodge (his two dogs are still in it)
d.put(43, 35, 'Bed');                                                      // two tiles tall
d.put(38, 37, 'Oak Table'); each([[38, 36], [39, 36], [38, 38], [39, 38]], (x, y) => d.put(x, y, 'Chair'));
d.put(35, 37, 'Brazier');                                                  // the hearth
each([[35, 40], [35, 41], [35, 42]], (x, y) => d.put(x, y, 'Barrel')); d.put(36, 42, 'Wine'); d.put(36, 41, 'Wine');
d.put(42, 36, 'Heraldic Banner'); d.put(38, 34, 'Crate'); d.put(39, 34, 'Sack');
d.put(35, 39, 'Gold'); d.put(37, 41, 'Silver'); d.put(38, 40, 'Honey');
d.put(41, 36, 'Coyote'); d.put(37, 39, 'Coyote');

// THE PIT: sand, trodden to mud round the stake
d.stamp(25, 24, [
  '    _____    ',
  '   ___,___   ',
  '  __,,_____  ',
  ' _________,_ ',
  '____,______,_',
  '___,,,,_____,',
  '___,,,T,,____',
  '____,,,,,____',
  '"____,,______',
  ' ""_______,_ ',
  '  "____,,__  ',
  '   _______   ',
  '    _____    ',
], { T: ['DI', 'Dead Tree'] });                                            // the stake
d.put(30, 30, 'Great Bear'); d.put(28, 27, 'Bear'); d.put(33, 33, 'Bear');
d.put(31, 31, 'Scroll'); d.put(25, 30, 'Gold');                           // under the stake; and the far side from the gate
each([[28, 25], [34, 25], [28, 35], [34, 35]], (x, y) => d.put(x, y, 'Heraldic Banner'));
d.put(31, 24, 'Brazier'); d.put(31, 36, 'Brazier');
each([[29, 29], [33, 31], [27, 32], [35, 28]], (x, y) => d.put(x, y, 'Bones'));
d.put(26, 33, 'Mushroom');

d.build();
console.log(d.print());
console.log(JSON.stringify(d.counts()));
console.log('needs mining:', d.needsMining.join(', ') || 'nothing');
if (process.argv.includes('--write')) console.log('written', d.write());
