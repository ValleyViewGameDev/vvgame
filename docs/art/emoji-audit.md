# Emoji audit and the plan to replace them all (2026-11-07)

Where the game still shows an emoji after the painted doobers shipped (docs/art/doobers.md),
counted from resources.json, the client source, the ten string files and the other tuning
data, and the order in which the owner wants them gone. Numbers are from the audit script run
on 2026-11-07; re-run the counts before each pass rather than trusting these.

## Decisions already taken (owner, 2026-11-07)

- **Home Deed** uses the Scroll art (`doober-scroll.svg`): no new drawing.
- **The keys** get new art (Golden, Skeleton, Town, Dungeon). The diagonal pose of the emoji
  keys is fine; they are the one family allowed off the straight-on rule. **Mirror Key** is
  not a key: it is a charm that lets the player walk through mirrors, so it is drawn as
  something magical (a small hand mirror charm, a glow), not a key.
- **Hecate's Torch** gets an icon.
- **The three Hearts** (Yellow, Green, Purple: the relationship currencies) get icons.
- **Decorative emoji in modal and panel copy are removed**, not replaced (the Post House modal
  and its kind): an emoji that only decorates a title or a sentence goes; one that carries a
  meaning gets the thing's art or a small system icon.
- **Animals and pets are the second-to-last art pass** (backlog BL-16), and **player avatars
  and NPC avatars are the final one** (BL-17). Nothing in the passes below redraws an animal,
  a pet, an enemy or a character.
