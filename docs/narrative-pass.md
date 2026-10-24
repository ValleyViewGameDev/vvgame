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

- **Before.** Elsinore was a merry kingdom under King Leontes and Queen Hermione (The Winter's
  Tale), a place of fairs and farms by the sea.
- **The wrong.** Prospero (The Tempest), once a duke, was robbed of his dukedom by his own
  brother and turned bitter in his mountain books. He swore the world would answer for it.
  ("The rarer action is in virtue than in vengeance" is the lesson he has not learned yet.)
- **The storm of stories.** Prospero raised a tempest so great it tore the pages out of every
  story. Their people were cast up on Elsinore's shores, far from their own tales: lovers without
  their loves, fools without their kings, schemers without their plots. That is why Iago,
  Juliet, Falstaff and Titania all live in one valley. The storm brought monsters too: "Hell is
  empty, and all the devils are here." It took the Queen: Hermione stands in the castle as a
  statue, and the King's heart and crown went with her (the King's Crown is his, lost in the
  storm).
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
- **The ending.** At the top of the Peak, past the dragons, Prospero sets his riddle (the built
  minigame). Beaten, he chooses virtue over vengeance at last: he gives up the Orb and his magic
  ("I'll drown my book"). With all seven treasures the Oracle calls Hope home, the statue of
  Hermione wakes ("Be stone no more"), and Leontes is king again. Prospero's own epilogue asks to
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

Watch-out: the spine leans on The Winter's Tale (Leontes, Hermione, the Oracle, the Shepherd)
crossed with The Tempest (Prospero) and Hamlet's Elsinore. That is a cross-play mash-up as
`story.md` §1 asks; the threads off the spine should stay drawn from the other plays.

#### P1.2 Names: everything is up for grabs

Decided 2026-10-24: any name on screen may take Shakespearean flavour (helpers, buildings,
places, items, doors), provided it stays clear what the thing is; a plain name ("Doctor") is fine
when no good Shakespeare name fits. Names change on screen only (aliases); the types stay.
Candidates, for the owner to pick from in the P1 review:

| Today | Candidates | Note |
|---|---|---|
| Doctor | Doctor Caius (Merry Wives) | the play's comic physician |
| Field Nurse | the Nurse (Romeo and Juliet) | Juliet's chatty Nurse |
| Surgeon | Cerimon (Pericles), or keep | Cerimon is obscure |
| Fairy (healer) | Peaseblossom, Cobweb, Moth, Mustardseed (the Dream) | Titania's fairies |
| Farm Hand, Rancher, Lumberjack, Crafter | Snug's fellow Mechanicals (Quince the carpenter, Bottom the weaver, Flute, Snout), or role names with flavour ("Woodman", "Rustic") | open question: a player can hire several of one kind, and five Bottoms is odd; names fit only if each kind is one person |
| Kent's 🤠 | 🧔 or his own art | Lear's loyal earl |
| Inn | the Garter Inn (Merry Wives) | |
| Restaurant | the Boar's Head (Mistress Quickly's tavern, Henry IV) | |
| Trading Post | the Rialto (The Merchant of Venice) | "What news on the Rialto?" |
| Bank | the Counting House | |
| Ancient Temple | the Temple of Apollo (The Winter's Tale) | where the Oracle's sealed scrolls are opened |
| Castle | Elsinore Castle, home of the statue | |
| Magic Shop | the Witches' Cauldron | Hecate's sisters sell spells (fits the Spells epic) |
| Library | Prospero's Library ("my library was dukedom large enough") | the books he left behind |
| Studio | the Globe | |
| Courthouse | the Duke's Court | |
| Warrior's Den, Armory, School, Guild, Shrine, Hospital | keep plain unless a good name appears | |
| Locations | already mostly plays' places (Dunsinane, Illyria, Belmont, Arden...); the sweep checks the rest | |

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
grabs. Still open:

1. The tale (P1.1): approve the draft, with tweaks.
2. The names (P1.2): pick from the candidates; the workers question.
3. Quest text (P3.1): build the display title + ask feature?
4. The farming and building specialists who take over the Shepherd's quests (P3.3).
5. Order: proposal P0, P1, then P2, with P4 after the OB epic settles the FTUE.

## 7. Owner's tweaks (filled in on approval)

- 2026-10-24: "a storm of stories" chosen. Prospero becomes the antagonist, central to why
  everything is broken; the player defeats his dragons to reach him but need not kill him. The
  Shepherd keeps the core story quests; secondary characters give specialised ones. Helpers,
  buildings, locations, "really anything" may be renamed with Shakespearean flavour; a plain
  name such as "Doctor" is fine when nothing better fits.
