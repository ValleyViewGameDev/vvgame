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
4. Fix the typos and the 4 em-dashes now (no decision needed). DONE 2026-10-24: acquaintance, Prospero, "to satisfy", Titania's broken `[username]`, "the Orb of Merlin" (now "my Orb"), and every em-dash in the ten string files; the title is "Secrets of Elsinore" in all ten (the six English-only files had kept "Valley View").

### P1. The tale and the cast

#### P1.1 The tale: DONE, now canon in `story.md` §0 (2026-10-24)

A storm of stories; Prospero the antagonist (defeated, not killed); Gertrude, Leontes' queen, as
the statue woken at the end of the early game (built); the player as the one with no part
written, found by the Shepherd; the five acts on the level phases. Data changed with it: Leontes'
RelationshipMatrix row now has Prospero as a rival (was friend).

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
| Magic Shop | **Oberon's Bower** | decided 2026-10-24 |
| Studio | keep plain ("the Globe" is not clear enough for an art station) | decided; where the Globe goes is an open item for the future |
| Castle, Courthouse, Warrior's Den, Armory, School, Guild, Shrine, Hospital | keep plain unless a good name appears in the sweep | |
| Locations | mostly plays' places already; the sweep checks the rest | |

**The farm workers** (one each, so each is a character with a voice card). **Decided 2026-10-24: Quince, Bottom, Corin, Audrey as proposed.** the town's
craftsmen are Snug's fellow Mechanicals from the Dream, the country hands come from the Forest
of Arden (As You Like It), so the four read as two pairs.

| Worker | Proposal | Why | Alternatives |
|---|---|---|---|
| Lumberjack | **Peter Quince** | the Mechanicals' carpenter: he knows timber | Ferdinand (The Tempest), the prince who hauls logs for love |
| Crafter | **Nick Bottom** | the weaver, boastful and willing to play every part | Robin Starveling (tailor), Tom Snout (tinker, mends pots) |
| Rancher | **Corin** | Arden's old shepherd: "the greatest of my pride is to see my ewes graze and my lambs suck" | Launce and his dog Crab (Two Gentlemen of Verona), Silvius |
| Farm Hand | **Audrey** | Arden's country girl, plain and cheerful | William (Arden's country lad), Costard (Love's Labour's Lost) |

**Building names, round 2** (owner 2026-10-24: Wittenberg, the Grange at Arden and Portia's Court
approved; the Guild keeps its name; more ideas wanted for the rest, tied to what each one sells).
Diagon Alley's lesson (a person and their wares, a good pair of names, a tagline that says what is
sold) applied to the actual stock:

| Building: what it sells | Ideas (recommended first) | Why it fits the stock |
|---|---|---|
| General Store: Axe, Better Axe, Pickaxe, Better Pickaxe, Horse | **Snout the Tinker** ("tools mended and sold"); "A Horse! A Horse!"; the Woodman's Yard | A tinker mends and sells tools; Tom Snout is one of the Mechanicals (with Quince, Bottom, Snug). Richard III's cry fits the Horse, the rest less |
| Warrior's Den: knives, swords, bows, spears, halberds, crossbows, magic weapons | **Mercutio's Blades**; Tybalt's Fencing School; "Is This a Dagger?" | Mercutio and Tybalt are Romeo and Juliet's swordsmen (Tybalt, "Prince of Cats", the fencing master); Macbeth's dagger line as a sign |
| Armory: padding, mail, plate, mystic armour, Caliban's Breastplate | **The Armourers of Harfleur**; Hector's Armour; Mars, Armourer | Henry V's chorus: "the armourers, accomplishing the knights, with busy hammers closing rivets up"; Harfleur is already a place in the game |
| Academy: Textiles, Artistry, Tailor | **Starveling's, Tailor**; the Weaver's Loft; the Academe of Navarre | Robin Starveling is the Mechanicals' tailor; Textiles and Tailor are his trade |
| Laboratory: Chemistry, Baker, Cooking, Creamery, Winemaker | **Mistress Quickly's Kitchen**; Friar Laurence's Cell; the Still-Room | Mistress Quickly already gives the cooking quests; Friar Laurence brews from herbs (Chemistry, wine) |
| Factory: Builder, Masonry, Mechanics, Roaster | **Snug the Joiner**; the Wall; the Mechanicals' Workshop | Snug is the Mechanicals' joiner (a carpenter) and already in the game; the Wall is the part Snout plays in their play (Masonry) |
| Shrine: the Trident | **Neptune's Shrine**; Full Fathom Five | The Trident is Neptune's; "Full fathom five" is the Tempest's sea song |
| Castle: the King's Crown | **Leontes' Castle**; the King's Hall; Belmont Castle | The crown is the King's (§0 of `story.md`) |
| Hospital: hires Doctors and Surgeons | keep | plain is clearer here |

