/**
 * d006_ghosts: THE DROWNED CHANTRY (docs/dungeons-plan.md). Medium, Ghosts (home level 17).
 * A cruciform chapel whose nave has sunk into the water table, with its cloister, its cellar
 * and the abbots' crypt ringed round the chancel. Ghosts cross water; the player does not.
 * North is up. Tiers: 1 the west front (narthex, bell tower, sacristy), 2 the nave, the cloister
 * and the undercroft, 3 the transepts, the chancel, the ossuary and the scriptorium, 4 the
 * ambulatory and the Sepulchre of the Abbots.
 */
const { Dungeon } = require('./lib');
const d = new Dungeon('d006_ghosts');
const each = (list, fn) => list.forEach((p) => fn(...p));
const CRYPT = 'DU'; // the crypt's bare dark floor; the chapel is paved (CB)

// ---------------------------------------------------------------- the crypt ring (tier 4)
d.floor(10, 2, 50, 3, CRYPT);            // north ambulatory
d.floor(10, 4, 11, 16, CRYPT);           // west ambulatory
d.floor(49, 4, 50, 16, CRYPT);           // east ambulatory
d.door(10, 17); d.door(50, 17);          // down from the transepts
// burial niches off the ring
each([[9, 7], [9, 11], [9, 14], [51, 6], [51, 9], [51, 13], [16, 1], [24, 1], [36, 1], [44, 1]], (x, y) => d.tile(x, y, CRYPT));
d.put(9, 7, 'Bones'); d.put(9, 11, 'Stone Bust'); d.put(9, 14, 'Urns');
d.put(51, 6, 'Urns'); d.put(51, 9, 'Stone Bust'); d.put(51, 13, 'Bones');
d.put(16, 1, 'Knight Statue'); d.put(24, 1, 'Bones'); d.put(36, 1, 'Bones'); d.put(44, 1, 'Knight Statue');
// a fall of rock in the north-east corner: one lane still open
d.tile(47, 2, 'SL'); d.tile(48, 2, 'SL'); d.tile(48, 3, 'SL'); d.put(47, 2, 'Rocks'); d.put(48, 2, 'Rocks');
d.put(36, 3, 'Ghost');

// the Sepulchre of the Abbots: the end of the dungeon, entered from the north
d.floor(25, 5, 35, 9, CRYPT); d.door(30, 4);
d.put(25, 5, 'Brazier'); d.put(35, 5, 'Brazier');
d.put(26, 9, 'Marble Statue'); d.put(34, 9, 'Marble Statue'); // each stands two tiles tall
d.put(27, 6, 'Ghost'); d.put(33, 6, 'Ghost'); d.put(30, 8, 'Ghost'); d.put(30, 6, 'Ghost Spawner');
d.put(30, 9, 'Book'); d.put(28, 9, 'Gold'); d.put(32, 9, 'Gold'); d.put(25, 7, 'Gold');
d.put(35, 7, 'Urns'); d.put(25, 9, 'Scroll');

// the ossuary (west) and the scriptorium (east), each a way round between transept and ring
d.floor(13, 5, 22, 16, CRYPT); d.door(12, 10); d.door(17, 17);
each([[19, 9], [20, 9], [21, 9], [19, 10], [20, 10], [21, 10], [20, 11], [21, 11]], (x, y) => d.tile(x, y, 'ZZ')); // damp
d.put(19, 9, 'Mushroom'); d.put(21, 11, 'Mushroom'); d.put(20, 10, 'Magic Mushroom');
each([[13, 5], [14, 5], [13, 6], [22, 5], [21, 5], [22, 16]], (x, y) => d.put(x, y, 'Bones'));
d.put(13, 16, 'Stone Urn'); d.put(16, 5, 'Gargoyle'); d.put(19, 5, 'Gargoyle');
d.put(16, 8, 'Ghost'); d.put(20, 14, 'Ghost');

d.floor(38, 5, 47, 16); d.door(48, 10); d.door(43, 17);
d.put(41, 8, 'Oak Table'); d.put(41, 9, 'Chair'); d.put(42, 9, 'Chair');
d.put(44, 13, 'Oak Table'); d.put(44, 14, 'Chair');
each([[38, 5], [39, 5], [47, 5], [47, 16], [38, 16]], (x, y) => d.put(x, y, 'Stack of Books'));
d.put(47, 12, 'Harp'); d.put(40, 6, 'Scroll'); d.put(46, 15, 'Scroll');
d.put(43, 10, 'Ghost');

// ---------------------------------------------------------------- the chancel and the transepts (tier 3)
d.floor(25, 11, 35, 16); d.fill(25, 11); d.fill(35, 11); // the apse's shoulders
d.door(30, 17);                                          // the rood screen
d.put(29, 12, 'Oak Table');                              // the altar
d.put(28, 12, 'Silver'); d.put(31, 12, 'Silver'); d.put(30, 11, 'Scroll');
d.put(27, 11, 'Heraldic Banner'); d.put(33, 11, 'Heraldic Banner');
d.put(26, 16, 'Brazier'); d.put(34, 16, 'Brazier');
d.put(27, 14, 'Ghost'); d.put(33, 14, 'Ghost');