- Open: the **Gem** keeps its 💎 glyph until the owner says otherwise (it sits next to the
  hearts in every currency list, so it probably joins the hearts' sheet).

## Where the emoji are

### 1. Resource rows with an emoji symbol and no art (`resources.json`, 294 rows)

| Category | Rows | Where they show | Plan |
|---|---|---|---|
| power | 116 | Combat panel, shop cards, inventory | pass 4: a small icon set by power family (7 glyphs today: 🛡️ 🔪 🗡️ 🏹 ⚔️ 👁️ 🎯) assigned per row via `iconFile` |
| skill | 57 | Skills panel, school/guild cards, level-up modal | pass 4: an icon set by skill family (~25 glyphs today), per row via `iconFile` |
| special | 28 | currency lists, inventory, Kent/quest rewards, story modals | pass 1 (keys, torch, hearts, deed, secrets, Hope, XP, tent, boat, Gold Pass) |
| npc | 28 | the board, panels, quest cards | 5 farm animals → BL-16; 12 enemies + 7 spawners + Fairy, Santa, Porter, Oracle → BL-17 (spawners: pass 3 decides whether they draw at all) |
| farmplot | 23 | the board: every growing plot is a 🌱 (vines 🍃) | pass 3: growing-plot art |
| deco | 15 | board + Deco panel | pass 3: Holiday Tree (5 layouts) and Stack of Books (3) get art; the 13 unused rows (5 emoji walls, Harp, Chair, Toilet, Bed, Teddy Bear, Slide, White Dove, Black Fog as a door) are retired or drawn |
| pet | 12 | board, Pets panel | BL-16 |
| travel | 10 | the board: 8 signpost arrows, Dungeon Entrance / Exit | pass 3 |
| editor | 5 | the board: Mountain (3 sizes), Big Statue, Volcano | pass 3 (the 20-tile mountain is the largest emoji in the game) |

Two symbols have no Twemoji at all and draw as platform text on the board today: 🐦‍🔥 Phoenix
and 🪉 Harp.

### 2. Client source (`game-client/src`, 161 files)

| Kind | Lines | Notes |
|---|---|---|
| console / comments | 673 | ignore (never rendered) |
| rendered in JSX | 114 | the list below |
| string / data | 243 | conversation glyphs (Conversation.js 43, RelationshipCard.js 25: NPC speech bubbles), ToolsPanel cursor emoji (14), overlays (ResourceOverlayUtils 9), VFX glyphs, settlement/frontier previews |
| toasts / status / float-ups | 122 | plain strings; need the rich status line (pass 5) |

Rendered in JSX, grouped:

- **Currencies and resources still hard-coded:** header ❤️ ring, 💎 (header, ResourceButton gem chip, CraftingStation slot cost, ChangeIconModal, GemSpendConfirm, AvatarModal), Inventory currency block (💎 🏠 💛 💚 💜), 🔷 XP (QuestButton, Kent chip, PetPanel, NPCsPanel), ❤️‍🩹 heal (NPCsPanel, ManageContentsModal, InnPanel), 📜 scrolls (ScrollStation x3), ⭐ (NewTrain cost). → pass 1 art + `ResourceIcon`.
- **Decorative, to remove:** OffSeasonModal (💰 🧑‍🌾 🛠️ 💰 📬), Chat header 💬, TrainCompleteModal 🚂, RevivalModal 💀, Carnival / NewTrain ⏳ timers, ShareModal 📋, BeginModal ☝ (the in-app pointer), InnPanel ❤️, Mailbox 🆕, MinigameButton 🧩, Courthouse comments. → pass 2.
- **System glyphs that need a drawn icon:** 🔒 (LevelLock, TradeStall x2, BulkCrafting), ✅ (QuestButton x2, QuestForHopeModal, Notifications), ➕ (TradeStall), ⏳ processing (ResourceButton, TransactionButton, QuestButton), Notifications icons (🏆 🌙 📨 ✅ 👸), the season / news / quest / map buttons (📅 📰 📜 🗺), nav fallbacks ⚔️ 🏛️ 🏆, TrophyPanel 🏆, NPCConnections category icons (💬 ❤️ 💍 🤝 ⚔️), StatusBar ⬥ separator, ❓ unknown. → pass 2: one small system-icon sheet in the header-icon style (docs/art/ui-icons.md `system` variant).
- **Zoomed-out views:** PixiRendererSettlementGrids 🏠 👤 🏛️ 💰 📥 and PixiRendererFrontierSettlements. → pass 3.
- Dead code with emoji: StartScreenAnimation.js (unused import), RenderDynamicElements.js (dead renderer), debug.js.

### 3. Strings (`UI/Strings/stringsEN.json`: 251 of 1,816 keys; the same in nine other languages)

211 start with a decorative emoji (⚠️ ✅ 💰 🏠 🎒 🚫 🏛️ 📦 ⛺ 🧔 ...): status messages (ids 4-113, 302-511),
panel titles and section headings (132, 181-193, 522-557, 1118-1134, 2003-2099, 3002-3059,
5001-5105, 10112-10215, 15000-15030), the How to Play pages (9006-9026), the FTUE notices
(721-754, 7003-7069). 40 carry an emoji mid-sentence as a stand-in for a thing ("Harvest
some 🌾 Wheat", "check with 🧔 Kent", "the 💪 Skills panel"). Decision: strip the leading
decorations (pass 2); replace the mid-sentence ones with the thing's art through the toast /
rich-line token (pass 5) or reword.

### 4. Other data

| File | Emoji | What | Plan |
|---|---|---|---|
| quests/questsEN.json | 144 | every quest's `symbol` is its giver's glyph; QuestButton already swaps it for the NPC's art when the row has one | follows NPC art (BL-17); nothing to do |
| messages.json | 28 | mail bodies and titles (🧞‍♀️ the Oracle, 👸, 🗓️ ...) | pass 2 strip; the rich line for the rest (pass 5) |
| FTUEsteps.json | 5 | `notificationIcon` 📬 🌾 🗝️ 📜 🌱 | pass 1/2: `notificationSprite` already takes a file; point them at the art |
| starterAccount.json | 1 | the starter avatar | BL-17 |
| PlayerIcons.json | 28 | the old avatar set; all 28 have a `filename` already | BL-17 (the parts-based avatar, docs/avatar-plan.md) |
| RelationshipMatrix.json | 47 | NPC glyphs on relationship cards and speech | BL-17 |

## Status

- **Pass 1 shipped 2026-11-07** (`tools/art/jobs/doobers-r11.json`, files `item-<slug>.png/.svg`):
  the four keys (flipped to the owner's taste), the Mirror Key charm, Hecate's Torch, the three
  Hearts, the Gem, a Health heart (not a row: `<ResourceIcon file="item-health-heart.svg" />`),
  Yorick's Skull, Boat, a red Tent, the Gold Pass as a golden ticket, Hope as a white dove.
  Home Deed, Gertrude's Song, Portia's Pardon, Reveal Scroll and the "Only Found in Scrolls"
  hint share `doober-scroll.svg`; each Secret shows its character's portrait; XP is the level
  star (`UI/Icons/XpStar.js`, the owner's). Wired: the Inventory currency block, the header
  gem and heart ring, the gem chips on ResourceButton and the crafting slots, the avatar and
  change-icon modals, the heal lines, the Scroll station, the FTUE notices (`notificationSprite`).

## The passes

Each pass follows the doober loop: a 3 x 3 sheet in the Lined style on the icon grid,
`tools/art/icons.js` to cut, presented on grass and dirt with names, nothing ships
unapproved, `iconFile` (panel-only) or `filename` (board) on the row, `npm run build:atlas`.

1. **Story items and currencies** (28 `special` rows + the hard-coded JSX). Sheet A: Golden Key,
   Skeleton Key, Town Key, Dungeon Key (diagonal keys), Mirror Key (a charm), Hecate's Torch,
   Yellow / Green / Purple Heart. Sheet B: the seven Secrets (one sealed-letter or whisper
   motif, tinted per character, or one art for all), Portia's Pardon, Gertrude's Song, Yorick's
   Skull, Hope, Reveal Scroll. Sheet C: Tent, Boat, XP (reuse `xp-star.svg`), Gold Pass star,
   Gem (if the owner agrees). Home Deed = `doober-scroll.svg`, no drawing. Then the Inventory
   currency block, the header heart ring and every 💎 🔷 ❤️‍🩹 📜 in JSX go through
   `ResourceIcon`; the FTUE `notificationIcon`s become `notificationSprite`s.
2. **Chrome and copy.** Strip the 211 leading-emoji strings in all ten languages (one script,
   the same regex that cleaned the header strings on 2026-11-02) and the decorative JSX emoji
   listed above. Draw one system sheet (lock, check, plus, hourglass, warning, new-mail,
   calendar, news, quest scroll, trophy already exists, heart, ring, handshake, crossed
   swords, speech) in the header-icon `system` style and wire the season / news / quest
   buttons, the lock and check marks, the notification icons, the processing hourglass and
   the NPCConnections categories to it.
3. **The board's last emoji.** Growing-plot art for the 23 farmplots (one sprout stage, or two
   stages so a plot reads as "growing" vs "nearly ready"); the 8 signposts and the dungeon
   entrance / exit; the mountains, volcano and big statue (`editor` rows, the largest sprites
   in the game); Holiday Tree and Stack of Books; retire the 13 unused deco rows (check live
   grids first: the emoji walls cost 1 gem and may stand on a homestead); decide whether
   spawners draw at all (a lair sprite or nothing); the settlement and frontier zoom views
   (🏠 👤 🏛️ 💰 📥) as small sprites.
4. **Powers and skills.** 116 powers in seven families and 57 skills in ~25: one icon per
   family, not per row, assigned through `iconFile` in the ECONOMY sheet; the Combat panel's
   section headings (🛡️ ⚔️ ✨ strings 522-526, 550-557) use the same icons.
5. **The rich status line.** Toasts, float-ups, the status bar, mail bodies and the "Grown on
   🌾 Wheat Plot" sentences are plain strings. The FTUE toast already renders `{icon:<file>}`
   inline (FTUE.js); extend that token to `{res:<Type>}` so any string can carry a resource's
   art, then convert the 122 toast lines and the 40 mid-sentence strings. Chat and
   conversation glyphs (Conversation.js) are NPC speech and wait for BL-17.
6. **Animals and pets** (BL-16): Cow, Sheep, Brown Cow, Ram, Goat (Pig has art), the 12 Zoo
   pets, their panel rows and the Buy / Pets cards.
7. **Avatars** (BL-17): the parts-based player avatar (docs/avatar-plan.md) on the board and in
   the Profile / Change Icon modals, then NPC avatars: the 12 enemies, the 7 spawners if they
   stay visible, Fairy, Santa Claus, The Porter, the Oracle, the RelationshipMatrix glyphs,
   the quest symbols and the conversation glyphs.

After pass 5 the only emoji left in the game are animals, pets and characters; after pass 7
there are none, and `scripts/build-atlas.js` can drop its Twemoji step.
