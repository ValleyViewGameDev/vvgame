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
  (Ariel reads as Disney; "the Mermaid" is to become Viola, 2026-10-16).
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
| The Mermaid (to become Viola) | original, to become Twelfth Night | Trader in the water; the Mermaid's Secret |
| The Oracle | The Winter's Tale | Trades Hope for the seven artifacts |
| The Vampire | original | The Vampire's Blood (Zombies) |
| Santa Claus | original (seasonal) | Seasonal quests |

Regions are named the same way (Dunsinane, Birnam Wood, Inverness, Illyria, Messina, Belmont,
Mantua, Navarre, Harfleur, the Forest of Arden, Yorick's Hollow, Sycorax Fen, Setebos Rise,
Caliban's Crossing, Prospero's Peak, Lethe Wharf, ...), mixed with originals.

## 6. Threads proposed, not built

- **The wood that walks: Prospero's gate (proposed 2026-10-16, not agreed).** Prospero's home
  on Prospero's Peak (valley 1013320) is ringed by Birnam Wood instead of the Mirror door:
  enchanted trees no axe can fell (a door-type resource, `requires: Birnam Bough`). The witches'
  prophecy (Macbeth) says the wood moves only for one who carries a bough of it. Caliban (The
  Tempest), who hauled logs up that mountain for his old master for years and hates him still,
  knows how to cut one, and will, for a drink: Falstaff's Sack (Henry IV), which Falstaff gives
  up only to a friend. Chain: friend of Falstaff, Falstaff's Sack; friend of Caliban, the Birnam
  Bough; the wood parts. Three plays, no new key, and the Mirror is left for Leontes' castle and
  the Phoenix's dungeon only.
