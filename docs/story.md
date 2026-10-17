# Story rules: Secrets of Elsinore

Read this before writing any character, quest, trade, hint, region or storyline. It holds the
owner's rules for the game's story (2026-10-16). Gameplay tuning lives in `tuning.md`, the
Citizens' behaviour in `citizens.md`, and the world's geography in `making-original-grids.md`.

## 1. The rule: a mash-up, not an adaptation

Secrets of Elsinore is one big story where characters from many Shakespeare plays live in the
same valley, meet, want things from each other and keep each other's secrets. Original
characters and storylines sit alongside them. The fun is the mix and match.

- **Cross the plays.** A good thread joins characters or ideas from at least two plays (or a
  play and an original thread). Cassio (Othello) wanting Duke Angelo (Measure for Measure) dead
  for Juliet's sake (Romeo and Juliet) is the model.
- **Don't be literal.** Never re-enact a play's plot beat for beat, and avoid pairing a
  character with their own play's obvious counterpart for the main beat (Prospero + Ariel +
  Caliban telling The Tempest again is too literal). A character's own play can supply flavour,
  not the whole plot.
- **Borrow the nature, not the script.** Keep what makes a character recognisable (Falstaff's
  sack and bluster, Iago's scheming, Caliban's grudges and his log-hauling, Portia's law,
  Titania's pride) and put it to work in a new situation.
- **Famous lines and objects are fair game,** re-aimed: a prophecy, a skull, a ring, a potion,
  a moving wood. They make the best gates, rewards and hints.
- **No on-the-nose modern names.** A name that reads first as a film or brand character is out
  (Ariel reads as Disney; "the Mermaid" became Viola, 2026-10-16).
- **Original characters are welcome** (the Vampire, the Oracle's quest, Santa for the season),
  as long as they live in the same world and talk to the Shakespeare cast.

## 2. Voice

- Hints and NPC lines carry a light Shakespearean flavour (thee, inversion, a turned phrase),
  short enough for a phone. Riddles point to a place and a person, never to a menu.
- No em-dashes in player copy (repo rule). Every string goes into all 10 languages.

## 3. How story becomes gameplay

- **Gates are story objects.** Doors and barriers can require any item (`requires` on a
  resource with `action: door`). The game has enough keys (Town, Golden, Dungeon, Mirror,
  Skeleton). New gates should be things with a story (a bough, a song, a seal), earned from a
  character.
- **Relationships are the currency of trust.** Big gifts sit behind a quest or trade `rel` /
  `relscore` (friend, love, married, 90+). Secrets in particular are only told to people a
  character trusts.
- **Secrets travel.** A character's Secret is an item: who it is sold to, and why, is a story
  (Portia's Secret buys the Brass Bell from Iago, whom she despises; Leontes collects six).
- **The QUEST FOR HOPE editor tab** shows every route to the seven artifacts with its gates.
  Check it after changing a quest, trade, door or layout on the spine.

## 4. The spine: the Quest for Hope

The Oracle (fittingly, from The Winter's Tale) trades Hope for seven artifacts: Prospero's Orb,
King's Crown, Trident, Brass Bell, Phoenix Feather, Vampire's Blood, Scroll. Prospero's Orb is
meant as the penultimate step of the whole game; the last is bringing all seven to the Oracle.

## 5. The cast (where each comes from)

| Character | Play / origin | In the game |
|---|---|---|
| Kent | King Lear | Kent's orders (the board's buyer) |
| Portia | The Merchant of Venice | Quests on law, schools, health; Portia's Secret |
| The Shepherd | The Winter's Tale | First quests, farming |
| Hotspur | Henry IV Part 1 | Early combat and weapons quests |
| Cassio | Othello | Combat quests; the Skeleton Key (kill Duke Angelo) |
| Mistress Quickly | Henry IV / The Merry Wives of Windsor | Quests |
| Feste | Twelfth Night | Crafting quests |
| Helena | A Midsummer Night's Dream | The Golden Key (Feverfew) |
| Titania | A Midsummer Night's Dream | Quests; Titania's Secret (kill Dragons) |
| Prospero | The Tempest | The Orb, in his mountain home |
| Caliban | The Tempest | Trader; Caliban's Secret |
| Constable Elbow | Measure for Measure | Town and Dungeon Keys |
| Duke Angelo | Measure for Measure | An enemy (Cassio's target) |
| Snug | A Midsummer Night's Dream | Travel companion |
| Falstaff | Henry IV / The Merry Wives of Windsor | Trader (Feverfew for Port, Brandy) |
| Apothecary | Romeo and Juliet | Potions |
| Iago | Othello | Trader; the Brass Bell |
| Gertrude | Hamlet | Trader; Gertrude's Secret |
| Leontes | The Winter's Tale | The Mirror Key, for six secrets |
| Juliet | Romeo and Juliet | Trader; Juliet's Secret |
| Viola (was the Mermaid) | Twelfth Night | Trader who lives in the water (shipwrecked, she took to the sea); Viola's Secret |
| The Oracle | The Winter's Tale | Trades Hope for the seven artifacts |
| The Vampire | original | The Vampire's Blood (Zombies) |
| Santa Claus | original (seasonal) | Seasonal quests |

Regions are named the same way (Dunsinane, Birnam Wood, Inverness, Illyria, Messina, Belmont,
Mantua, Navarre, Harfleur, the Forest of Arden, Yorick's Hollow, Sycorax Fen, Setebos Rise,
Caliban's Crossing, Prospero's Peak, Lethe Wharf, ...), mixed with originals.

## 6. Threads proposed, not built

- **Toil and Trouble: Prospero's gate (proposed 2026-10-16, not agreed; replaces "the wood
  that walks", since Birnam Wood is already a region).**
  - *The gate.* Prospero's home on Prospero's Peak (valley 1013320) is ringed by **Cloven
    Pines** instead of the Mirror door: a new tree (Pine Tree's look, recoloured; the cloven
    pine is The Tempest's prison tree, here walling Prospero in) that only a magic axe can fell.
    It is an ordinary tree resource with `requires: Toil and Trouble`, the way Pine Tree
    requires Better Axe. The Mirror is left for Leontes' castle and the Phoenix's dungeon.
  - *The skill.* **Toil and Trouble**, a witch-forged axe (the Weird Sisters' chant, "Double,
    double toil and trouble"): the third axe after Axe and Better Axe, sold in no shop.
  - *The giver.* **Hecate** (Macbeth), queen of the witches, who has left the heath and keeps
    her cauldron deep in Birnam Wood. She forges the axe in her cauldron, and the cauldron
    wants something precious: **Yorick's Skull** (Hamlet), plus ordinary witch-stuff (Bones,
    Magic Mushroom). Gate: friend of Hecate, level 30+ (an endgame step).
  - *The skull.* **Caliban** (The Tempest) dug it up out of Yorick's Hollow and will part with
    it, he who would do anything for a drink, for **Falstaff's Sack** (Henry IV), which
    Falstaff gives only to a friend. Caliban is also the one who knows Prospero's mountain,
    so his line can point the player to Hecate. (Shorter variant: drop Falstaff; Caliban
    takes Ancient Coins, as he does for his Secret.)
  - *Chain.* Falstaff's Sack, then Yorick's Skull from Caliban, then Toil and Trouble from
    Hecate, then the Cloven Pines fall and Prospero gives the Orb. Four plays, no new key.
  - *Build notes.* New rows: Cloven Pine (source, convertTo Wood, `requires: Toil and
    Trouble`), Toil and Trouble (skill, no shop), Hecate (trade or quest NPC, art), Yorick's
    Skull and Falstaff's Sack (specials). Code: a trade or quest reward that grants a skill
    (none does today; skills are only bought at a shop). Layout: Cloven Pines in place of the
    Mirror door on 1013320; Hecate on a Birnam Wood grid. Art: the recoloured pine, Hecate;
    atlas rebuild. The QUEST FOR HOPE tab must learn that a tree needing a skill nobody starts
    with is a gate (it treats trees as clearable today).
