# Parts-based avatar system: PLAN (2026-10-11)

The player avatar stops being one emoji picked from a list and becomes a head-and-shoulders
bust built from parts (skin tone, hair style, hair colour, eye colour, hat, clothes), in the
same look as the Citizen busts (`npc-kent.svg`, `npc-portia.svg` …). Equipment feeds it:
armour changes the clothes, an equipped weapon shows as a hand holding it, and weapons are
put away in Town and on the Homestead and drawn in the Valley.

Status: **slices 0 and 1 built 2026-10-12** (§3); nothing player-facing yet. The art pipeline
proper is a separate pass after the scaffolding (§9, decision 7); slice 1's prototype parts
come out of the existing Citizen busts.

## 0. What is built today (2026-10-12)

- **Assets**: `game-client/public/assets/avatar/` with `rig.svg` (guides), one folder per
  slot (`skin`, `hairBack`, `hairFront`, `facialHair`, `eyes`, `hat`, `top`, `hand`, `npc`),
  placeholder parts drawn to the rig (`*-01`), prototype parts assembled from the Citizen
  busts (`*-02`, `hair-03`), and `_lab/` (scratch: deconstruction candidates and render
  output, never committed, never atlased).
- **Catalogue**: `tuning/avatarParts.json` and `tuning/avatarPalettes.json`, editor sheets
  AVATAR PARTS and AVATAR COLOURS (§2.2); ECONOMY has `avatarTop` / `avatarHand` (empty).
- **Code**: `src/Avatar/avatarLook.js` (pure: z order, `defaultSpec`, `validateSpec`,
  `lookFor`, `equipFor`), `src/Avatar/avatarCompositor.js` (canvas + multiply tint, cached
  per look), `scripts/build-atlas.js` `avatar/` namespace, `Player.avatar` +
  `Player.avatarParts`, `utils/avatarCatalogue.js`, `POST /api/player/avatar`,
  `POST /api/player/avatar-part`. No client code calls any of it yet.
- **In-game developer preview (2026-10-14)**: the Player Character panel shows an **Edit
  Avatar** button under Change Avatar for developer accounts only
  (`GameFeatures/Social/PlayerPanel.js`). It opens `src/Avatar/AvatarModal.js`: the composed
  bust (blinking), a tab per slot with thumbnails of the current bust wearing each part, the
  swatches, the equipment line (the equipped weapon and armour, a grid-kind picker for the
  put-away rule), Starter look, Copy spec and Save (`POST /api/player/avatar`; the catalogue
  comes from `GET /api/avatar-catalogue` through `TuningManager.loadAvatarCatalogue`). The
  board does not draw the saved spec yet (slice 2).
- **Tools**: the editor's **Avatar Lab** tab (`tools/editor/client/tabs/avatarlab.js`;
  preview: launch `vvgame-editor-lab`, port 8772, or your own editor on 8770 after a
  restart) composes a bust from the sheets exactly as the game will; `tools/avatar/render.js`
  renders a spec, `--sheet` (every tone / colour / hair / hat / beard, open and blink) or
  `--parts` (every file alone over the rig) to PNG; `tools/avatar/deconstruct.js npc-x`
  splits a traced bust into colour groups (`_lab/npc-x/NN-hex.svg`, `groups.json`,
  `sheet.png`, `--zoom x,y,w,h` for a region); `tools/avatar/assemble.js --all` builds
  parts from `tools/avatar/recipes/*.json` (groups, region, clip / clipEllipse, mirror,
  recolour keep / white / black / grey / lum, fit, under / extra).
- **Prototype set (slice 1, revised 2026-10-14)**: ONE face and ONE pair of eyes, from
  Gertrude (`skin-03`: the head cut out of her silhouette as a bald head with ears and
  neck, her face lines tinted with it, six tones; `eyes-03`: her clean right eye mirrored,
  whites and lashes as drawn, brows, the iris tinted, a blink frame); hair: Juliet's bob
  (`hair-02`), Helena's leafy hair (`hair-03`), Gertrude's long hair (`hair-05`); Kent's
  beard clipped to a chin beard (`beard-02`); Cassio's tunic (`top-02`) and Gertrude's robe
  (`top-03`); Angelo's crown (`hat-02`) and Gertrude's tiara (`hat-03`), both paid. Every
  slot but face and eyes has a None. Hands stay placeholders (no weapon art in the busts).