If Snout takes the General Store and Snug the Factory, the four Mechanicals the player meets
are all tradesmen at work: Quince (Lumberjack), Bottom (Crafter), Snout (tools), Snug (building),
with Starveling the tailor at the Academy. A tagline could show under each name in the
building's panel.

**Decided 2026-10-24 (round 2):** Neptune's Shrine, Leontes' Castle, Quickly's Lab (Laboratory),
The Wall (Factory), Tybalt's (Warrior's Den), Woodman's Yard (General Store); the Academy keeps its
name. The Armory: keep brainstorming around Hector (Troilus and Cressida).

**Built in the local build 2026-10-24** (aliases in `Utils/stringLookup.js` `DISPLAY_ALIASES` +
the name strings in all ten languages; types unchanged): Boar's Head (Restaurant), Garter Inn
(Inn), Counting House (Bank), Temple of Apollo (Ancient Temple), Prospero's Library (Library),
Oberon's Bower (Magic Shop), Wittenberg (School), Grange at Arden (Agriculture Center), Portia's
Court (Courthouse); the workers Audrey (Farm Hand), Corin (Rancher), Peter Quince (Lumberjack),
Nick Bottom (Crafter); Kent's symbol 🧔. Round 2, same day: Neptune's Shrine, Leontes' Castle,
Quickly's Lab, The Wall, Tybalt's, Woodman's Yard.

