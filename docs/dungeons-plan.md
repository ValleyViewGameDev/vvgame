# Dungeons d006 to d010: the plan

Started 2026-11-11 (backlog W-12). Five new dungeon templates in
`game-server/layouts/gridLayouts/dungeon/`, outside the Oracle's story: resetting, grindable
maps for players who like to fight. Entrances in the valley are a later pass.

**Status.** d006_ghosts is built (a first draft for the owner to look at). d007 to d010 are
plans only.

## What the existing five teach

- **d001_Large**: the whole 64 x 64 as a keep of rectangular rooms, every enemy, the richest
  loot (43 Gold, 3 Diamond Rings, a Gem). The kitchen sink.
- **d002_TownCellar**: small, one-tile corridors, Rocks to mine through, a few Spiders.
- **d003_Zombie**: two-tile corridors and small rooms, Ghosts and their Spawners, mushrooms on moss.
- **d004_bears**: an outdoor cave of trees and mountains, Bears on dirt, a walled den.
- **d005_Phoenix**: a one-tile maze with lava halls and the Phoenix at its heart.

Conventions kept: Stone Walls one tile thick on cobblestone, the bare `DU` tile as the void,
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

Borrowed from tabletop dungeon craft: loops instead of a line (more than one way to every
tier, so a player can double back), a choice at the door (two or three ways on from the first
room), a centrepiece room the rest is built round, shortcuts that reward a tool or a key, and
the five-room beat (a guarded way in, a room that is not a fight, a setback, a climax, a
reward).

- **Tiers.** Each dungeon is three or four tiers, easiest by the exit. Every tier ends at
  doors, so a player takes what they can and walks out.
- **Loot rises with the tier** and the best piece sits at the far end.
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

### d006_ghosts: the Drowned Chantry (BUILT)

A cruciform chapel whose nave has sunk into the water, with its cloister, its cellar and the
abbots' crypt ringed round the chancel. Ghosts cross water and the player does not, so the
flooded nave is the centrepiece: the middle causeway is the quick way and the exposed one
(Ghosts hang over the water out of a sword's reach), the two side aisles are slower with
arcades for cover. Picture: `docs/dungeons/d006_ghosts.png`.

- **Tier 1, the west front:** the narthex (the exit, no enemy), the bell tower and the
  sacristy (one Ghost each; Silver, Wine).
- **Tier 2:** the nave (four Ghosts, two over water; Gold on two drowned pew platforms), the
  cloister (a walk round the flooded garth; the well of souls on its island is a Ghost
  Spawner no one can reach; mushrooms), the undercroft (the cellar: Wine, Aged Wine).
- **Tier 3:** the transepts, the chancel behind the rood screen (the altar plate), the ossuary
  and the scriptorium (Bones, Scrolls).
- **Tier 4:** the ambulatory, a crypt ring round the chancel with burial niches, and the
  Sepulchre of the Abbots, entered only from the north: three Ghosts, a second Spawner, Gold
  and the Book.
- **Loops:** five doors leave the narthex. West: bell tower, cloister, west transept, ossuary,
  ring. East: sacristy, undercroft, east transept, scriptorium, ring. A fall of rock between
  the cloister and the bell tower is a way out for a player with a pick.
- **Counts:** 21 Ghosts, 2 Spawners, 21 Dungeon Doors. Loot: Bones 16, Silver 6, Gold 5,
  Urns 5, Wine 4, Scroll 4, Mushroom 6, Magic Mushroom 1, Aged Wine 1, Book 1. No Gems.

### d007_BearGarden (plan)

The baiting pit of the old playhouse quarter. A round dirt arena, a gallery ringing it, the
kennels and cages opening off the gallery. Arena Doors throughout, so it needs no key and a
player below L12 can come. Tier 1 the kennels (Coyote packs of three). Tier 2 the cages
(Bears, one at a time, each cage also opens onto the pit). Tier 3 the pit itself: two Bears
and the Great Bear at the stake, optional. The gallery is the loop: every door is a way back
to the exit. Loot: Honey, Bones, a little Silver, one Gold in the keeper's lodge, one Scroll
under the stake. Ten minutes, in and out.

### d008_SpiderMine (plan)

An abandoned silver mine, drawn as tunnels and not rooms. One adit goes down in switchbacks
through three galleries. Tier 1: single Spiders in one-tile workings. Tier 2: web halls with
packs of three or four, and falls of rock: some hide Silver pockets, one opens a loop straight
back to the adit. Tier 3: the brood chamber with a Spider Spawner, and the flooded sump where
two Zombies (the lost shift) guard the best of it. The long cart run is the trap: a straight
line where Spiders spit from three tiles. Loot: Silver in the veins, Thread from the kills,
two Gold and a Scroll at the bottom.

### d009_VulcansStithy (plan)

"As foul as Vulcan's stithy." A forge on a lake of lava: stone islands joined by causeways.
Crossing the lava is always possible and always costs. Tier 1 the slag yards (Ogres, one at a
time, among heaps that break their leap). Tier 2 the bellows hall (Ogres between anvil
pillars, Demons on the gantry). Tier 3 the lake: Demons stand out on the lava and shoot seven
tiles; the causeways zigzag between cover. Tier 4 the Crucible, a Demon Spawner on its own
islet. A vault behind Black Fog (Hecate's Torch) holds the best loot; a Locked Door (Golden
Key) is the short way home. Loot: Gold, Silver, Scrolls, Urns, one Potion B. No Gems.

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
doors, props, enemies, loot by coordinate), walls are raised round it, and it is checked
before it is written: every key exists, each thing stands on a tile its `validon` flag
allows, multi-tile props have room, no floor touches the void, and every piece of loot, door
and enemy can be reached on foot from the exit (what needs a pick is listed).

```
node tools/dungeons/d006_ghosts.js            # print the map and the counts
node tools/dungeons/d006_ghosts.js --write    # write the layout file
python3 tools/dungeons/preview.py d006_ghosts # docs/dungeons/d006_ghosts.png
```

A script is a one-way first draft. Once a dungeon is edited in the VVGame Editor (Layouts,
`dungeon`), the layout file is the truth and its script is history: do not run `--write`
again without the owner asking.