## 1. What exists today (file:line)

| Piece | Where | Notes |
|---|---|---|
| Avatar field | `game-server/models/player.js:51` `icon: String`, default 😀; `avatarsUnlocked` (:114) | one emoji |
| Icon table | `game-client/src/Authentication/PlayerIcons.json` | 27 entries in `free` / `paid` / `platinum`, each `{ label, value (emoji), filename (pc-*.svg) }`; **Bunny points at `pc-octopus.svg`** (bug) |
| Art | `public/assets/playerIcons/pc-*.svg` (200×202), `public/assets/resources/npc-*.svg` (200×200) | busts fill the frame; atlas slot 256 px (`scripts/build-atlas.js:90-100`, namespace `playerIcons/`) |
| Picker | `UI/Modals/ChangeIconModal.js` | grid of emoji, 200 gems unlocks `paid` (`avatarsUnlocked`, Gold grandfathered :103), `freeOnly` for the FTUE beat (`FTUE.js:411`, `modalType: "icon"`); opened from `ProfilePanel.js:648` and `PlayerPanel.js:437` |
| Save | `Authentication/ChangeIcon.js` → `POST /update-profile { icon }` | the server accepts any string; only signup checks the free list (`routes/auth.js:55`) |
| Board render | `Render/PixiRenderer/PixiRendererPCs.js` | ONE pooled Sprite, texture = atlas `playerIcons/<file>` else Twemoji frame, `TILE_SIZE * 0.9`, anchor centre, **no facing flip**; state swaps the whole icon: 💀 dead, 🤢 hp < 100, 🏕️ camping, 🛶 boat (:72-76) |
| Combat hooks | `CombatFX.registerPC` (`PixiRendererPCs.js:268`) hands the display object to `playerLunge` / `playerHit` (tint flash) | works on any display object |
| Equip | `settings.equippedWeapon` / `settings.equippedArmor` (type strings), set by `Combat/CombatPanel.js:38-115` through `/update-profile { settings }` | weapon = `damage > 0`, armour = `armorclass > 0` (`utils/combatStats.js:14-15`, mirrored in `PlayersInGrid`) |
| Weapons / armour | `tuning/resources.json`, category `power` | 20 weapons (`ranged` flag), 9 "armours" of which **Sword of Song and Titania's Bow count as both** (they carry `armorclass`) |
| Grid kind | `currentPlayer.location.gtype` | `homestead` / `town` / `valley` / `dungeon` (the FTUE cave is a dungeon) |

Everything else that shows the avatar reads `icon` as TEXT:

