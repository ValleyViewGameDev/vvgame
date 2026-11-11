# Dungeons d006 to d010: the plan

Started 2026-11-11 (backlog W-12). Five new dungeon templates in
`game-server/layouts/gridLayouts/dungeon/`, outside the Oracle's story: resetting, grindable
maps for players who like to fight. Entrances in the valley are a later pass.

**Status.** d006_ghosts is built: second draft, redrawn the same day on the owner's notes
(the rules below). d007 to d010 are plans only.

## What the existing five teach

- **d001_Large**: the whole 64 x 64 as a keep of rectangular rooms, every enemy, the richest
  loot (43 Gold, 3 Diamond Rings, a Gem). The kitchen sink.
- **d002_TownCellar**: small, one-tile corridors, Rocks to mine through, a few Spiders.
- **d003_Zombie**: two-tile corridors and small rooms, Ghosts and their Spawners, mushrooms on moss.
- **d004_bears**: an outdoor cave of trees and mountains, Bears on dirt, a walled den.
- **d005_Phoenix**: a one-tile maze with lava halls and the Phoenix at its heart.

Conventions kept: Stone Walls one tile thick on cobblestone, the bare `DU` tile as the rock
outside the walls and nowhere else,
Dungeon Doors between sections, one Dungeon Exit where the player arrives, everything drawn
(a fixed layout spawns nothing by distribution). The recent four are lean on loot; only d001
is rich.

## What a layout can do (the mechanics a scenario is built from)

- **Doors** stop enemies and block sight. A door is a checkpoint: behind it the player is safe
  and can turn back. Dungeon Door needs the Dungeon Key (Elbow, L12); Arena Door needs nothing;
  Locked Door the Golden Key; Mirror the Mirror Key; Black Fog Hecate's Torch.
- **Walls block sight and shots; trees block shots only.** An enemy that cannot see the
  player does not come. Rooms are encounters; pillars are cover.
- **Reach.** A ranged enemy stops at its reach and shoots (Spider 3, Ghost 5, Demon 7,
  Dragon 9). Open ground favours them, corners favour the player.
- **Water** stops the player; Ghosts, Dragons and the Phoenix cross it. **Lava** burns 5 hp a
  second: a shortcut with a price. Ghosts, Demons, Dragons and the Phoenix walk on it.
- **The Ogre leaps** 3 to 10 tiles along a clear line. Pillars and corners break the line.
- **Rocks** are mined: a fall of rock is a shortcut or a side pocket for a player with a pick.
- **Spawners** are invisible and endless, with a cap for the WHOLE grid (Ghost 5, Zombie 10,
  Spider 10, Coyote 6, Bear 6, Demon 5, Dragon 3). While more hand-placed enemies than the cap
  are alive, a spawner sleeps: it is what keeps a cleared dungeon worth staying in.
- **Leash.** An enemy roams 4 tiles round where it stands and settles where it gives up.
- Dungeons reset every 8 hours (`globalTuning.dungeon.phases.open`).

## Design rules for these five

**The owner's rules (2026-11-11, from the review of the first d006).** These come first.

1. **One road.** A dungeon is a story with a start and a deepest room. The player always
   knows which way is on. A stage may have ONE side room, a dead end with something in it;
   no rings, no choice of three doors, no second way round. (The first d006 had five doors
   off the first room and two ways to every tier: too open.)
2. **The dungeon tile (`DU`) is only the rock outside the walls.** Rooms are cobblestone,
   with other tiles for a reason: mud and moss where it is damp, slate for a worn aisle or a
   fall of rock, grass in a garden gone wild.
3. **Furniture has to make sense.** Chairs go with tables (a refectory, a desk). No rows of
   chairs standing for pews.
4. **Statues: Gargoyles and Knight Statues.** The Marble Statue is a garden piece and too
   fine for a dungeon. The same goes for the Birdbath.
5. **Water is organic.** A flood has an uneven edge, mud banks, and ferns growing in it. No
   rectangles of water.
6. **Nothing stands in a doorway.** Both sides of every door are open floor.

Rules 2 and 6 are checked by the drafting kit; the rest are drawn by hand.

Kept from tabletop dungeon craft: a centrepiece room the rest is built round, a side pocket
that rewards a tool (a fall of rock for a player with a pick), and the five-room beat (a
guarded way in, a room that is not a fight, a setback, a climax, a reward).

- **Stages.** Each dungeon is three or four stages along the one road, easiest by the exit.
  Every stage ends at a door, so a player takes what they can and walks back out.
- **Loot rises with the stage** and the best piece sits in the deepest room.
- **Gems: one in all five**, at the end of d010. Diamond Ring: one, also d010.
- **A place, not a diagram.** Each is a building or a cave someone could have made, with
  furniture, damp, rubble and a reason for each room.

## The five

| | Name | Difficulty | Size | Enemies |
|---|---|---|---|---|
| d006 | ghosts: the Drowned Chantry | medium, L17 to 22 | medium | Ghosts |
| d007 | BearGarden | mild, L8 to 12 | small | Coyotes, Bears, the Great Bear |
| d008 | SpiderMine | mild to medium, L12 to 16 | medium | Spiders, a few Zombies |
| d009 | VulcansStithy | hard, L28 to 34 | medium to large | Ogres, Demons |
| d010 | DragonHoard | very hard, L40 and up | large | Ogres, Demons, Dragons |

### d006_ghosts: the Drowned Chantry (BUILT, second draft)

