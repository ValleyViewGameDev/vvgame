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

### P1. The world and the cast (decisions, then a little data)

The owner decides; the pass then applies the answers.

1. **The premise.** Why are characters from many plays in one valley? Proposal: a storm of
   stories. Prospero's tempest, long ago, wrecked every play on the same shore, and the
   characters made Elsinore their home (it explains Viola's shipwreck, Prospero's guilt, and
   the mash-up in one line, and it is a fairy tale). The intro (16019) and How to Play's "What's
   it about?" are rewritten around it. Alternatives: "All the world's a stage" (the valley is a
   playhouse world), or no explanation at all.
2. **The generic helpers get Shakespearean identities** (display names through aliases; the
   types stay):

   | Today | Proposal | Why |
   |---|---|---|
   | Farm Hand, Rancher, Lumberjack, Crafter (workers) | The Mechanicals of the Dream: Peter Quince (carpenter, the Lumberjack), Nick Bottom (weaver, the Crafter), Francis Flute (the Farm Hand), Tom Snout (tinker, the Rancher) | Workmen in the play; Snug is already one of them, so the hired hands are his troupe |
   | Doctor | Doctor Caius (The Merry Wives of Windsor) | The play's own physician, comic and French |
   | Field Nurse | The Nurse (Romeo and Juliet) | Juliet's chatty Nurse, a healer with a heart |
   | Surgeon | Cerimon (Pericles), or keep "Surgeon" | Cerimon raises Thaisa from the dead; obscure, so keeping the plain name is fine |
   | Fairy | Puck, or Titania's fairies (Peaseblossom, Cobweb, Moth, Mustardseed) | Fairies are the Dream's |
   | Kent's 🤠 symbol | a plain 🧔 or Kent's own art | Kent is Lear's loyal earl, not a cowboy |
   | Vampire | keep (original), give him a voice card | `story.md` §1 welcomes originals |
   | Santa Claus | keep for the season, or Father Christmas | seasonal original |

3. **Systems vocabulary** (names on screen only; all optional): the aspirations Farmer /
   Adventurer / Politician (keep, or "the Husbandman / the Knight-errant / the Statesman" if the
   owner wants flavour there); Town News as **the Town Crier**; the Store as **the Merchant's
   Stall**? Proposal: keep system names plain (they are menus, `narrative-style.md` §2) and
   only flavour the people.
4. **Voice cards** for every speaking character not yet in `narrative-style.md` §6.

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
3. **Givers:** the Shepherd's 23 quests are a lot for one voice; where it fits, hand some to
   characters the player has just met, matching T-5 in the backlog (quest `giver` is data, the
   title is not). Owner decides per quest; no level or reward change.

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

1. The premise (P1.1): a storm of stories, a stage, or none?
2. The helpers (P1.2): the Mechanicals as workers, Doctor Caius, the Nurse, Puck; Surgeon and
   Santa kept or renamed?
3. System names (P1.3): keep plain, or flavour some?
4. Quest text (P3.1): build the display title + ask feature?
5. Quest givers (P3.3): spread the Shepherd's quests to other characters?
6. Order: is P2 (character speech) or P4 (the first hour) first? Proposal: P0, P1, then P2,
   with P4 after the OB epic settles the FTUE.

## 7. Owner's tweaks (filled in on approval)

(none yet)