- header avatar `<img>` from the svg map (`App.js:3159`, `:3392`)
- `ProfilePanel.js:106-203` (a free-text icon field in the profile form), `PlayerPanel.js:437`
- `CombatPanel.js:231` (`finalStats.icon`)
- `FTUE.js:429` (StoryModal symbol falls back to the player's icon)
- conversations: `Relationships/Conversation.js` `playerIcon` is the `player` topic (Greet shows it), drawn as a Pixi `Text` bubble by `PixiRendererSpeech.js`
- other players: `Leaderboard.js:120` (`{player.icon}`), `GlobalMarketModal.js:263,327`, from `/players` (`playerRoutes.js:1428` select)
- settlement / frontier view: `PixiRendererFrontierSettlements.js:116` (the "you are here" cell)
- chat stores no icon (nothing to do)

## 2. Target

### 2.1 Data

```
player.avatar = {
  v: 1,
  skin:      'skin',            // one tintable art; the TONE is a palette id
  skinTone:  'tone-3',
  hair:      'hair-bob',        // style id (catalogue)
  hairColor: 'hair-auburn',     // palette id
  eyes:      'eyes-round',      // style id
  eyeColor:  'eye-green',       // palette id
  facialHair: null | 'beard-full', // own layer, takes hairColor
  hat:       null | 'hat-straw',
  top:       'top-tunic-blue',  // the clothes when no armour is equipped
}
player.avatarParts = ['hat-straw', …]   // paid parts this player has bought (per-part pricing)
```

- Part and colour values are **catalogue ids, never file names or hex**: the server can
  validate them, the editor can rename art, and colours stay on the palette.
- `icon` stays for one release as the legacy fallback (a player who never opens the new
  picker still shows their emoji) and is then retired (§6).
- Equipment is NOT in `avatar`: the look is derived at render time from `avatar` +
  `settings.equippedArmor` + `settings.equippedWeapon` + the grid kind.
- **Citizens use the same spec.** An NPC row in resources.json may carry an `avatar` spec
  (a JSON column, or `avatar*` columns on the ECONOMY sheet) instead of a `filename`; the
  renderer composes it exactly as the PC. Parts with `tier: 'npc'` exist for them (Kent's
  hat, Portia's robe) and never appear in the player's picker.

### 2.2 Catalogue (tuning, editor sheet)

`game-server/tuning/avatarParts.json`, one row per part, edited in the VVGame Editor through
a definition in `tools/editor/sheets/definitions.js` (free sheet, validation, CSV import):

| column | meaning |
|---|---|
| `id` | persisted identifier (never renamed in place) |
| `slot` | `skin` / `hairBack` / `hairFront` / `facialHair` / `eyes` / `hat` / `top` / `hand` |
| `file`, `tint` | the drawing under `public/assets/avatar/<folder>/` and the palette slot multiplied into it (`skinTone` / `hairColor` / `eyeColor`, blank = drawn as is) |
| `file2`, `tint2` | a second drawing over the first with its own tint (an iris over the eye whites, a skin-toned fist under a weapon) |
| `backFile` | hair only: the hairBack drawing (hair is ONE row: `file` = hairFront) |
| `underHat` | hair only: the hairFront drawing under a hat that `hidesHair` (blank = that hat covers the hair) |
| `hidesHair` | hat only: true for a cap or hood that covers the head; false for a tiara or crown, which sits on the full hair |
| `blinkFile`, `blinkTint` | eyes only: the closed-lids drawing, replacing `file` + `file2` on the blink frame |
| `tier` | `free` / `paid` / `npc` (`npc` = Citizens only, never offered to players) |
| `gemcost` | paid parts: the price of THIS part (bought once, stored in `player.avatarParts`) |
| `label` | picker label (string key) |

`avatarPalettes.json`: named swatches per colour slot (`skinTone`, `hairColor`, `eyeColor`),
`{ id, hex, tier, gemcost }`. Facial hair takes `hairColor`.

Equipment mapping lives on the ECONOMY sheet (resources.json), two new columns:
`avatarTop` (armour → a `top` part id) and `avatarHand` (weapon → a `hand` part id). One hand
art per weapon FAMILY (sword, knife, bow, crossbow, spear, halberd, axe, darts) with a
per-weapon override when a weapon deserves its own (Dragonslayer, Titania's Bow).

### 2.3 The rig and the art

- One 256×256 frame for every part, measured from the Citizen busts (a 200 px bust scaled
  by 1.28 with its eye line moved to y 112): head centre (128, 118), eyes at x 96 / 160 on
  y 112, mouth y ~150, chin y ~190, neck x 108..148 under the top, shoulder line y 190,
  hand slot centre (204, 214). Layers stack with no per-part offsets; `rig.svg` holds the
  guides. A source bust is fitted by `assemble.js` (`fit.scale` 1.28, `fit.dy` per source so
  its eyes land on y 112).
- **Z order** (back to front): `hairBack` → `skin` (head and neck) → `top` (torso and
  collar, drawn OVER the neck) → `eyes` → `facialHair` → `hairFront` → `hat` → `hand`
  (bottom right, in front of the shoulder).
- **Look**: front-facing, storybook (the Citizen busts are the reference); no facing flip,
  ever, for any bust on this rig.
- **Colour by tint.** Tintable parts (skin, hair, iris) are drawn with WHITE fills, BLACK
  line work and grey shading. A multiply tint keeps black lines black, turns white into the
  swatch and greys into darker swatch: one hair drawing serves every hair colour, one skin
  drawing every tone. Hats and clothes are full-colour art (no tint), as armour will be.
- **Hats over hair.** A hat draws over `hairFront`. A hat that covers the head (`hidesHair`)
  shows the hair's `underHat` variant (flattened) or hides the hair; a tiara or crown sits on
  the full hair. This is the one cross-part dependency and it is data, not code.
- **Mouth / expression** stays part of the skin drawing (one friendly expression); no eye
  shapes: eyes are one drawing per catalogue row with a colour from the palette.
- Atlas: `build-atlas.js` gets an `avatar/` namespace (`avatar/<slot>/<file>`, slot 256 px);
  the parts land in the committed sheets like everything else. **Never a per-combination
  frame**: the combinations are composed at runtime (§2.4).

Art budget for v1: skin 1 drawing + 6 tones; hair 8 to 10 styles (× a few `underHat`);
facial hair 4; eyes 1 open + 1 closed drawing, 5 colours; hats 6; tops 6 free + a few paid;
armour tops 7 (Padding, Light, Chainmail, Plate, Heavy, Mystic, Caliban's Breastplate);
hands: one row per weapon (20), many sharing a drawing (every short sword one file), so ~10
drawings. Then the Citizens' own parts as they move onto the rig. **The art itself is a
later pass** (decision 7): the scaffolding ships with a handful of placeholder parts drawn
to the rig so every path can be verified.

### 2.4 The compositor (one module, two consumers)

`game-client/src/Avatar/avatarCompositor.js`:

- `lookFor(avatar, { equippedArmor, equippedWeapon, gtype })` → the resolved layer list
  `[ { frame, tint } … ]` and a **look key** (a short string of every input). Written for
  ANY bust: the PC and a Citizen go through the same call.
- `renderAvatar(look, size)` → a cached HTML canvas (256 px): draws each layer's atlas frame
  (or the raw svg before the atlas is built) in z order, tinted through an offscreen
  `multiply` pass. Cache by look key; a handful of canvases live at once.
- **Blinking**: every look renders TWO canvases, eyes open and eyes closed (`blinkFile`,
  lids in the skin tone). The board sprite shows the closed one for ~120 ms every 3 to 6 s
  (per-bust jitter, seeded like the NPC step cadence) from one shared timer in the renderer;
  DOM images never blink. Two cached textures per look, no per-frame drawing.
- Pixi: `PixiRendererPCs` keeps its ONE pooled sprite and sets `Texture.from(canvas)` (cached
  by look key, released on unmount like the svg cache today). `CombatFX.registerPC`, the
  lunge and the hit flash do not change. The NPC path in `PixiRenderer.js` uses the same
  textures for a Citizen whose resource row has an `avatar` spec.
- DOM: `<AvatarImage avatar equip size />` (`src/Avatar/AvatarImage.js`) draws the same
  canvas to a data URL for the header, Profile, Player panel, Combat panel, FTUE modal,
  Leaderboard, Global Market and the settlement cell. Other players are rendered from THEIR
  spec, so `/players` and the leaderboard payloads carry `avatar` next to `icon`.
- Speech bubbles: `PixiRendererSpeech` accepts a texture topic as well as an emoji, so the
  `player` topic (Greet) shows the player's own bust.

### 2.5 Equipment feed and the put-away rule

- Clothes = `avatar.top` unless `settings.equippedArmor` maps to an `avatarTop`; then the
  armour's top replaces it, on every grid kind (decision 3).
- Hand = the equipped weapon's `avatarHand`, drawn only when the grid kind is in the ARMED
  set: `valley` and `dungeon` (the FTUE cave included) yes, `homestead` and `town` no.
- Changing equipment or grid kind changes the look key, so the sprite swaps on the next
  render; no extra state.
- States: dead / camping / boat keep today's whole-icon swap (💀 🏕️ 🛶 as Twemoji frames).
  **Low health is a green tint on the bust**, the same mechanism as the red combat flash
  (`CombatFX.playerHit` sets `obj.tint`): the resting tint becomes green while hp is under
  the threshold, and `restTint` reads that resting value so the red flash restores to green,
  not white.

### 2.6 The picker

`ChangeIconModal` grows into `AvatarModal` (same mount points: Profile, Player panel, the
FTUE avatar beat with `freeOnly`):

- a live preview (`AvatarImage`) at the top, the slot tabs below (Skin, Hair, Eyes, Hat,
  Clothes); each tab a swatch or thumbnail grid (`AvatarImage` of just that layer on the
  current bust, so you see the hat ON your head);
- paid parts show a lock with their gem price; tapping buys THAT part (`gemcost`, spent
  through the one holdings rule, backpack first) and adds it to `player.avatarParts`.
  Players who already hold `avatarsUnlocked` (the old 200-gem unlock) or Gold get the v1
  launch set of paid parts written into `avatarParts` by the migration, so nothing they paid
  for is lost; parts added later are priced for everyone;
- Save → `POST /api/player/avatar { playerId, avatar }`: the server validates every id
  against the catalogue and the palettes and the tier against the player's entitlement,
  stores it, answers through `publicPlayer()`. `/update-profile` stops accepting `icon`
  and never accepts `avatar` (today anyone can POST any `icon`, including paid ones).
- The profile form's free-text icon field goes.
- Mobile: phone layout rules in `docs/ui-conventions.md` apply (full-screen panel box);
  the modal is a portal to `document.body` like every modal.

### 2.7 Server

- `avatar` on the Player schema (object with the fields above) and `avatarParts: [String]`,
  default = the starter look (first free part of every slot, tone 3) and no bought parts.
- `POST /api/player/avatar-part { playerId, partId }`: buys one part (validates the id, the
  tier, the price, spends the gems server-side, appends to `avatarParts`).
- `utils/avatarCatalogue.js`: loads `avatarParts.json` + `avatarPalettes.json` at boot,
  `validateAvatar(spec, player)` (ids exist, slot matches, tier allowed).
- `POST /api/player/avatar` (above). `createPlayerAccount` gives the starter look.
- `/players`, leaderboard and market selects include `avatar`.

## 3. Build order (slices; each ships on its own)

(Re-cut 2026-10-12 into slices 0 to 6, see the session plan; 0 and 1 are built, §0.)

- **A. Rig + catalogue + compositor + board render.** Parts folders, `rig.svg`, the two JSON
  files and their editor sheet, the atlas namespace, `avatarCompositor.js` (any bust, two
  canvases per look), `PixiRendererPCs` drawing a default spec for everyone (legacy `icon`
  still shown when `avatar` is absent), blinking, the green low-health tint, the equipment
  feed and the put-away rule, placeholder parts drawn to the rig (a few per slot) so every
  path can be seen. Verifiable on the rehearsal copy with hand-edited specs.
- **B. The picker + routes + validation.** `AvatarModal`, `/player/avatar`,
  `/player/avatar-part`, per-part entitlement, FTUE beat switched to it.
- **C. The other surfaces.** `AvatarImage` in the header, Profile, Player and Combat panels,
  FTUE modal, Leaderboard, Market, settlement cell; speech-bubble textures; payloads carry
  `avatar`.
- **D. Retire the emoji.** Migration gives every player a look and writes the launch paid set
  into `avatarParts` for `avatarsUnlocked` / Gold players; `icon` leaves the render paths,
  `PlayerIcons.json` and `playerIcons/` go, the atlas drops the namespace.
- **E. The art pass** (decision 7): the real parts in the storybook look, drawn to the rig,
  with the tint convention for skin, hair, facial hair and lids; then the Citizens' busts
  rebuilt as specs with their `npc` parts, one Citizen at a time (a resource row switches
  from `filename` to `avatar`; both work meanwhile). Every later batch is a data drop: svg +
  a sheet row + `npm run build:atlas`.

## 4. Gotchas (found while scoping)

1. **Two items are weapon AND armour.** `isArmor` = `armorclass > 0`, so Sword of Song and
   Titania's Bow can be equipped as armour (`CombatPanel` lists them in both). With an
   `avatarTop` column they would need a "top" that is a sword. Decide whether they keep
   their `armorclass` as a stat but are never listed as armour (an `isWeapon` first rule).
2. **The bust never flips** (decision 5). Citizens are front-facing art (`artFacing:
   'front'`), so a weapon hand on one side is fine; the renderer's facing flip must stay off
   for any bust on the rig.
3. **Hat × hair** is the only art dependency; it is handled by `underHat` data, but every new
   hair style must be checked under every hat shape (a checklist in the editor sheet).
4. **Tint needs white-and-black line art.** The Citizen busts are hand-coloured with
   coloured shading; tintable parts must be drawn the other way (white fill, black line, grey
   shade). Full-colour parts (hats, tops, armour) are drawn as the busts are.
5. **Every emoji text site becomes an image.** Leaderboard and Market render OTHER players'
   busts client-side from their spec; the speech bubble and the FTUE modal need a texture or
   `<img>` path; `findNPCTypeFromSymbol` in `Conversation.js` matches emoji strings and must
   not be fed the player's bust.
6. **Anyone can set a paid icon today** (`/update-profile` takes any `icon`). The avatar gets
   its own validated routes; `/update-profile` drops `icon`. Per-part gems are spent
   server-side (no new client-trusted `update-inventory` site).
7. **Twemoji fallbacks stay for states** (💀 🏕️ 🛶, decision 6).
8. **Atlas growth**: ~60 to 100 parts at 256 px is one more sheet; fine. Never bake
   combinations.
9. **iOS memory**: the compositor keeps a few 256 px canvases and textures, released on
   unmount like today's per-instance svg cache; no per-frame canvas work.
10. **`PlayerIcons.json` Bunny → `pc-octopus.svg`** is a live bug; fix in D or now.
11. **Localisation**: part labels are string keys; the picker copy gets `_touch` siblings if
    it says "click".

## 5. Not in scope

Body shapes, expressions / mouths, eye shapes, the share image, chat avatars.

## 6. Migration

One script (`game-server/scripts/`), backup first, run before the slice-D commit deploys:
every player without `avatar` gets the starter look; `avatarsUnlocked` and Gold players
get the launch paid set in `avatarParts` (no refund needed: they keep equivalent value);
`icon` is left in place untouched (read by nothing after D).

## 7. Numbers (for docs/tuning.md once decided)

| knob | today | plan |
|---|---|---|
| premium unlock | 200 gems, all paid icons; Gold grandfathered | per part (`gemcost` on the sheet); the old unlock and Gold map to the launch paid set |
| starter look | 😀 | first free part per slot, tone 3 |
| bust size on board | `TILE_SIZE * 0.9` | same |

## 8. Design questions

All answered 2026-10-11; see §9. New questions go here as they come up.

## 9. Decisions (owner, 2026-10-11)

1. **Legacy emoji avatars are retired.** Everyone gets a parts bust; the old 200-gem unlock
   and Gold map to the launch paid set (§6).
2. **Price per part.** Each paid part (and paid swatch) has its own `gemcost`; bought once
   into `player.avatarParts`.
3. **Armour is visible everywhere. Weapons draw in valley, dungeon and the FTUE cave**, and
   are put away in Town and on the Homestead.
4. **Hand art per weapon row**, duplicates allowed: every weapon names its `avatarHand`,
   and many name the same drawing.
5. **No facing flip**, for the PC or any bust on the rig.
6. **Low health = a green tint on the bust**, the red combat flash's mechanism. **Death,
   camping and boat stay emoji swaps** for now.
7. **No art source yet.** Front-facing storybook look; the art pipeline (drawing the parts,
   rebuilding the Citizen busts) is a pass after the scaffolding, with Claude's help.
8. **One extra slot: facial hair** (its own layer, `hairColor`). No expressions, no eye
   shapes. **Eye blinking is a feature** (§2.4).
9. **Citizens move onto the same rig**, with `npc`-tier parts players never get. The
   compositor and the catalogue are written for any bust from slice A.
10. `player.avatar`, `player.avatarParts`, `POST /api/player/avatar`,
    `POST /api/player/avatar-part`; `icon` goes after slice D.