A ruined chantry with the water table in it. Ghosts cross water and the player does not.
One road, from the porch at the south to the abbots' vault behind the high altar, the long
way round. Picture: `docs/dungeons/d006_ghosts.png`.

    porch > nave > crossing and chancel > cloister > scriptorium > ossuary > crypt passage > Sepulchre

- **Stage 1.** The porch (the exit, no enemy). The nave, the centrepiece: the floor has sunk
  and the flood has an uneven edge, mud banks and ferns. The east aisle is the dry way north;
  the west aisle is cut in two (Silver at one end, Urns at the other); a spit of mud runs out
  into the middle with Gold on it, under two Ghosts that hang over the water. Side room: the
  foot of the bell tower (one Ghost, Silver).
- **Stage 2.** The crossing and the chancel (the altar plate; the east transept is a dead
  end). A door in the corner of the west transept goes down to the cloister: a paved walk
  round a garden gone to marsh. The pond has broken through the east walk, so the way is
  north then west, and the Silver in sight from the door is the long way round. The well of
  souls on its island is a Ghost Spawner no one can reach. Side room: the refectory, one long
  table with its chairs, the hearth, the wine.
- **Stage 3.** The scriptorium (four desks, Scrolls), the night stair, the ossuary: the
  charnel heap, a damp corner with mushrooms and a sump.
- **Stage 4.** The crypt passage with its burial niches and a fall of rock, then the
  Sepulchre of the Abbots: the effigies either side of a slate aisle, five Ghosts, a second
  Spawner in the flooded corner, Gold and the Book. Side room: a reliquary walled up behind
  rock (two Gold for a player with a pick).
- **Counts:** 21 Ghosts (3, 5, 6, 7 by stage), 2 Spawners, 9 Dungeon Doors. Loot: Bones 23,
  Silver 8, Gold 6, Urns 6, Scroll 4, Wine 3, Mushroom 6, Magic Mushroom 1, Aged Wine 1,
  Book 1. No Gems.
- **Ferns.** The Fern may not stand on a water tile (its `validon` flags), so a fern "in the
  water" stands on a one-tile hummock of mud with water all round it.

### d007_BearGarden (plan)

The baiting pit of the old playhouse quarter. A round dirt arena, a gallery ringing it, the
kennels and cages opening off the gallery. Arena Doors throughout, so it needs no key and a
player below L12 can come. One road: in by the keeper's gate, along the kennels (Coyote packs
of three), through the cages (Bears, one at a time), and out onto the pit: two Bears and the
Great Bear at the stake. Side room: the keeper's lodge. Loot: Honey, Bones, a little Silver, one Gold in the keeper's lodge, one Scroll
under the stake. Ten minutes, in and out.

### d008_SpiderMine (plan)

An abandoned silver mine, drawn as tunnels and not rooms. One adit goes down in switchbacks
through three galleries. Tier 1: single Spiders in one-tile workings. Tier 2: web halls with
packs of three or four, and falls of rock that hide Silver pockets. Tier 3: the brood chamber with a Spider Spawner, and the flooded sump where
two Zombies (the lost shift) guard the best of it. The long cart run is the trap: a straight
line where Spiders spit from three tiles. Loot: Silver in the veins, Thread from the kills,
two Gold and a Scroll at the bottom.

### d009_VulcansStithy (plan)

"As foul as Vulcan's stithy." A forge on a lake of lava: stone islands joined by causeways.
Crossing the lava is always possible and always costs. Tier 1 the slag yards (Ogres, one at a
time, among heaps that break their leap). Tier 2 the bellows hall (Ogres between anvil
pillars, Demons on the gantry). Tier 3 the lake: Demons stand out on the lava and shoot seven
tiles; the causeways zigzag between cover. Tier 4 the Crucible, a Demon Spawner on its own
islet. A vault behind Black Fog (Hecate's Torch) is the one side room and holds the best loot. Loot: Gold, Silver, Scrolls, Urns, one Potion B. No Gems.

### d010_DragonHoard (plan)

The end of the ladder. The barbican (Ogres), the long gallery (Demons down a hall with
alcoves to duck into), the hatchery (lava nests, Demons and one Dragon), then the Hoard: a
cavern of pillars round a lake, three Dragons and a Dragon Spawner. A Dragon reaches nine
tiles, so the cavern is crossed pillar to pillar; the treasure island is reached by one
narrow stepping causeway the Dragons simply fly over. Each stage ends at a door with a cache,
so a player can stop after any of them. Loot: the most Gold of the five, Scrolls, Aged Wine,
two Potion B, one Diamond Ring, and the only Gem.

## How they are made

`tools/dungeons/lib.js` is a small drafting kit: a dungeon is drawn in code (rooms, water,
doors, props, enemies, loot by coordinate; water, mud and broken outlines as hand-drawn
character stamps), walls are raised round it, and it is checked before it is written: every
key exists, each thing stands on a tile its `validon` flag allows, multi-tile props have
room, no floor touches the void, no room is floored with the dungeon tile, every door has
open floor on both sides, and every piece of loot, door and enemy can be reached on foot
from the exit (what needs a pick is listed).

```
node tools/dungeons/d006_ghosts.js            # print the map and the counts
node tools/dungeons/d006_ghosts.js --write    # write the layout file
python3 tools/dungeons/preview.py d006_ghosts # docs/dungeons/d006_ghosts.png
```

A script is a one-way first draft. Once a dungeon is edited in the VVGame Editor (Layouts,
`dungeon`), the layout file is the truth and its script is history: do not run `--write`
again without the owner asking.
