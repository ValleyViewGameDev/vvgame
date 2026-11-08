# The deco pass (BL-18): DONE 2026-11-08. The record of what shipped is docs/art/deco.md (passes A, B1-B4; B5 furniture skipped; walls parked in BL-22).

# The deco pass (BL-18): plan for the owner's greenlight (2026-11-08)

Three jobs in one pass: (A) every deco row that still draws an emoji is drawn or cut,
(B) the catalogue grows with Shakespearean-era sets (castle, village homes, greenery, art,
furniture), (C) the Deco panel gets groups so 90 rows stay browsable. Rules and pipeline
are docs/art/deco.md (square-on camera, the barrel as the camera reference, silhouette cut,
the pricing ladder) and docs/walls.md for anything that joins up. Live counts below come
from `game-server/scripts/count-deco-usage.js` (read-only) on 2026-11-08.

## A. The fifteen emoji rows

| Row | On live grids | Decision | Why |
|---|---|---|---|
| Stack of Books | 31 grids (valley story layouts 75, homesteads 5) | DRAW, 1 x 1 | a story prop in two valleys; a leaning pile of leather tomes |
| Chair | 30 grids | DRAW as a Tudor oak chair | furniture set; the current 🪑 is a modern dining chair |
| Bed | 31 grids (town templates 55) | DRAW as a canopied bed, 1 x 1 row with artSpan ~1.4 | the town buildings' interiors use it |
| Harp | 3 grids | DRAW | period instrument; belongs in the castle set |
| Black Fog | 57 on valley2 (the Hope story) | DRAW as a dark mist block | a story barrier; needs to read as impassable fog, not an emoji cloud |
| Holiday Tree | NONE placed | your call: DRAW as the one seasonal piece, or CUT until a winter set | 5,000 Gold, 2 x 2, nobody has bought one |
| Toilet | 2 placed | CUT | out of period and out of tone |
| Teddy Bear | 3 placed | CUT | out of period |
| Slide | 3 placed (2 x 2, 15,000) | CUT | a modern playground piece |
| White Dove | NONE | CUT | birds belong to BL-17 |
| Green Wall | NONE | CUT; its job goes to the new HEDGE wall set | |
| Black Wall | 232 on one homestead, 45 on the valley2 template | KEEP as a system "void" block: a flat near-black stone drawn with a faint edge, no joining | a level-design blocker in the story valley |
| Blue Wall | 8 on valley1 | CUT; the layout uses water tiles instead | |
| Orange Wall | 37 on one homestead | CUT; the castle wall set replaces it | |
| Sand Wall | 17 on the valley3 template | CUT; replace with the sandstone wall set below or a cactus hedge | |
| Invisible Wall | 228 in dungeons | KEEP, no art by design; make it dev-only in the catalogue (it is buyable for 1 Gold today) | |

Cut means: remove the row, and a script that deletes the standing ones from live grids
(refund to the owner where it was bought: Toilet, Teddy Bear, Slide, Orange Wall on a
homestead) before the deploy, the way `remove-animal-stalls.js` did.

## B. New sets

Each set is one `tools/art/jobs/deco-<set>.json`, one prop per generation on magenta with
the barrel as the camera reference, cut with the silhouette fit, presented on grass and dirt
with names, nothing shipped unapproved. Wall sets go through the walls pipeline (seven
pieces, docs/walls.md). Prices follow the ladder: small props 25 to 100 Gold, furniture 200
to 2,000, garden pieces 1,000 to 10,000, statuary 2,000 to 7,500, buildings 10,000 to 40,000.

