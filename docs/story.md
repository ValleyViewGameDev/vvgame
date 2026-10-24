# Story rules: Secrets of Elsinore

Read this before writing any character, quest, trade, hint, region or storyline. It holds the
owner's rules for the game's story (2026-10-16): WHAT the story is. HOW the text sounds (the
deliberately Shakespearean direction of 2026-10-24, the voice by surface, quoting, plain
language, each character's voice card) is `narrative-style.md`; the plan to re-voice the whole
game is `narrative-pass.md`. Gameplay tuning lives in `tuning.md`, the Citizens' behaviour in
`citizens.md`, and the world's geography in `making-original-grids.md`.

## 0. The tale (being rewritten)

Owner, 2026-10-24: the world's premise is **a storm of stories** (Prospero's tempest tore every
play's people out of their tales and cast them up on Elsinore's shore), and **Prospero is the
antagonist**, the reason the land is broken and the Quest for Hope exists; he is defeated, not
killed. Gertrude is Leontes' queen, turned to a statue by the storm and woken as a mid-game
milestone. The full draft (the wrong, the storm, the statue, the Oracle's prophecy, the
player as the one with no part written, the ending) is in `narrative-pass.md` P1.1 and moves
here once approved. Until then the old intro (string 16019) is out of date.

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

The voice rules live in `narrative-style.md` (2026-10-24): deliberately Shakespearean, quotes
and fragments of real lines woven in, whimsical and plain enough for anyone, leaning on the
comedies and tragedies. In short: the more a text is a character speaking, the more flavour it
carries; instructions stay plain. Riddles point to a place and a person, never to a menu. No
em-dashes in player copy (repo rule). Every string goes into all 10 languages.

## 3. How story becomes gameplay

- **Gates are story objects.** Doors and barriers can require any item (`requires` on a
  resource with `action: door`). The game has enough keys (Town, Golden, Dungeon, Mirror,
  Skeleton). New gates should be things with a story (a bough, a song, a seal), earned from a
  character.