**Where the Globe could go** (OPEN, for the future, owner 2026-10-24):

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
3. **Givers** (decided 2026-10-24): **the Shepherd gives the core story quests**, secondary
   characters the specialised ones. PROPOSAL for the Shepherd's 23 quests (moving a quest is
   changing its `giver`; title, level and reward stay):

   | Level | Quest | Goal | Proposed giver | Why |
   |---|---|---|---|---|
   | 1 | Plant Wheat | Plant 1 Wheat | **The Shepherd** | Act I: he takes the stranger in and teaches them to live here (FTUE adds it) |
   | 2 | Grower | Acquire Grower | **The Shepherd** | Act I (FTUE adds it) |
   | 2 | Earth's Bounty | Collect Wheat, Carrot, Corn | **The Shepherd** | Act I |
   | 3 | Wood Master | Acquire Axe | **The Shepherd** | Act I |
   | 3 | Saw You Not That? | Collect 24 Wood | **The Shepherd** | Act I |
   | 4 | Backpack | Acquire Backpack | **The Shepherd** | Act I: ready for the road |
   | 6 | Hire Farm Hand | Craft Farm Hand | **The Shepherd** | he introduces his neighbours: Audrey |
   | 7 | Hire Rancher | Craft Rancher | **The Shepherd** | ... Corin |
   | 9 | Hire Lumberjack | Craft Lumberjack | **The Shepherd** | ... Peter Quince |
   | 3 | The Gentle Art | Acquire Husbandry | **Launce** (new) | animals |
   | 3 | Bovine Bliss | Buy 1 Cow | **Launce** (new) | animals |
   | 3 | Cream of the Crop | Collect 30 Milk | **Launce** (new) | animals |
   | 4 | Fleecy Fellowship | Buy 1 Sheep | **Launce** (new) | animals |
   | 8 | Coop Dreams | Build Chicken Coop | **Launce** (new) | animals |
   | 4 | Foundations of Stone | Acquire Builder | **Snug** | building: the joiner |
   | 5 | Mill by Moonlight | Build Mill | **Snug** | building |
   | 6 | Master Mason | Acquire Masonry | **Snug** | building |
   | 7 | Mechanics | Acquire Mechanics | **Snug** | building |
   | 15 | Lumber Yard | Build Lumber Yard | **Snug** | building |
   | 6 | Sweet Harvest | Plant 30 Sugarcane | **Mistress Quickly** | the kitchen's sugar |
   | 7 | Cook's Harvest | Collect Sugarcane, Onion, Carrot | **Mistress Quickly** | the kitchen's larder |
   | 9 | The Spark Within | Acquire Chemistry | **Mistress Quickly** | the Laboratory's first skill (her Kitchen, if the name is chosen) |
   | 20 | Nectar of the Valley | Acquire Winemaker | **Falstaff** | wine and sack are his life |

   So the Shepherd keeps 9 (all Act I), and gains the new story quests (about one per act
   step, roughly 10 to 15: point the player at each treasure and at the Queen). What this
   needs:
   - **One new Town character: Launce** (The Two Gentlemen of Verona), the servant who loves
     his dog Crab more than anyone ("I think Crab my dog be the sourest-natured dog that
     lives"): the Town's animal keeper, a comic, kind voice. Needs art (a copy of an existing
     NPC's SVG to start, like Hecate), a RelationshipMatrix row, greeting lines, and a tile in
     the four town layouts. Alternative: Silvius, the lovesick shepherd from As You Like It.
   - **Snug and Falstaff become quest givers** (`action: quest`); a quest giver with trader
     offers already shows both, so their trades stay. Snug's travel-companion feature is keyed
     on his type, not his `action` (checked 2026-10-24), so it keeps working.
   - Quest levels below L20 belong to the early-game work (`early-game.md`, epic OB): these
     moves change who asks, not when.

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
grabs. Decided later the same day: Gertrude (not Hermione) is the statue, woken at the end of the early
game (BUILT 2026-10-24, see `story.md` §0); the farm workers Quince, Bottom, Corin, Audrey;
Oberon's Bower; the Shepherd's specialised quests go wherever fits (new Town characters to be
proposed first). Still open:

1. The Armory's name (a Hector idea, P1.2). The Nurse / Peaseblossom copies check.
2. The Shepherd's quests (P3.3): approve the table, and Launce as a new Town character.
3. Where the Globe goes (future).
4. Quest text (P3.1): not greenlit yet.
5. The live migration for Gertrude (`scripts/wake-gertrude-for-friends.js --except Oberon`):
   waits for a good connection to the database (owner, 2026-10-24).
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
- 2026-10-24 (third round): worker picks approved; Oberon's Bower; the Globe stays open; explore
  building names with Diagon Alley as inspiration (Shakespeare only); wake Gertrude at the end of
  the early game, built as Feste walking to her after his quest (teleport if his route fails),
  the statue's riddle modal working only with him nearby, his song waking her; the marble-statue
  art as a special resource outside the deco catalog; quest text not greenlit; the Shepherd's
  specialised quests to whoever fits.
- 2026-10-24 (fourth round): no migration while the owner is travelling; Oberon is excluded
  from it. Wittenberg, the Grange at Arden, Portia's Court approved; the Guild keeps its name;
  more ideas for the other buildings, tied to their stock. The title is "Secrets of Elsinore"
  in every language file. Focus: finalise the story docs and make the changes in the local
  build.