### B1. Castle (8 pieces + 1 wall set)
| Prop | Size | Note |
|---|---|---|
| Castle Wall | wall set `castle` | crenellated grey stone, taller than the stone wall, towers at ends and corners (the walls pipeline) |
| Round Tower | 2 x 2, artSpan ~3 | a drum tower with a conical slate roof and a pennant |
| Gatehouse | 3 x 2, artSpan ~3.5 | twin towers over an arch with a raised portcullis; impassable, a set piece |
| Heraldic Banner | 1 x 1, tall | a red and gold banner on a pole |
| Brazier | 1 x 1 | an iron basket with a fire (a lit prop, pairs with the lava bubbles' glow later) |
| Cannon | 1 x 1 | a bronze Tudor cannon on a wooden carriage |
| Knight Statue | 1 x 2 | an armoured knight on a plinth (statuary ladder, 5,000) |
| Throne | 1 x 1 | gilded oak on a dais |

### B2. Village homes and yard (8 pieces)
| Prop | Size | Note |
|---|---|---|
| Timber Cottage | 2 x 2 | half-timbered, tiled roof: a deco home with no function (the Farm House is the player's) |
| Thatched Cottage | 2 x 2 | whitewashed walls, thatch, a chimney |
| Stone Well | 1 x 1 | a round well with a windlass roof |
| Woodpile | 1 x 1 | split logs stacked under a lean-to |
| Hand Cart | 1 x 1, wide | a two-wheeled cart with sacks |
| Lantern Post | 1 x 1, tall | an iron lantern on a wooden post (a lit prop) |
| Market Stall | 2 x 1 | a striped-awning stall with goods |
| Dovecote | 1 x 1, tall | a white dovecote on a post (the White Dove's replacement) |

### B3. Flowers and greenery (6 pieces + 1 wall set)
| Prop | Size | Note |
|---|---|---|
| Hedge | wall set `hedge` | a clipped box hedge that joins up: the Green Wall's replacement and the garden's edge |
| Rose Bush | 1 x 1 | red roses on a round bush |
| Lavender | 1 x 1 | a purple clump |
| Topiary Ball | 1 x 1 | a clipped sphere in a stone pot |
| Topiary Cone | 1 x 1, tall | a clipped cone |
| Ivy Trellis | 1 x 1, tall | a wooden lattice with climbing ivy |
| Wildflower Patch | 1 x 1, passable | mixed meadow flowers, loose |

### B4. Art pieces (5)
| Prop | Size | Note |
|---|---|---|
| Sundial | 1 x 1 | a brass dial on a stone pedestal |
| Gargoyle | 1 x 1 | a crouched stone gargoyle on a short column |
| Stone Urn | 1 x 1 | a classical urn on a plinth |
| Obelisk | 1 x 2 | a slim stone obelisk |
| Maypole | 1 x 2 | a ribboned pole (festive, pairs with the Carnival) |

### B5. Furniture (8, plus the Chair, Bed, Stack of Books and Harp from A)
| Prop | Size | Note |
|---|---|---|
| Oak Table | 1 x 1 | a trestle table with a cloth |
| Bench | 1 x 1, wide | a plain oak bench |
| Bookshelf | 1 x 1, tall | leather spines, a candle on top |
| Chest | 1 x 1 | an iron-banded treasure chest, closed |
| Candelabra | 1 x 1, tall | a three-branch iron candelabra (lit) |
| Rug | 2 x 2, passable | a red woven rug with a gold border (drawn flat; the first passable floor deco) |
| Tapestry | 1 x 1, tall | a hanging with a unicorn (it reads on a wall tile) |
| Writing Desk | 1 x 1 | a slanted desk with quill and inkpot |

That is 35 new props, 4 redraws, 2 wall sets: about 45 generations plus the two wall
pipelines, in five sheets, each approved on its own.

## C. The Deco panel

With ~85 rows the catalogue needs groups. A `decoGroup` column on the row (ECONOMY sheet):
`garden`, `furniture`, `statuary`, `castle`, `village`, `walls`, `farm`, and the Buy Deco
panel shows one section per group in that order, the existing rows assigned as part of A.

## Order

1. A: draw the five, cut the seven (with the live-grid script), the two keeps.
2. C: groups, so the new sets land in sections.
3. B1 castle, B2 village, B3 greenery, B4 art, B5 furniture: one sheet at a time, each
   presented for approval before the next is generated.