- **Relationships are the currency of trust, from the mid game.** Big gifts sit behind a quest or
  trade `rel` / `relscore` (friend, love, married, 90+). Secrets in particular are only told to
  people a character trusts. **Not in the FTUE or the early game (L1-15; owner, 2026-10-24):**
  building a friendship is grindy, so nothing a player needs before L16 asks for more than a
  Greet (a quest list opens at relationship score 10, which one Greet gives). Secrets therefore
  sit at L16 and up (Titania's moved from L15).
- **Secrets travel.** A character's Secret is an item: who it is sold to, and why, is a story
  (Portia's Secret buys the Brass Bell from Iago, whom she despises; Leontes collects six).
- **Milestone dialogs are clues the player keeps.** A character's `dialogOnMet` /
  `dialogOnFriend` / `dialogOnLove` / `dialogOnMarried` / `dialogOnRival` (RelationshipMatrix,
  strings 16xxx) play once, as a StoryModal, when the relationship first reaches that status. The
  NPC panel's **Clues** button (`GameFeatures/NPCs/CluesModal.js`) lists every one the player has
  been shown, the "when you met" story first, so a hint can be re-read; the server records each
  in the relationship's `clues` and keeps it even if the status is later lost. Write these as
  the place to leave a hint the player will need later.
- **The QUEST FOR HOPE editor tab** shows every route to the seven artifacts with its gates.
  Check it after changing a quest, trade, door or layout on the spine.

## 4. The spine: the Quest for Hope

The Oracle (fittingly, from The Winter's Tale: Apollo's oracle at Delphos, whose sealed scroll at Hermione's trial says the king will live without an heir "if that which is lost be not found"; the owner grounded her in it on 2026-10-23, option 1 of the rearrangement question, so she stays on top of the spine and speaks as Apollo's voice, strings 16018/16118) trades Hope for seven artifacts: Prospero's Orb,
King's Crown, Trident, Brass Bell, Phoenix Feather, Vampire's Blood, Brief Candle (the Brief
Candle replaced the Scroll, a common drop, on 2026-10-19; see §6). Prospero's Orb is
meant as the penultimate step of the whole game; the last is bringing all seven to the Oracle.
The Quest for Hope sits pinned at the top of the To Do list from the first day, as the long
aspiration (2026-10-17; it replaced the auto-completed "Find the Wizard in the Valley" quest).
Prospero gives his Orb for solving a puzzle (a minigame offer, `traders.json minigame`); today a
stub riddle, the real puzzle is still to be designed.

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
| Titania | A Midsummer Night's Dream | Quests; Titania's Secret (kill Dragons); "Let Hell Gape Wide" (Demons, L28) points to Acheron |
| Prospero | The Tempest | **The antagonist** (2026-10-24): his storm of stories broke the land; the Orb, on Prospero's Peak behind Cloven Pines and dragons; defeated, not killed (§0) |
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
| The Oracle | The Winter's Tale (Apollo's oracle at Delphos) | Trades Hope for the seven artifacts; her home is the **Oracle's Sanctuary** (the `Shiro` row, a dev-placed shop in the valley; players read "Oracle's Sanctuary" through `DISPLAY_ALIASES` in `Utils/stringLookup.js`), where sealed scrolls are bought with gems; the Ancient Temple opens them, as in the play |
| The Vampire | original | The Vampire's Blood (Zombies) |
| Santa Claus | original (seasonal) | Seasonal quests |
| Hecate | Macbeth | Toil and Trouble (the axe for the Cloven Pines); Hecate's Torch (through the Black Fog) |
| Cerberus | myth, named in Love's Labour's Lost | The three-headed hound at the bottom of Acheron; guards the Brief Candle |
| The Great Bear | The Winter's Tale ("Exit, pursued by a bear") | Guards the road to Leontes' castle in Belmont, where the King's Crown waits (the first artifact, about L10) |

Regions are named the same way (Dunsinane, Birnam Wood, Inverness, Illyria, Messina, Belmont,
Mantua, Navarre, Harfleur, the Forest of Arden, Yorick's Hollow, Sycorax Fen, Setebos Rise,
Caliban's Crossing, Prospero's Peak, Lethe Wharf, ...), mixed with originals.

## 6. Threads proposed, not built

- **Toil and Trouble: Prospero's gate (BUILT 2026-10-16).** Hecate lives on valley 1011257 (a
  moss peninsula in a dark lake, a dead-tree shore with bones, five Ghosts); four Cloven Pines
  fill the old Mirror doorway into Prospero's hall on 1013320 (the Mirror now guards only
  Leontes' castle, in front of the Phoenix's dungeon). Hecate's art is a copy of the
  Shepherd's for now (npc-hecate.svg); the Cloven Pine is the pine recoloured violet.
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
  - *The skull.* **Caliban** (The Tempest) dug it up out of Yorick's Hollow and trades it for
    **52 Bones**: a new Caliban trade beside his Silver ones. The easter egg: Shakespeare died at
    52, and his gravestone curses whoever moves his bones ("And cursed be he that moves my
    bones"). Caliban is also the one who knows Prospero's mountain, so his line can point the
    player to Hecate.
  - *Chain.* 52 Bones to Caliban for Yorick's Skull, then Toil and Trouble from Hecate, then the
    Cloven Pines fall and Prospero gives the Orb. Three plays, no new key.
  - *Build notes.* New rows: Cloven Pine (source, convertTo Wood, `requires: Toil and
    Trouble`), Toil and Trouble (skill, no shop), Hecate (trade or quest NPC, art), Yorick's
    Skull (special); a Caliban trade (52 Bones for the Skull). Code: a trade or quest reward that grants a skill
    (none does today; skills are only bought at a shop). Layout: Cloven Pines in place of the
    Mirror door on 1013320; Hecate on a Birnam Wood grid. Art: the recoloured pine, Hecate;
    atlas rebuild. The QUEST FOR HOPE tab must learn that a tree needing a skill nobody starts
    with is a gate (it treats trees as clearable today).

- **The Brief Candle: the Pit of Acheron (data and the Pit layout BUILT 2026-10-19; the rest of
  Acheron is World-epic work).** Acheron is the region of lava south-east of the King's Circle.
  Demons are hard; this thread is why a player wants to fight them.
  - *The artifact.* **The Brief Candle** (Macbeth: "Out, out, brief candle!"), re-aimed: the one
    light that never went out, still burning at the very bottom of Acheron. Hope as a flame in
    the dark. It replaced the Scroll in the Oracle's seven (the Scroll is a common drop and was
    no journey). It lies on an altar, picked up off the board like the King's Crown: it comes
    from Acheron itself, not from a character.
  - *The guardian.* **Cerberus**, the three-headed hound of the underworld's gate (Love's
    Labour's Lost: "whose club killed Cerberus, that three-headed canis"; Navarre, that play's
    region, borders Acheron; in myth he is Hecate's hound). A boss fitted by docs/tuning.md §5d:
    home level 34, three quick bites (a bite every 0.9 s), melee, cannot cross lava.
  - *Hecate's step.* The Pit is walled by **Black Fog** (Oberon in the Dream: a fog "as black as
    Acheron"; in Macbeth Hecate's meeting place is "the pit of Acheron"). Only **Hecate's Torch**
    passes it (in myth Hecate carries the torches through the underworld). She gives the Torch
    for **12 Scorpions and 10 Bones** (Macbeth again: "O, full of scorpions is my mind"). No
    relationship gate beyond knowing her (she already gave Toil and Trouble at friend, L30).
  - *Scorpions.* Demons drop a **Scorpion** (their Spawners still drop Silver). It sells well
    (3,500 to 5,000, about twice a Silver) and is never bought with gems, so the Torch and
    Acheron's own gear (Ashen Plate, Demonbane, Charon's Obol, now priced in Scorpions) always
    mean fighting Demons. Scorpions farmed in a dungeon only buy the Torch; the Torch only opens
    a door at the bottom of Acheron, so the Candle always means the whole descent.
  - *The Pit* (valley 1014571, built). A lava lake; the only way in is the slate bridge from
    1014561, walled by two Black Fog doors. Beyond: an antechamber, a 2-wide rock walkway that
    winds across the lava past six Demons waiting on the rock, a 2-wide neck, and the altar
    chamber where Cerberus guards the Candle in a stone niche. Players can walk on lava (it only
    burns, 2 hp a second), so every lava tile touching the rock carries an Invisible Wall: the
    rock is the only ground and the fog the only way in.
  - *Order.* Hecate's two gifts make her the late-game witch thread: the axe (Toil and Trouble,
    L30), then the Torch and the Candle (Acheron, around L32 to 36), and Prospero's Orb last.
  - *Still to build (World epic).* The rest of Acheron as the descent toward 1014571: the shop
    town at 1014554 as the staging post (add a healer), outer lava grids with single Demons,
    middle grids with Demon Spawners, and the approach through 1014561. Art for Cerberus, the
    Candle, the Torch and the fog uses emoji for now (🐕 🕯️ 🔥 🌫️; the Scorpion is 🦂).