d.floor(10, 18, 50, 23);
each([[24, 18], [24, 19], [24, 22], [24, 23], [36, 18], [36, 19], [36, 22], [36, 23]], (x, y) => d.wall(x, y)); // the crossing's piers
each([[13, 18], [17, 18], [21, 18], [39, 18], [43, 18], [47, 18]], (x, y) => d.put(x, y, 'Knight Statue'));
d.put(10, 23, 'Urns'); d.put(50, 23, 'Urns'); d.put(11, 23, 'Bones');
d.put(25, 18, 'Brazier'); d.put(35, 18, 'Brazier'); d.put(25, 23, 'Brazier'); d.put(35, 23, 'Brazier'); // the crossing, lit
d.put(14, 21, 'Ghost'); d.put(46, 21, 'Ghost');

// ---------------------------------------------------------------- the nave (tier 2): the floor has sunk
d.floor(20, 25, 40, 40);
d.door(22, 24); d.door(30, 24); d.door(38, 24);
for (const y of [26, 29, 32, 35, 38]) { d.wall(24, y); d.wall(36, y); } // the arcades
d.water(25, 26, 28, 37); d.water(32, 26, 35, 37);
d.tile(28, 31, 'CB'); d.tile(27, 31, 'CB'); d.put(27, 31, 'Gold');      // what is left of a pew platform
d.tile(32, 34, 'CB'); d.tile(33, 34, 'CB'); d.put(33, 34, 'Gold');
for (const y of [38, 39]) for (const x of [25, 26, 27, 28, 32, 33, 34, 35]) d.put(x, y, 'Chair'); // the last dry pews
d.put(29, 25, 'Brazier'); d.put(31, 25, 'Brazier');
d.put(20, 27, 'Bones'); d.put(40, 37, 'Bones');
d.put(21, 33, 'Ghost'); d.put(39, 30, 'Ghost'); d.put(26, 29, 'Ghost'); d.put(34, 35, 'Ghost');

// the cloister (west): a walk round the flooded garth, and the well of souls on its island
d.floor(4, 25, 18, 40); d.fill(4, 25, 5, 25); d.fill(4, 26);            // a fallen corner
d.door(14, 24); d.door(19, 33);
d.water(8, 29, 14, 36); d.tile(11, 32, 'ZZ'); d.tile(11, 33, 'ZZ'); d.put(11, 33, 'Ghost Spawner'); d.island(11, 32); d.island(11, 33);
each([[5, 28], [6, 28], [5, 29], [16, 38], [17, 38], [17, 39], [6, 34]], (x, y) => d.tile(x, y, 'ZZ'));
d.put(5, 28, 'Mushroom'); d.put(6, 28, 'Mushroom'); d.put(16, 38, 'Mushroom'); d.put(17, 39, 'Mushroom');
d.put(16, 27, 'Dead Tree'); d.put(6, 38, 'Dead Tree');
d.put(4, 40, 'Bones'); d.put(18, 25, 'Bones'); d.put(4, 31, 'Silver');
// the cloister's arcade: piers on the walk at the water's edge (cover from whatever drifts over the garth)
for (const y of [29, 31, 33, 35]) { d.wall(7, y); d.wall(15, y); }
for (const x of [9, 11, 13]) { d.wall(x, 28); d.wall(x, 37); }
d.put(6, 36, 'Ghost'); d.put(12, 30, 'Ghost');
d.tile(15, 41, 'SL'); d.put(15, 41, 'Rocks');                           // a collapsed stair down to the bell tower

// the undercroft (east): the chantry's cellar
d.floor(42, 25, 56, 40);
d.door(46, 24); d.door(41, 33); d.door(44, 41);
each([[46, 29], [51, 29], [46, 36], [51, 36]], (x, y) => d.wall(x, y));
for (const x of [54, 55, 56]) { d.wall(x, 30); d.wall(x, 35); }         // three bays on the east wall
each([[54, 25], [55, 25], [56, 25], [56, 26], [53, 31], [56, 34], [54, 40], [55, 40], [56, 40], [42, 25], [42, 26]], (x, y) => d.put(x, y, 'Barrel'));
each([[54, 31], [55, 31], [42, 40], [43, 40]], (x, y) => d.put(x, y, 'Crate'));
d.put(55, 26, 'Wine'); d.put(56, 33, 'Wine'); d.put(56, 39, 'Aged Wine'); d.put(55, 32, 'Silver');
d.put(48, 27, 'Ghost'); d.put(54, 37, 'Ghost');

// ---------------------------------------------------------------- the west front (tier 1)
d.floor(20, 42, 40, 46);
d.door(22, 41); d.door(30, 41); d.door(38, 41);
d.put(30, 46, 'Dungeon Exit');
d.put(28, 43, 'Birdbath'); d.put(32, 43, 'Birdbath');                   // the holy water stoups
d.put(20, 42, 'Brazier'); d.put(40, 42, 'Brazier'); d.put(21, 46, 'Bones');

d.floor(13, 42, 18, 46); d.door(19, 44);                                // the bell tower
d.put(13, 42, 'Crate'); d.put(13, 43, 'Crate'); d.put(18, 46, 'Barrel');
d.put(14, 46, 'Silver'); d.put(17, 42, 'Silver'); d.put(15, 43, 'Ghost');

d.floor(42, 42, 47, 46); d.door(41, 44);                                // the sacristy
d.put(43, 42, 'Oak Table'); d.put(46, 42, 'Wine'); d.put(47, 43, 'Wine');
d.put(47, 46, 'Barrel'); d.put(46, 46, 'Barrel'); d.put(42, 46, 'Stone Urn');
d.put(45, 44, 'Ghost');

d.build();
console.log(d.print());
console.log(JSON.stringify(d.counts()));
console.log('needs mining:', d.needsMining.join(', ') || 'nothing');
if (process.argv.includes('--write')) console.log('written', d.write());
