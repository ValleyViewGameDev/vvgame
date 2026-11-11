/**
 * d008_SpiderMine: THE SPIDER MINE (docs/dungeons-plan.md). Mild to medium, home level 12 to 16.
 * An abandoned silver mine. The way in is top left; DOWN the map is deeper. ONE road that
 * switches back four times, a winze (a short shaft with a door) between each level:
 *
 *   adit > upper level > [winze] > two web halls > [winze] > the cart run > [winze] > the sump > the brood chamber > the lode
 *
 * Side rooms (dead ends), one a stage: the miners' mess (upper level), the ore store behind a
 * fall of rock (web halls), a stash behind a Mirror (cart run, Mirror Key L14), and the lode
 * itself at the very end.
 * Tunnels are two tiles wide and drawn as runs with jogs; the caverns are drawn by hand (stamps).
 * A fall of rock closes the cart run: a Pickaxe (L8) is expected.
 */
const { Dungeon } = require('./lib');
const d = new Dungeon('d008_SpiderMine');
const each = (list, fn) => list.forEach((p) => (Array.isArray(p) ? fn(...p) : fn(p)));
const L = { f: ['DI', 'Fern', 'island'] };                                 // a fern on a hummock out in the water
const ore = (x, y) => { d.tile(x, y, 'SL'); d.put(x, y, 'Rocks'); };       // a vein in the wall, or a fall of rock
const moss = (list) => each(list, (x, y) => d.tile(x, y, 'ZZ'));
const mud = (list) => each(list, (x, y) => d.tile(x, y, 'DI'));

// ================================================================ STAGE 1: the adit and the upper level
d.floor(3, 3, 9, 8); d.fill(3, 3); d.fill(9, 3); d.fill(3, 8);            // the adit: where the player arrives
d.put(6, 3, 'Dungeon Exit'); d.put(4, 3, 'Brazier'); d.put(8, 3, 'Brazier');
d.put(4, 7, 'Hand Cart'); d.put(9, 8, 'Crate'); d.put(8, 8, 'Crate'); d.put(9, 7, 'Sack'); d.put(3, 4, 'Barrel');
d.door(10, 5);

d.floor(11, 5, 21, 6); d.floor(20, 5, 21, 10); d.floor(20, 9, 33, 10);    // east, a jog south, east
d.floor(32, 4, 33, 10); d.floor(32, 4, 46, 5);                            // a jog north, east
d.floor(45, 4, 46, 13); d.floor(45, 12, 56, 13); d.floor(55, 12, 56, 19); // south, east, and the first winze
// the tunnel is not a ruler line: workings, damp, veins
each([[14, 4], [15, 4], [16, 4]], (x, y) => d.tile(x, y, 'CB')); ore(15, 4);
each([[27, 11], [28, 11], [29, 8], [30, 8]], (x, y) => d.tile(x, y, 'CB'));
moss([[20, 10], [21, 10], [22, 10], [28, 11], [32, 4], [33, 4]]); d.put(20, 10, 'Mushroom'); d.put(28, 11, 'Mushroom');
each([[38, 6], [39, 6], [40, 6], [39, 7]], (x, y) => d.tile(x, y, 'CB')); ore(39, 7); d.tile(38, 6, 'WA');
each([[47, 8], [47, 9]], (x, y) => d.tile(x, y, 'CB')); ore(47, 9);
mud([[12, 6], [13, 6], [24, 9], [25, 9], [36, 5], [37, 5], [50, 13], [51, 13]]);
moss([[45, 13], [46, 13], [56, 12], [56, 13]]); d.put(56, 12, 'Mushroom');
d.put(18, 6, 'Barrel'); d.put(33, 10, 'Crate'); d.put(42, 4, 'Sack'); d.put(53, 12, 'Hand Cart');
d.put(11, 6, 'Bones'); d.put(46, 7, 'Bones');
d.put(17, 5, 'Spider'); d.put(27, 9, 'Spider'); d.put(33, 7, 'Spider'); d.put(40, 4, 'Spider'); d.put(41, 5, 'Spider'); d.put(50, 12, 'Spider');

d.floor(22, 12, 30, 16); d.door(25, 11);                                  // side room: the miners' mess
d.put(24, 14, 'Oak Table'); d.put(26, 14, 'Oak Table');
each([24, 25, 26, 27], (x) => { d.put(x, 13, 'Chair'); d.put(x, 15, 'Chair'); });
d.put(22, 14, 'Brazier');                                                  // the hearth
d.put(30, 12, 'Barrel'); d.put(30, 13, 'Barrel'); d.put(30, 16, 'Crate'); d.put(22, 16, 'Sack'); d.put(23, 16, 'Sack');
d.put(29, 12, 'Wine'); d.put(30, 14, 'Wine'); d.put(22, 12, 'Silver');
d.put(28, 15, 'Spider');

