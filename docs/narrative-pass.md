# The narrative pass: re-voicing the whole game

**PROPOSAL (2026-10-24), awaiting the owner's approval.** The plan for bringing every
player-facing text in line with `narrative-style.md` (the voice) and `story.md` (the story).
When it is approved, record the owner's tweaks in §7 and move the work into the backlog as an
epic.

## 1. What there is today

Inventory taken 2026-10-24:

| Surface | Where | Size | State |
|---|---|---|---|
| UI strings | `game-client/src/UI/Strings/stringsEN.json` (+9 languages) | 1,631 keys | Mixed. Chrome and help are plain and fine. Story text varies from good (Hecate, the Oracle, Caliban) to generic Valley View ("kitchen magic", "local artisan", "Mother Nature", "Orb of Merlin", Portia's "schools, hospitals"), with typos ("acquatince", "Propero", "ot satisfy") and 4 em-dashes (16001, 16103, 16105, 16106) |
| Character speech | strings 16000-16299 (greetings, milestone dialogs `dialogOnMet/Friend/Love/Married/Rival`, Clues) | ~110 lines | The heart of the pass. Uneven: some characters have rich lines, many have one generic greeting and a stock "I love thee truly, {username}" |
| Quests | `game-server/tuning/quests/questsEN.json` | 89 quests, 10 givers | **No quest text at all**: a title, a symbol, goals. Titles are half playful-Shakespearean ("Saw You Not That?", "What Dreams May Haunt", "Let Hell Gape Wide"), half Valley View ("Plant Wheat", "Hire Lumberjack", "Kitchen Confidential", "Coop Dreams", "Zombies, die"). The Shepherd gives 23. Titles are persisted ids (never rename in place) |
| The FTUE | `FTUEsteps.json` (19 steps) + strings 700-760 | ~40 strings | Clear but voiceless ("You'll want to start earning Money right away"); Kent is a 🤠 cowboy; aspirations named Farmer / Adventurer / Politician |
| Intro and help | strings 9000-9020 (How to Play), 16019 (the intro story), 10100+ | ~70 | The intro tells a generic "evil scourge" tale with "King Leontes" ruling Elsinore |
| Hints | strings 200811-200818 (Quest for Hope riddles) | 8 | Good already; the model for the rest |
| Mailbox | `game-server/tuning/messages.json` | 12 | Plain developer voice; fine to keep mostly plain |
| Names | `resources.json` types shown via `getLocalizedString` / `DISPLAY_ALIASES` | 56 NPCs, ~360 resource names | The cast is Shakespeare; the helpers are generic (Doctor, Surgeon, Field Nurse, Fairy, Farm Hand, Rancher, Lumberjack, Crafter); enemies are fairy-tale fauna (fine) |
| Conversations | `Relationships/Topics.json`, `RelationshipMatrix.json` | emoji topics | Emoji only, no text to re-voice |

## 2. Principles of the pass

- **Re-voice, don't rebuild.** Mechanics, goals, rewards and levels stay. The pass changes what
  things say and what they are called on screen. The one structural addition is quest text (§3,
  P3).
- **Persisted ids never change.** Resource `type`, quest `title`, trophy `name` stay as they
  are. New display names go through the existing alias path (`DISPLAY_ALIASES` in
  `Utils/stringLookup.js`, the way `Train` shows as the Caravan) or a new string key.
- **English first, approved, then translated.** Each batch is written in English, reviewed by the
  owner as a before / after table, applied, then translated into DE / ES / FR (quotes from the
  classic translations, `narrative-style.md` §4). The six English-only languages take the
  English.
- **Coordinate with the early-game work.** The FTUE and the quests below L20 are being reworked
  for retention (`early-game.md`, backlog epic OB). The pass re-voices whatever that work
  settles; it does not change step order, quest levels or rewards.
- **Most visible first.** The first hour (FTUE, the first NPCs, the first quests) and the
  spine (the Oracle, the seven artifacts) before the long tail.

## 3. The phases

### P0. Foundations (small; no player-facing change)

1. Approve `narrative-style.md` with tweaks.
2. **Inventory tool:** `tools/narrative/inventory.js` exports every narrative-bearing text into
   one review sheet (Markdown or CSV), by surface: id, speaker, current English, length, and
   flags (em-dash, a word on the avoid list, a generic remnant word such as Merlin / cowboy /
   wizard / Valley View, a "click" without a `_touch` sibling, too long for a phone). It is
   the checklist the pass works down, and re-run at the end to prove it is done.
3. **Quote bank:** `docs/narrative/quote-bank.md`, the starter set in `narrative-style.md` §7
   grown to ~150 lines grouped by moment and by character, each with play, act and scene,
   checked against the Folger text.
4. Fix the typos and the 4 em-dashes now (no decision needed).

### P1. The tale and the cast

#### P1.1 The tale (DRAFT for the owner; moves to `story.md` once approved)

Decided by the owner 2026-10-24: **a storm of stories**, and **Prospero is the antagonist**,
the reason everything is broken and the reason for the Quest for Hope. He is defeated, not
killed: the player beats his dragons to reach him and wins the Orb, as built today. The draft
below replaces the old intro ("an evil scourge grows... bring back the rule of King Leontes"),
keeping its good bones (a happy land, a fall, a quest, a king restored) and giving each one a
Shakespearean source.

- **Before.** Elsinore was a merry kingdom under King Leontes (The Winter's Tale) and Queen
  Gertrude (Hamlet), a place of fairs and farms by the sea. (Hermione, Leontes' queen in his own
  play, was dropped 2026-10-24: the name reads as Harry Potter.) The cracks were already there:
  Leontes was jealous of Helena's love for his queen, and Gertrude turned from him to her garden
  (lines that exist today, 16013 / 16014 / 16106).
- **The wrong.** Prospero (The Tempest), once a duke, was robbed of his dukedom by his own
  brother and turned bitter in his mountain books. He swore the world would answer for it.
  ("The rarer action is in virtue than in vengeance" is the lesson he has not learned yet.)
- **The storm of stories.** Prospero raised a tempest so great it tore the pages out of every
  story. Their people were cast up on Elsinore's shores, far from their own tales: lovers without
  their loves, fools without their kings, schemers without their plots. That is why Iago,
  Juliet, Falstaff and Titania all live in one valley. The storm brought monsters too: "Hell is
  empty, and all the devils are here." It took the Queen: **Gertrude stands as a statue in her
  castle in the Town**, among the ghosts, beside the dungeon entrance, and the King's heart and
  crown went with her (the King's Crown is his, lost in the storm).
- **The magician's hold.** Prospero bound the storm's power in his Orb and shut himself on
  Prospero's Peak behind Cloven Pines (the Tempest's prison tree) and his dragons. While the Orb
  is his, the stories stay broken.
- **The prophecy.** Apollo's Oracle (The Winter's Tale) speaks the line from the play: the
  kingdom shall not mend "if that which is lost be not found". What was lost is Hope, and seven
  treasures scattered by the storm can call it back.
- **The player: the one with no part written.** Not a "chosen one". Everyone in Elsinore is
  stuck playing the part their play gave them; the player is a stranger the storm washed up
  with no script at all ("All the world's a stage... and one man in his time plays many
  parts", which is also the aspiration choice: farmer, adventurer, politician). So the player is
  the only one who can change how the story ends. They wake in the sea cave (the FTUE cave) and
  are found by **the Shepherd**, who once found a lost child on this same shore and knows the
  Oracle's words: "Thou met'st with things dying, I with things new-born."
- **The Queen wakes (a milestone, not the end).** Around the start of the mid game (about L15,
  Act III), the player wakes Gertrude, as Hermione's statue wakes in The Winter's Tale: "Music,
  awake her; strike!" and "'Tis time; descend; be stone no more." The music comes from the
  cast (a song from Feste, the fool who sings), and Helena, who still loves her, is the one who
  asks for it. Waking her is the first sign that the storm can be undone, and it brings her back
  as a trader (her three trades open then; the first, Queen's Cake for a Diamond Ring, is L13
  today, so it moves only a little). What the waking needs (an item from a quest, used on the
  statue) is a small feature: a statue that turns into the NPC for that player.
- **The ending.** At the top of the Peak, past the dragons, Prospero sets his riddle (the built
  minigame). Beaten, he chooses virtue over vengeance at last: he gives up the Orb and his magic
  ("I'll drown my book"). With all seven treasures the Oracle calls Hope home: the storm's
  damage mends, the King's Crown is back on Leontes' head, and Elsinore is merry again. Prospero's own epilogue asks to
  be set free, "As you from crimes would pardoned be, let your indulgence set me free": the
  player may forgive him.

Who stands where: **Caliban** (Prospero's old servant) knows the mountain and hates him, so he
helps. **Hecate** is the witches' queen whose kin Prospero drove out (Sycorax, Caliban's mother,
was a witch), so she forges the axe that fells his pines. **The dragons** are Prospero's.
**Duke Angelo** (Measure for Measure) is the storm's other villain, a false judge who seized the
town's law in the confusion (Cassio's and Juliet's thread). The rest of the cast want their own
stories back, which is what their quests and secrets are about.

How the acts sit on the level phases (`early-game.md` §1): Act I, washed ashore (FTUE,
homestead, the Shepherd, Kent, the Town). Act II, the stranded cast (the early game; the first
treasure, the King's Crown, around L10-11: "Uneasy lies the head that wears a crown"). Act III,
the Valley and its dangers (mid game, more treasures). Act IV, the witch and the underworld
(Hecate, Toil and Trouble, Acheron and the Brief Candle, L30-36). Act V, Prospero's Peak, then
the Oracle (the end of the spine).

Data to change with the tale: Leontes' RelationshipMatrix row has Prospero as a **friend**
(now his enemy); Gertrude's and Leontes' lines are rewritten around the statue and the waking;
Helena and Gertrude keep their mutual love (it becomes the reason Helena wants her woken).

Watch-out: the spine leans on The Winter's Tale (Leontes, the statue, the Oracle, the Shepherd)
crossed with The Tempest (Prospero) and Hamlet's Elsinore. That is a cross-play mash-up as
`story.md` §1 asks; the threads off the spine should stay drawn from the other plays.

#### P1.2 Names: everything is up for grabs

Decided 2026-10-24: any name on screen may take Shakespearean flavour (helpers, buildings,
places, items, doors), provided it stays clear what the thing is; a plain name ("Doctor") is fine
when no good Shakespeare name fits. Names change on screen only (aliases); the types stay.
Candidates, for the owner to pick from in the P1 review:

Decided 2026-10-24 (owner): **approved** the Boar's Head (Restaurant), the Garter Inn (Inn), the
Counting House (Bank), the Temple of Apollo (Ancient Temple), Prospero's Library (Library), and
the picks for the healers and Kent below. **Keep** the Trading Post. Healers have many copies on
the board, so the Doctor and the Surgeon keep generic names. The four farm workers are one of
each per player, so they get personalities.

| Today | Name | Status |
|---|---|---|
| Doctor, Surgeon | keep | decided: many copies |
| Field Nurse | the Nurse (Romeo and Juliet) | approved pick; check copies on the board like the Doctor |
| Fairy (healer) | Peaseblossom (one of Titania's fairies; Cobweb, Moth, Mustardseed as others) | approved pick; same copies check |
| Kent's 🤠 | 🧔 or his own art | approved |
| Inn | the Garter Inn | approved |
| Restaurant | the Boar's Head | approved |
| Bank | the Counting House | approved |
| Ancient Temple | the Temple of Apollo | approved |
| Library | Prospero's Library | approved |
| Trading Post | keep | decided |
| Magic Shop | options below | open |
| Studio | keep plain ("the Globe" is not clear enough for an art station) | decided; the Globe goes elsewhere (below) |
| Castle, Courthouse, Warrior's Den, Armory, School, Guild, Shrine, Hospital | keep plain unless a good name appears in the sweep | |
| Locations | mostly plays' places already; the sweep checks the rest | |

**The farm workers** (one each, so each is a character with a voice card). Proposal: the town's
craftsmen are Snug's fellow Mechanicals from the Dream, the country hands come from the Forest
of Arden (As You Like It), so the four read as two pairs.

| Worker | Proposal | Why | Alternatives |
|---|---|---|---|
| Lumberjack | **Peter Quince** | the Mechanicals' carpenter: he knows timber | Ferdinand (The Tempest), the prince who hauls logs for love |
| Crafter | **Nick Bottom** | the weaver, boastful and willing to play every part | Robin Starveling (tailor), Tom Snout (tinker, mends pots) |
| Rancher | **Corin** | Arden's old shepherd: "the greatest of my pride is to see my ewes graze and my lambs suck" | Launce and his dog Crab (Two Gentlemen of Verona), Silvius |
| Farm Hand | **Audrey** | Arden's country girl, plain and cheerful | William (Arden's country lad), Costard (Love's Labour's Lost) |

**Magic Shop** options (it sells spells, the Spells epic; the name should say "magic" by itself):

| Option | From | For |
|---|---|---|
| **Glendower's** (Recommended) | Henry IV: Owen Glendower, who boasts "I can call spirits from the vast deep" (and Hotspur, who is in the game, answers "Why, so can I, or so can any man; but will they come when you do call for them?") | a showman wizard selling spells, with built-in gossip between two NPCs |
| Oberon's Bower | A Midsummer Night's Dream ("I know a bank where the wild thyme blows") | fairy magic, the king of the fairies' own shop |
| Puck's Spells | A Midsummer Night's Dream | mischievous, playful, instantly readable |
| The Fairy Ring | A Midsummer Night's Dream | a place name, a little less clear as a shop |

**Where the Globe could go** (a name players should understand from where it is):

| Option | Why |
|---|---|
| The leaderboard (the Leaders panel and the season standings) | "All the world's a stage": the Globe is where everyone's part is ranked |
| The Arena (the Arena Door) | fights as a show for a crowd, the way the Globe staged them |
| A Town landmark: a small theatre where the Town News and season events are posted, as playbills | the Globe as a place, not a function |

#### P1.3 Systems

System names stay plain (they are menus), now that the Caravan and the Harvest Fair have
names. The aspirations keep Farmer / Adventurer / Politician, introduced by "one man in his time
plays many parts".

#### P1.4 Voice cards

For every speaking character not yet in `narrative-style.md` §6, once the names are chosen.

### P2. Character speech and the spine (the heart; ~150 lines)

Every greeting, milestone dialog (met / friend / love / married / rival), trader line and Clue
for every character, in voice, with a quote or fragment in most lines, and gossip that crosses
the plays (Iago on Cassio, Helena on Titania, Caliban on Prospero). The Oracle and the seven
artifacts' moments (found, given, Hope) get set-piece lines. The stock "I love thee truly,
{username}" is replaced per character. Batches by region of the game: Town cast, then Valley
cast, then the late-game cast.

### P3. Quests (89 quests; one small feature)

1. **Feature: quest text.** Add two optional string keys per quest (`titleKey`: the shown title;
   `textKey`: the giver's ask, one or two lines) to the QUESTS sheet definition and the quest
   panel / quest card, falling back to `title` when unset. The persisted `title` never changes.
2. **Write them:** each quest gets a display title (a quote fragment or a play on one:
   "Plant Wheat" could show as "Sow, and Thou Shalt Reap"; "Hire Lumberjack" as "Peter Quince
   Wants Work") and an ask in the giver's voice with the goal said plainly.
3. **Givers** (decided 2026-10-24): **the Shepherd gives the core story quests**, the main
   chain through the five acts that points the player at each treasure and at the characters
   who hold the way to it. **Secondary characters give the specialised quests** in their own
   field (Mistress Quickly cooking, Feste crafting, Hotspur and Cassio combat, Helena wild herbs,
   Portia the Town's institutions). So most of the Shepherd's 23 farming and building quests move
   to a farming specialist (candidates: Audrey the goatherd or Corin the old shepherd from As You
   Like It) and a building one (Peter Quince the carpenter), and the Shepherd gains new story
   quests (about one per act step, roughly 10 to 15). Moving a quest is changing its `giver`;
   the title, level and reward stay. The new story quests are the one place the pass adds
   content, and they are planned with the OB epic so the first hour and Act I agree.

### P4. The first hour and the moments (~80 strings)

The FTUE toasts and modals (after the OB work lands), the intro story, How to Play, level up,
death and revival ("You have fallen" / "Out, out, brief candle!"), season end, the Caravan and
Harvest Fair, the Bank, elections, the mailbox welcome. Instructions stay plain; each screen
gets at most one line of flavour (`narrative-style.md` §2).

### P5. Names and places (sweep)

Story items, region and signpost names, building names where a play gives a good one, the
descriptions players read on hover. Ordinary goods keep ordinary names.

### P6. Translation and QA

DE / ES / FR for every approved batch (in step with each phase, not saved for the end), the
inventory tool re-run with zero flags, a phone read-through of every modal (no scrolling
speeches), and the QUEST FOR HOPE tab checked after any hint change.

## 4. How a batch runs

1. Claude drafts the batch in English as a before / after table (id, speaker, old, new, the
   quote and its source), following `narrative-style.md`.
2. The owner reviews it (a page to read and mark up, or in chat), with tweaks.
3. Claude applies it to `stringsEN.json` (and the data files), updates the other nine files
   (English in the six, then DE / ES / FR), and checks the game shows it.
4. The style doc gains any new rule the review produced.

## 5. Size

| Phase | Lines to write | Code |
|---|---|---|
| P0 | ~150 quote-bank entries, 7 fixes | the inventory script |
| P1 | decisions + ~10 aliases + ~15 voice cards | aliases only |
| P2 | ~150 speeches | none |
| P3 | 89 titles + 89 asks | quest `titleKey` / `textKey` (sheet column, panel, card) |
| P4 | ~80 strings | none |
| P5 | ~60 names | aliases |
| P6 | translation of all of the above into 3 languages | none |

Roughly 600 English lines, about 2,400 with translations, in six or seven review batches.

## 6. Decisions for the owner

Decided 2026-10-24: the premise (a storm of stories), Prospero as the antagonist (defeated, not
killed), the Shepherd as the story-quest giver with specialists for the rest, every name up for
grabs. Decided later the same day: Gertrude (not Hermione) is the statue, woken as a mid-game
milestone; building and helper names as in P1.2. Still open:

1. The tale (P1.1): approve the draft, with tweaks.
2. The farm workers (Quince, Bottom, Corin, Audrey, or alternatives), the Magic Shop, where the
   Globe goes, and the Nurse / Peaseblossom copies check.
3. Waking Gertrude: when (about L15?) and what it needs (Feste's song, asked for by Helena?).
4. Quest text (P3.1): build the display title + ask feature?
5. Who takes the Shepherd's specialised quests (P3.3).
6. Order: proposal P0, P1, then P2, with P4 after the OB epic settles the FTUE.

## 7. Owner's tweaks (filled in on approval)

- 2026-10-24: "a storm of stories" chosen. Prospero becomes the antagonist, central to why
  everything is broken; the player defeats his dragons to reach him but need not kill him. The
  Shepherd keeps the core story quests; secondary characters give specialised ones. Helpers,
  buildings, locations, "really anything" may be renamed with Shakespearean flavour; a plain
  name such as "Doctor" is fine when nothing better fits.
- 2026-10-24 (second round): no Hermione (reads as Harry Potter); Gertrude is Leontes' queen and
  the statue, in her castle in the Town with the ghosts and the dungeon entrance, woken as a
  milestone before the end. Approved names: the Boar's Head, the Garter Inn, the Counting House,
  the Temple of Apollo, Prospero's Library, the healer and Kent picks. The Trading Post, the
  Doctor and the Surgeon keep their names; the Studio stays plain and the Globe goes somewhere
  clearer. The farm workers get personalities (one each); use Peter Quince somewhere. More
  Magic Shop options wanted ("cauldron" is too literal).