d.wall(55, 17); d.door(56, 17);                                            // the winze's door: the end of stage 1

// ================================================================ STAGE 2: the web halls
d.stamp(42, 20, [                                                          // the first hall
  '      ..........',
  '    ...,..#.....',
  '  ...,,...##..."',
  ' ....,,.......""',
  '......#.......~"',
  '.....##......~~"',
  ' ............"~ ',
  '  .....,,....." ',
  '    ...,,...    ',
], L);
d.put(57, 22, 'Mushroom'); d.put(57, 25, 'Mushroom'); d.put(50, 27, 'Bones'); d.put(56, 21, 'Silver');
d.put(49, 20, 'Barrel'); d.put(50, 20, 'Barrel'); d.put(48, 28, 'Sack');
each([44, 45, 46, 47], (x) => d.put(x, 24, 'Spider'));                     // a pack in a row, across the way out

d.floor(33, 24, 41, 25);                                                   // west
each([[36, 23], [37, 23]], (x, y) => d.tile(x, y, 'CB')); ore(36, 23); mud([[38, 25], [39, 25]]);
d.stamp(14, 18, [                                                          // the second hall, the big one
  '        ......      ',
  '     ..........     ',
  '   ....,,.......    ',
  '  ""...,,,..#.....  ',
  '  ~"......##......  ',
  ' ~~"..#...........  ',
  '."~...##........... ',
  '......#...,,....... ',
  ' .........,,,.....  ',
  '  ......#...,....   ',
  '   ....##.......""  ',
  '    ..........."~   ',
  '      ........""    ',
  '        .....       ',
], L);
each([22, 23, 24, 25, 26], (x) => d.put(x, 23, 'Spider'));                 // the row
d.put(24, 28, 'Spider'); d.put(25, 29, 'Spider');
d.put(16, 21, 'Mushroom'); d.put(17, 23, 'Mushroom'); d.put(30, 28, 'Mushroom'); d.put(29, 30, 'Magic Mushroom');
d.put(27, 20, 'Bones'); d.put(18, 27, 'Bones'); d.put(28, 26, 'Silver'); d.put(22, 18, 'Crate'); d.put(23, 18, 'Crate');
// side room: the ore store, behind a fall of rock at the hall's south end
ore(24, 32); ore(25, 32); d.floor(22, 33, 26, 34);
each([[22, 33], [26, 33]], (x, y) => d.tile(x, y, 'SL')); d.put(22, 33, 'Stone'); d.put(26, 33, 'Stone');
d.put(22, 34, 'Silver'); d.put(23, 34, 'Silver'); d.put(26, 34, 'Silver'); d.put(24, 34, 'Crate');

d.floor(6, 24, 13, 25); d.floor(6, 24, 7, 36);                             // west, and the second winze
each([[9, 23], [10, 23]], (x, y) => d.tile(x, y, 'CB')); ore(10, 23);
moss([[6, 24], [7, 24], [6, 25], [6, 29], [6, 30]]); d.put(6, 24, 'Mushroom');
d.put(12, 25, 'Spider'); d.put(7, 28, 'Spider');
d.wall(6, 33); d.door(7, 33);                                              // the end of stage 2

// ================================================================ STAGE 3: the cart run
d.floor(6, 37, 53, 38);                                                    // a long straight: the Spiders spit three tiles
// refuges cut in the walls, to duck into
each([[12, 36], [13, 36], [18, 36], [19, 36], [30, 36], [31, 36], [40, 36], [41, 36], [47, 36], [48, 36],
  [16, 39], [17, 39], [24, 39], [25, 39], [44, 39], [45, 39]], (x, y) => d.tile(x, y, 'CB'));
d.put(13, 36, 'Barrel'); d.put(18, 36, 'Crate'); d.put(31, 36, 'Sack'); d.put(41, 36, 'Barrel'); d.put(16, 39, 'Crate');
d.put(24, 39, 'Bones'); d.put(48, 36, 'Silver'); d.put(45, 39, 'Bones');
moss([[6, 37], [6, 38], [7, 38], [44, 39], [47, 36]]); d.put(6, 38, 'Mushroom');
mud([[9, 38], [10, 38], [21, 37], [22, 37], [36, 38], [37, 38], [50, 37]]);
d.put(10, 37, 'Hand Cart'); d.put(32, 38, 'Hand Cart'); d.put(43, 37, 'Hand Cart'); // off the rails, each across one lane
// the fall: two Rocks deep across both lanes
each([[26, 37], [26, 38], [29, 37], [29, 38]], (x, y) => d.tile(x, y, 'SL'));
each([[27, 37], [27, 38], [28, 37], [28, 38]], (x, y) => ore(x, y));
d.put(15, 38, 'Spider'); d.put(22, 38, 'Spider');
each([37, 38, 39, 40], (x) => d.put(x, 38, 'Spider'));                     // the row, beyond the fall
d.put(47, 37, 'Spider'); d.put(49, 38, 'Spider');
// side room: someone's stash behind a Mirror
d.door(34, 39, 'Mirror'); d.floor(33, 40, 35, 41); moss([[33, 41], [35, 40]]);
d.put(33, 40, 'Scroll'); d.put(35, 41, 'Scroll'); d.put(34, 41, 'Gold'); d.put(33, 41, 'Mushroom');

d.floor(52, 37, 53, 46); d.wall(52, 43); d.door(53, 43);                   // the third winze: the end of stage 3

// ================================================================ STAGE 4: the sump, the brood chamber, the lode
d.stamp(36, 46, [                                                          // the sump: the bottom of the mine, flooded
  '             ......   ',
  '          ..,,.....,  ',
  '       ...,~~,....,,~ ',
  '     ...,~~~~,..,~~~" ',
  '   "..,~~~f~~,.,~~~~" ',
  '  ""..,~~~~~~,,,~~f~" ',
  ' ".....,~~~~,..,~~~"" ',
  '.......,,~~,...,,~""  ',
  '........,,,.....,""   ',
  ' ..~~,........,,"     ',
  '  ,~~~,......,"       ',
  '  ,,~f~,....""        ',
  '   ,,~~,..""          ',
  '     ,,""             ',
], L);
d.put(50, 50, 'Zombie'); d.put(44, 54, 'Zombie');                          // the lost shift
d.put(39, 53, 'Spider'); d.put(40, 54, 'Spider');
d.put(55, 48, 'Silver'); d.put(38, 56, 'Scroll'); d.put(41, 59, 'Silver');
d.put(39, 50, 'Mushroom'); d.put(38, 51, 'Mushroom'); d.put(56, 50, 'Mushroom'); d.put(44, 59, 'Mushroom'); d.put(48, 57, 'Mushroom');
d.put(49, 47, 'Bones'); d.put(46, 55, 'Bones'); d.put(51, 54, 'Bones'); d.put(50, 46, 'Hand Cart');

d.floor(31, 53, 35, 54); d.wall(33, 53); d.door(33, 54);                   // west
d.stamp(9, 44, [                                                           // the brood chamber
  '        ......        ',
  '     ...........      ',
  '   ......,,......     ',
  '  ....#..,,,........  ',
  ' ....##.............  ',
  ' ..........,,...#.... ',
  '""........,,,..##.... ',
  '"~".......,,......... ',
  '"~~"................. ',
  '  ~"..................',
  '  ""....#.............',
  '   ....##...........  ',
  '    ..........,,...   ',
  '     ........,,,.     ',
  '       .......""      ',
  '         ...."        ',
], L);
d.put(19, 49, 'Spider Spawner'); d.put(20, 51, 'Spider Spawner');
each([17, 18, 19, 20], (x) => d.put(x, 46, 'Spider'));
each([21, 22, 23, 24], (x) => d.put(x, 56, 'Spider'));
d.put(9, 50, 'Mushroom'); d.put(12, 54, 'Mushroom'); d.put(23, 58, 'Mushroom');
each([[16, 49], [22, 52], [27, 48], [14, 56], [19, 53]], (x, y) => d.put(x, y, 'Bones'));
d.put(28, 50, 'Silver'); d.put(20, 59, 'Silver'); d.put(17, 44, 'Scroll');
// the lode: the vein they were all here for (one wall west of the brood chamber's damp edge)
d.door(8, 49); d.tile(9, 49, 'CB'); d.floor(2, 46, 7, 52, 'SL'); d.fill(2, 46); d.fill(2, 52);
d.tile(7, 49, 'CB'); d.tile(6, 49, 'CB');
d.put(7, 47, 'Brazier'); d.put(7, 51, 'Brazier');
ore(2, 48); ore(2, 50); ore(4, 46); ore(4, 52);
d.put(3, 49, 'Gold'); d.put(2, 49, 'Gold'); d.put(3, 47, 'Gold'); d.put(3, 51, 'Gold');
d.put(5, 46, 'Silver'); d.put(5, 52, 'Silver'); d.put(4, 48, 'Stone'); d.put(4, 50, 'Stone'); d.put(6, 47, 'Stone');
d.put(5, 49, 'Scroll');

d.build();
console.log(d.print());
console.log(JSON.stringify(d.counts()));
console.log('needs mining:', d.needsMining.join(', ') || 'nothing');
if (process.argv.includes('--write')) console.log('written', d.write());
