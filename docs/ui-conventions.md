# UI conventions

The standing rules for the game client's UI. Read this before any UI/UX change; add a rule
here when a treatment becomes something other surfaces must follow, instead of re-deriving it
per component. Where a rule lives in code, the file is named so you can check the current
value rather than trust this page.

## 1. Where the layout lives

- Desktop chrome is the phone pattern at desktop size, through the `--d-*` tokens in
  `App.css`: the board fills the window under the 60 px header and the full-width 24 px
  status bar (`--d-top`); the zoom pill floats top-left with the map button and the Quest
  (To Do) button under it, the season button top-right, and the nav is a horizontal bar centred along the bottom (the
  phone's portrait pill; `--d-nav-h`); 280 px panels (`UI/Panels/Panel.css`) float right of
  the zoom/map column and stop above the nav bar (`--d-nav-reserve`). The nav bar is the
  panel yellow (`--d-nav-bg`, `--color-bg-panel`) so it stands off the grass; its selected
  button is green (`--color-primary-green`). Same colours on phones. Modals in `UI/Modals/Modal.css`.
- The phone layout is ONE stylesheet, `UI/Styles/mobile.css`, imported last (in `index.js`) so
  it follows every component stylesheet. It re-positions the same elements; it never adds
  phone-only components. Three blocks: shared (both orientations), portrait
  (`max-width: 767px and portrait`), landscape (`max-height: 500px and landscape`). Add phone
  overrides there, never a scattered `@media` in a feature file.
- Geometry flows through the `--m-*` custom properties (header height, pill reserves, panel
  width); derive from them, do not hard-code a second copy of a number.
- Theme colours, fonts and shadows are the `:root` tokens in `UI/Styles/theme.css`
  (`--color-*`, `--font-*`). Reference the token, never the literal.

## 2. Modals

- **Modal widths: size a modal by its columns, not by the screen.** Every modal picks one tier
  (`UI/Modals/Modal.css`); none takes the bare default (80vw, up to 1000 px), which leaves a
  short row stranded in blank space on a desktop.

  | Tier | Width | Content | Phone portrait | Examples |
  |---|---|---|---|---|
  | `modal-small` | 320 px | one message or one fact, plus buttons | the same modal | GameDialog, Spend Gems, Begin, Email ask, Name Deed, Install prompt, ResourceModalSmall, Progress, a hint |
  | `modal-narrow` | 440 px | a list, or 2 to 3 columns (icon, name, mark; name, cost, button) | the same modal: 440 px is the phone's own modal width, so ONE layout serves both | Quest for Hope, Language picker, Share, Snug travel, Level Up / Train complete, Revival, Gold Pass benefits, bulk results |
  | `modal-medium` | up to 600 px | reading text or a wrapping grid | the same modal, reflowed | Privacy policy, Off-season notice, Change Icon grid |
  | `modal-large` / `-xlarge` (or a feature's own wide box) | 800 to 1000 px | a table of 4+ columns the player compares across | its own portrait layout in `mobile.css` (rows become cards: `res-rows`) | Trading inventory, Inventory manage (backpack / warehouse), Eating, Global Market, Store, Mailbox, bulk select (harvest, animals, crafting), Avatar |

  A new modal starts at the narrowest tier its content fits. Going wide is a commitment: it
  needs a phone portrait version, so prefer fewer columns over a wide modal.

- **Never the browser's dialogs.** No `window.confirm`, `window.alert` or `window.prompt` in
  anything a player sees: they look like the operating system, not the game. Ask with
  `await gameConfirm({ message, confirmLabel, danger })` and tell with `gameAlert({ message })`
  (`UI/Modals/GameDialog.js`; promises, callable from anywhere; one `<GameDialogHost />` at the
  app root, above every panel and modal). A destructive confirm (delete, remove) passes
  `danger: true` and names the action on the button ("Delete", not "Yes"). Gem spends keep their
  own confirm (`GemSpendConfirm.js`). A confirmation that needs no answer ("Copied to
  clipboard") is a quick notice (§4), not an alert. Developer-only tools (`Utils/debug.js`,
  `Utils/WorldGeneration.js`, `Dev/`) may still use the browser's.

- Every modal is `.modal-overlay > .modal-container` with a size class (`modal-small` 320 px,
  `modal-medium` 50vw/600 max, `modal-large` 80vw/800 max, `modal-xlarge` 90vw/1400 max; the
  bare container is 80vw/1000 max). Use `UI/Modals/Modal.js` (`size`, `className`, `title`)
  unless the modal needs its own overlay behaviour.
- Modals render through a portal to `document.body` (`createPortal`). Panels on phones are
  animated with a transform, which would otherwise make the panel the modal's containing
  block and squeeze it to the panel's width. Keep every new modal on that path.
- **On a phone a modal is never wider than 90% of the screen.** The shared rule in
  `mobile.css` sets 84vw with a 440 px cap, centred, with `max-height: 82dvh` (60vh for
  `modal-small`, 80dvh for the story modal), and it is written with `body .modal-overlay`
  specificity so a feature stylesheet's desktop width (Mailbox's 800 px, for example) cannot
  leak onto phones. A feature stylesheet may size its modal for desktop; it must not use
  `!important`, inline widths, or a selector heavier than `body .modal-overlay .x`.
- The NPC greeting, Eat Food, Choose Avatar, level-up, revival, share, language,
  service-status, Mailbox, Trade Stall inventory (`.inventory-modal`) and Carnival logic
  modals all follow this. A modal opened FROM a panel (Trade Stall, Inventory, Carnival) is the
  usual offender: it must still portal to `document.body`, never render inline in the panel.
  Custom overlays (`.inventory-modal`, `.carnival-logic-modal-overlay`) are listed in the
  phone width rule in `mobile.css`; add any new one there.
- Resource management modals (Trading Post item picker `UI/Modals/TradingInventoryModal.js`,
  Manage Backpack / Warehouse `GameFeatures/Inventory/ManageContentsModal.js`, Eat Food
  `GameFeatures/Eating/Eating.js`) are tables on desktop and two-line rows on phones: line 1
  the item name with small labelled facts at the right, line 2 the stepper (−, field, +, Max)
  with the action button at the right; the header becomes sort chips. One block in
  `mobile.css` does it from role classes on the cells: `.res-rows` (container),
  `.res-rows-head` / `.res-rows-body`, and per cell `.res-name`, `.res-meta` (with a
  `data-label` that prints before the value), `.res-amount`, `.res-gain`, `.res-action`. A new
  table of this kind adds those classes instead of a phone stylesheet of its own. Row text is
  `--font-text-2-family`: Berkshire Swash (the page default in `App.css`) is for headings only,
  so any table or list that sits outside `.modal-content` must set the body font itself.
- `UI/Modals/ResourceModalSmall.js` is the standard "what is this and where does it come
  from" pop-up (icon, the resource name as the title, a "Grown on / Made at / Collected from /
  Found in the Valley / Dropped by ..." line from `Utils/resourceSource.js`, ingredients for
  crafted goods; strings 17001 to 17013). Open it when a resource icon has no action of its
  own: Kent cards the player cannot trade, Train orders and claimed Carnival offers they
  cannot fill, and trader offers they cannot afford (NPC panel). The tap target is the WHOLE
  card, not just the icon: a card whose requirements are not met opens the modal wherever it
  is tapped, for the first item the player is short of (Kent `itemsWithQty`, trader lines
  carry `data-resource` / `data-short`). Cards that are disabled for another reason (cooldown,
  level, someone else's claim) do nothing. A disabled `<button>` swallows taps on its children,
  so those cards get `pointer-events: none` when disabled and the wrapper around them catches
  the tap; the card's look must not change (no new colour for "cannot afford").
- The bulk selection modals (Farm Hand harvest, Rancher animals, Crafter crafting) share
  `GameFeatures/FarmHands/BulkSelectModals.css`: a toolbar of labelled Select All / Deselect All
  groups, rows of role cells (`.bs-check`, `.bs-name`, `.bs-meta`, `.bs-opt` with a `data-label`,
  `.bs-cost`) and the commit button. On phones (the `bulk-select` block in `mobile.css`) the
  column header goes, each group gets its own full-width row, and a row with a cost wraps to
  two lines (checkbox, name, station; then the labelled second checkbox and the cost); the
  name toggles the row's checkbox. A new bulk modal uses these classes, not inline widths.
- Full-screen modals with a commit button over scrolling content pin the footer below the
  scroll area; do not float a button over the content.
- Multi-column modal layouts (the Store's paired and tripled offer cards) collapse to a one-
  item-per-row feed on phones; add the phone rule in `mobile.css` next to the Store block
  rather than building a second mobile component.

## 3. Panels (the right-hand slide-ins) and the Map panel

- Desktop: panels float over the board right of the zoom/map column (`--d-panel-width` 280 px,
  rounded, shadowed, z-index 990 under the nav bar's 1000), slide in from the left and back out
  on close (`panelLeftIn/Out` in `App.css`; the exit is the same ghost clone as on phones,
  `UI/Panels/panelExitGhost.js`, which runs on every layout). Closed with `.panel-close-btn`.
  One panel open at a time (`UI/Panels/PanelContext.js`). When panels switch, the new one
  slides in ON TOP of the old one's ghost (ghost z-index 989, panel 990) on every layout. On
  desktop the zoom pill and map button (995) sit above panels; on phones it sits behind them (980).
- Scrolling content fades out over its last 20 px while there is more below, on every
  layout: `UI/Panels/scrollFade.js` (installed once from App.js) finds every vertically
  scrolling box inside a `.panel-container`, including a feature panel's own
  inner list above a footer, and toggles `scroll-fade--more` (a mask in `scrollFade.css`) as
  it scrolls; the fade disappears at the end so the last line is never dimmed. Nothing to
  wire per panel; a new panel gets it as long as its scroller is a real `overflow-y: auto`
  box rather than the window.
- Right panels (desktop only): How to Play, Season, Leaders and Town News are `RIGHT_PANELS` in
  `UI/Panels/Panel.js` and get `panel-container--right`: the same box docked at the window's
  right edge, sliding in and out from the right. On phones every panel is a left panel
  (`mobile.css` overrides the class). Add a panel to that set to make it a right panel.
- The desktop header's left block is
  the phone's two-row grid (name, gems, money; then level, health, inventory with bars), the
  title sits at the left on two lines, and the right block is Settings, Chat, Help over
  Leaders, Language, Share.
- Phones: the nav is a floating iOS-style pill over the board (horizontal along the bottom
  in portrait, vertical at the left in landscape). Panels (the Map panel
  included) and the chat share one box docked at the left,
  `--m-panel-width` (58vw portrait, 33vw landscape, 400 px cap), z-index 990 so they slide
  BEHIND the pill (1000). They slide in from the left and back out on close in both
  orientations; the exit is a static clone of the removed node (`UI/Panels/panelExitGhost.js`),
  so every close path animates. Keep `--m-anim-in` / `--m-anim-out` and the ghost timer in step.
- Phones: the avatar never moves while a panel is open. A tap on the board with a panel open
  is a DISMISS (`onBoardTap` in `App.js` returns true and `PixiRenderer.handleClick` stops):
  the panel closes and nothing else happens, no walk, no interaction. The one exception is a
  tap that places from a placement cursor: it places; the Farming and Tools panels stay open
  for it (repeated planting / tilling), any other panel that armed the cursor closes. Add to
  that exemption deliberately, not per feature.
- When a panel action needs the avatar visible (relationship actions), call
  `revealPlayerBesidePanels()` so the camera eases the avatar into the uncovered part of the
  board; never move the panel.
- The zoom buttons are their own small pill (portrait: top-left under the status bar, z 980,
  so panels cover them; landscape: the header's first column). They are not children of the
  nav pill: its backdrop-filter would make it their containing block. The right-hand HUD stack
  at the board's top-right is Season, Town News (in phone landscape: Season, Map, Quest, Town
  News). The Quest button (`.map-controls.quest-controls`, 📜) rides with the Map button,
  directly under it (left column on desktop and in portrait, moved there 2026-10-14; under Map
  on the right in landscape), and toggles the To Do list (`QuestPanel`; it left the nav bar
  2026-10-11). It is the fly target `quests`: an accepted quest's 📜 flies into it. Its badge at the lower
  left (`.hud-badge`) is the quest-ready ✅ (`assets/overlays/checkmark.svg`) when a quest can be
  turned in, a yellow "?" when quests are active but none is done
  (`GameFeatures/Quests/questBadge.js`). The season button (📅, opens the Season panel,
  `.season-controls.season-main`) is the top of the right-hand stack. The map button (`.map-controls`, 🗺️) is its other twin: under the
  zoom pill on desktop and in portrait, under the season button in landscape (zoom lives in
  the header there). It toggles the Map panel (a second tap closes it); on phones it sits
  behind an open panel like the zoom pill, so the panel's × or a board tap closes it there.
  The Town News button (`.season-controls.news-controls`, 📰, toggles `UI/Panels/TownNewsPanel.js`)
  sits right under the season button on desktop and in portrait, and under the map button in
  landscape (BL-11).
  Both timed buttons carry a condensed countdown under them (`UI/HudCountdown.js`): Season the
  season's end, Town News the soonest of Train / Bank / Carnival; white with the crafting-slot
  shadow, red under an hour. A button stacked under a timed one leaves `--hud-countdown-h`.
  Short timers use `formatCompactCountdown` (`UI/Timers.js`): at most two units, "2d 4h" /
  "3h 12m" / "4m 30s" / "45s" (crafting slots too, which stay white).
- The Map panel (`ZoomedOut/MapPanel.js`, formerly the base panel / Home sheet) is an
  ordinary `Panel` whose box ends where its content ends (`height: auto`, capped at the usual
  panel height per layout: `[data-panel-name="MapPanel"]` in `Panel.css` and `mobile.css`): map, range note, plus the keyboard Controls
  text on desktop only (`.map-panel-controls`). How to Play lives in the header icon row (❓) on every layout. The
  "Have Feedback?" block is `UI/Panels/FeedbackLinks.js`, at the bottom of the Settings panel;
  its two buttons (`EmailUsButton`, `DiscordButton`) also open How to Play.

## 4. Header, status bar, notifications

- **Three ways to tell the player something**, by weight: a **quick notice**
  (`showQuickNotice(message)`, `UI/QuickNotice.js`: one short line in a dark pill at the top
  of the board where the toasts land, above every modal, fades away after ~1.6 s, never takes a tap) for a confirmation that
  needs nothing back, e.g. "Copied to clipboard"; a **header toast** (`showNotification`,
  `UI/Notifications`) for news and FTUE instructions (it sits behind modals, z 985); a **game
  alert** (`gameAlert`, §2) only when the player must acknowledge it.

- Phone header rows are fixed by orientation (see the `mobile.css` header comment): portrait
  row 1 is the name at the left edge and gems + money at the right edge (16px), row 2 the
  three bar stats (level, health, inventory) with their fill bars centred as a group, row 3
  the icon-only command row centred; landscape is the zoom column, the two-line title, then
  the control rows. Row 1's two items are absolutely positioned against the full-width grid
  with `grid-column: auto`: a positioned grid child with a grid placement is boxed to its
  grid area, not the container.
- Secondary header commands render icon-only on phones through `headerLabel()` in `App.js`;
  the desktop keeps text labels. Add a new header command to both branches.
- The status bar sits directly under the header and the board under it; nothing else
  scrolls (the document is kept 1 px taller than the viewport so a board tap can nudge
  Safari's bars away).
- Notifications (toasts) drop down from behind the header and status bar, centred, and slide
  back up the same way on dismiss (`toastIn`/`toastOut` in `UI/Notifications/Notifications.css`;
  the component adds `notification-exiting` and unmounts after the exit). The container is
  fixed at the status bar's bottom edge (`--d-top` / `--m-top`) with `overflow: hidden`, so
  the slide is clipped at that edge and the toast appears to come out from behind the chrome;
  z-index 985: above the zoom pill (980 on phones) but below every panel (990), the status
  bar and the header, so a toast never competes with a panel. Tap to dismiss;
  auto-dismiss after 4.6 s unless the type is in the persistent list. Phones only change the
  width (nearly full width, 440 px cap). Dev hook: `window.__showNotification(type, data)`.
- Landscape phones keep `env(safe-area-inset-left)` clear with a black strip (iPhone camera
  housing); `viewport-fit=cover` supplies the inset.

## 5. Buttons and controls

- **Every tappable control is one of these kinds**, and takes its look from it. Feature CSS
  may set layout (width, margin, flex, order) but not the face (font, color, radius, shadow,
  press):

  | Kind | Where | Look |
  |---|---|---|
  | Action button | `.shared-buttons .btn-basic` + role + size (`SharedButtons.css`) | Lora bold 14, leaf face, `--btn-radius` 12, `--btn-shadow`, presses down 3 px |
  | Card button | `ResourceButton` / `QuestButton` (Kent offers, crafting recipes, shop items, quests) | Berkshire title, Philosopher details, radius 12, `--card-shadow`, state color = leaf (ready) / gray (short, inactive) / sell green (collect) |
  | Chrome button | nav bar buttons, zoom / map / season pills, header links (`App.css`) | round or pill, `--d-pill-*` / `--d-nav-*` tokens |
  | Close | `<CloseButton />` (`UI/Buttons/CloseButton.js`, class `.close-btn`; `corner` pins it to a modal's top-right) for every panel, modal and chat window | one drawn ×, 32 px box, ink, red on hover |
  | Tab | `.tab-button` (`Panel.css`) | Lora, underline when active |
  | Stepper | the `+` / `−` / `Max` beside an amount input | `--btn-radius-sm`, `--btn-shadow-sm` |
  | Dismiss badge | the small round × on a card (Kent offer, notification) | `--radius-round`, berry face |
  | Text link | "Already have a profile?", "Dismiss all" | `--font-body`, `--color-text-link` (or `negative` for destructive), no face |

  Button shape and press are tokens (`--btn-radius`, `--btn-radius-sm`, `--btn-shadow`,
  `--btn-shadow-sm`, `--btn-shadow-pressed`, `--btn-press`, `--card-shadow`); a new kind of
  button is added here and to `theme.css`, not invented in a feature stylesheet.
- Buttons use the shared classes in `UI/Buttons/SharedButtons.css` inside a
  `.shared-buttons` wrapper: `btn-basic` (the foundation every button takes) plus a role:
  `btn-success` (confirm/collect), `btn-neutral` (cancel/secondary), `btn-danger`,
  `btn-gold` (premium/gems), `btn-sell`, `btn-collect`, and a size: `btn-mini`, `btn-modal`,
  `btn-modal-small`, `btn-header`. No ad-hoc button styling in feature CSS.
- Button `:hover` rules live inside `@media (hover: hover) { }`. On touch screens `:hover`
  sticks after a tap, so an unguarded hover colour (the ResourceButton's is near-white) leaves a
  tapped button looking spent until something else is tapped (BL-3). Some phones claim
  `(hover: hover)`, so the ResourceButton, QuestButton and Carnival resource-button hover rules
  also require `:where(html:not(.touch-ui))`: `installTouchClass()` (`Utils/inputMode.js`, run
  from `index.js`) puts `touch-ui` on `<html>` on a touch-first device, and `:where` adds no
  specificity, so `.disabled` and the state colours still win. Those cards also set
  `-webkit-tap-highlight-color: transparent`: on touch, a tap changes nothing but the press
  (owner 2026-10-09, "let's see how that feels"). A transaction-mode button
  stays locked until its handler returns, so do not await follow-up refreshes inside it.
- No hovertips on touch screens (BL-4). Every hover tooltip checks `canHover()`
  (`Utils/inputMode.js`) before it opens (false on any touch-first device, even one that
  reports `(hover: hover)`); touch browsers fake mouseenter on a tap, so an
  unguarded tip pops up under the finger and sticks. Whatever a tip says that the player needs
  goes on the control itself: the gem button prints its cost (`💎12`, blue on the pale-blue
  chip, every layout), the crafting station prints the next slot's unlock cost under the slots
  and a gem slot's price on its lock. Secondary details go behind the ℹ️ badge,
  `UI/Buttons/InfoButton.js` (resource buttons, trophy cards): hover on desktop, a TAP on touch
  opens it under the badge and the next tap anywhere closes it; the tap never reaches the
  control underneath. Render it outside a `<button>` (a disabled button swallows taps). The
  board's long-press tooltip is a touch gesture, not a hovertip, and stays.
- Touch targets on phones are at least 44 px (nav pill buttons are 44 to 52 px); keep that
  for any new tappable control.
- Optimistic UI is a house rule: react on the input (sprite, VFX, SFX, local state), fire the
  server call in parallel, revert only on a real conflict. Doober collection
  (`ResourceClicking.js`) is the reference; never gate the visual on the round trip.

## 6. Board interaction

- A tap is the browser's click, routed by `handleClick` in `Render/PixiRenderer/PixiRenderer.js`:
  avatar opens the Player Character panel; in-range NPC or resource interacts; an out-of-range
  helper NPC is walked up to (stopping beside it) and opened on arrival; an out-of-range
  resource or empty tile is walked to; beyond the grid edge walks to the edge and crosses.
  Long-press shows the tooltip, pinch zooms, one-finger drag and the wheel pan the camera.
- Line of sight is one rule, `isWallBlocking` in `Utils/GridManagement.js`: walls and doors
  block everything; `{ trees: true }` adds impassable trees, and every NPC interaction (talk,
  quest, heal, the citizens' waiting check) and every swing (yours and an enemy's) passes it.
  Resource clicks do not, so a tree behind a tree can still be chopped; an enemy still sees and
  chases you past a tree, it just cannot hit you through one. Multi-tile blockers block their
  whole footprint (shadow tiles resolve to their anchor).
- Hit-testing uses `PixiCamera.screenToTile`; never read `.pixi-container` offsets. DOM that
  must line up with the world goes inside `.pixi-world-container`.
- Movement cadence is `MOVEMENT_STEP_MS` (90 ms) with `HOLD_REPEAT_DELAY_MS` before a held
  key's second step, so a key tap moves exactly one tile.

## 7. Copy and strings

- All player-facing text comes from `UI/Strings/strings<LANG>.json` (ten languages); never a
  literal in JSX. Add a new key to every language file; the six files that are still English
  for a key carry the English text rather than nothing.
- No em-dashes. Use commas, colons, or two sentences.
- Any string that tells the player how to move or interact ("click", keys) gets a
  `<key>_touch` sibling with "tap" wording and no keyboard hints. `useStrings()` resolves the
  sibling automatically on coarse-pointer devices (`Utils/inputMode.js`); call sites just read
  `strings[key]`.
- Keep choice and button labels short; icons/emoji carry meaning in the header and nav, with
  the text label available on desktop.

## 8. Motion and feel

- Panel slide: 260 ms in, 220 ms out. Camera: zoom ease 220 ms, pan return 350 ms. Movement
  animation equals the step cadence (90 ms). Match these before inventing a new duration.
- Combat feedback (`Render/PixiRenderer/CombatFX.js`, all on the board, no panels): swing
  lunge 90 ms out / 120 back; enemy hit = 140 ms flash + 0.22-tile knockback + an 18 % pop
  around the sprite's CENTRE (the knockback pivot is computed from the resting scale so the
  pop never grows from a corner); damage numbers rise 0.9 tile over 900 ms; every hit also
  throws seven bright chips off the sprite away from the attacker (`VFX.createImpactEffect`,
  0.13-0.22 tile, ~400 ms, no stars, always smaller than a death burst); on death the body
  flashes and shrinks out of its centre in 220 ms, no rotation, under a dark-red chunk burst
  from 60 ms (`VFX.createNPCDeathEffect`, 11 chunks of 0.22-0.38 tile, keyed by the
  template's `deathVfx`, default `chunks`); the drop falls in at 420 ms and bounces to rest
  with weight (`CombatFX.dropBounce`, 650 ms, the board's own atlas frame so the art never
  changes when the real sprite takes over, which is held hidden meanwhile), and "+XP" rises
  from the drop's tile at 1,050 ms, nothing else (no skull), so a kill reads as one event;
  sounds: the swoosh (`attack_miss`) is the miss, `attack_hit` plays when a blow lands
  (`Sound/SFXMap.json`, one of sfx_plant / sfx_plant2 at random); enemy
  wind-up 300 ms; projectiles only from a `ranged` weapon or a reach > 1 enemy, 70 ms per
  tile (min 140); cooldown ring 0.62-tile radius; enemy hp bar only while engaged, lingers
  2.5 s then fades 400 ms, destroyed on the kill.
- Enemy hover tip (desktop): placed up-and-right of the cursor (`placement: 'up-right'`),
  never centred over the sprite, so the enemy and the swing stay visible mid-fight.
- NPC facing: the sprite flips only on a horizontal step (up/down keeps the last facing),
  relative to the art's native facing in `artFacing` (resources.json: `left` for animals and
  beasts, `front` for people, which never flip); no random turns in place.
- Grid-change fade (`UI/TransitionContext.js`): 250 ms to black, 400 ms back. A crossing pays
  both back to back, so together they are the floor of every grid change; keep them a short
  breath, not a scene change (they were 600 / 900 until 2026-10-07 and read as "slow"). The
  overlay stops blocking taps the moment the fade-up starts, since the new grid is already in
  place. The fade stays until grid-to-grid travel is seamless (docs/phase-3-contract.md §4.3).
- Rewards fly home (2026-10-13): a reward the player just earned rises as a floating text and
  then flies into the header counter it adds to, which pulses on the hit and only then rolls up
  (`UI/FlyToTarget.js`). Use `FloatingTextManager.addFloatingText(..., { flyTo })` on the board
  or `addFloatingTextAt(text, clientX, clientY, { flyTo })` on the UI; targets are elements with
  `data-fly-target`: `money`, `gems`, `xp` (Level + XP bar), `inventory` (Inventory + capacity
  bar), `skills` (the Skills button on the nav bar: a skill bought in a Skills panel, "+Grower Skill",
  string 10201), `combat` (the Combat button on the nav bar: a power, i.e. a weapon, armor or magic,
  bought in a shop: Warrior's Den, Armory, Magic Shop; `ShopStation.js`). Money goes to `money`, Gems to `gems`, XP to `xp`, any doober to `inventory`; anything
  else (skills, powers) rises and fades. A header number that a flight lands on reads
  `useHeldValue(value, key)`. Timing: rise and hold 0.9 s, flight 620 ms accelerating (cubic
  ease-in along a curve that keeps the upward momentum), hit pulse 520 ms; several rewards
  stagger by ~180-260 ms. In use: Kent sales (from the sold card), Mailbox Collect (from the
  message's reward line), Train orders (from the order card), crafting-station slot collection
  (from the slot; a craft that makes an NPC only rises), the Ancient Temple (from its collect
  card, on collecting the revealed reward only; skills, powers and NPCs only rise).
  Bank sales (from the offer card), quest rewards in a quest giver's panel (from the quest card,
  `data-quest-card`; the reward to its counter / Skills / Combat / Inventory, then its XP to `xp`), pet rewards in the Pet panel (from the Collect card; reward, then XP;
  feeding a pet, like starting a scroll reveal, shows no floating text), Trophy gem rewards
  (from the trophy card, `data-trophy-card`), Trade Stall payments (from the sold slot, with the
  burst), Carnival orders (from the order card, with the burst), Farm House collection (from the
  recipe card; an animal only rises), and the "+XP" of a combat kill (rises from the drop tile, flies to `xp`; the caller
  registers the flight at the kill so the header waits, `options.registered`). Accepting a quest
  in a quest giver's panel sends a 📜 from the card to `quests` (the To Do button). Not used, on
  purpose: farm-animal and other map doobers, bulk harvest/crafting (too noisy), any spending, and
  the Store (its rewards go to the Mailbox and the checkout sits in between; Mailbox Collect flies
  them home). Size: every flying text is 16px, set once in `UI/FloatingText.css`; callers pass no
  `size`.
  A sale whose card stays (Train, Trade Stall, Carnival) also gets the sparkle
  burst (`UI/SaleBurst.js`) and a `.sale-pop` on the card; Kent's sold card bursts away instead. Floating texts and flights sit above
  every modal and the FTUE scrim.
- **Cards that leave a list** (quest givers' panels, `NPCsPanel.js`; Bank offers, `Bank.js`; traders' offers (Falstaff, the Apothecary ...), `NPCsPanel.js`; collected Mailbox messages, `Mailbox.js` (the row pops, then its slot collapses and the server's list is applied only after, so nothing jumps; the Mailbox modal is a fixed height, 640 px / 80vh, 82dvh on phones, with the list scrolling inside); the motion of Kent's slots). Single-card panels that cycle offer → countdown → Collect (the Ancient Temple, `ScrollStation.js`; a Zoo Animal / pet, `PetPanel.js`) use the same cycle on their one card slot (`.card-fx-slot`): collecting pops it with the burst and the next card slides in at 1.5 s; starting a reveal or a feed is a spend, so the card leaves without sparkles (`runCardReturn(..., { out: 'leave', returnMs: 700 })`) and the countdown slides in. Repeatable offers (Bank, traders) run one shared cycle, `runCardReturn` in `UI/SaleBurst.js`: pop with the burst, the slot empty for a beat, the same card slides back in from the left and lands at 1.5 s (the Bank's spam-guard cooldown), untappable while it is gone. Quest cards:
  on the tap the card goes (house rule: the server runs in parallel and a failure brings it
  back). Completed with a reward: `.card-fx-pop` plus `<SaleBurst />`; taken without one (a quest
  accepted): `.card-fx-leave`. If the same card comes straight back (a repeatable quest) it
  slides in fresh (`.card-fx-slidein`); otherwise its slot collapses (Web Animations, 280 ms) so
  the cards below glide up into the gap, never jump. Classes in `UI/SaleBurst.css`.
- Preview the change on a phone viewport (375x812 portrait and a 500 px-tall landscape) as
  well as desktop before calling it done; the two orientations have separate rules.

## 9. Typography (the style guide: fonts)

Every font decision comes from the tokens in `UI/Styles/theme.css`. A component stylesheet
never names a font family, a px size or a text color of its own; it picks a token or a text
class. `node scripts/check-styles.js` (in `game-client/`) reports every line that does not
(§11).

**Three families, one job each** (`--font-display`, `--font-heading`, `--font-body`):

| Family | Token | Used for | Never for |
|---|---|---|---|
| Berkshire Swash | `--font-display` | the logo, modal and panel titles, an NPC speaking (the Story modal), resource-card titles (ResourceButton/QuestButton `.resource-title`) | sentences, numbers, buttons |
| Lora, bold | `--font-heading` | every action button (`btn-basic`), sub-headings, tabs, section labels | paragraphs |
| Philosopher | `--font-body` | everything the player reads: sentences, numbers, costs, labels, inputs, tooltips (chosen 2026-10-19 over Arial for a fantasy, literary voice that keeps numbers clear; the trial sheet is `docs/art/font-trial.html`) | titles |

`--font-mono` is for developer tools only (debug panels, the GridState overlay). The page
`body` defaults to Lora (`App.css`): Berkshire is opt-in (a title role or `--font-display`)
and body text gets Philosopher through its role, so an element that sets nothing reads as a Lora
label, never as a decorative title. Section headings inside a panel's content use
`.panel-subheading` (Lora bold 18, title gold; `Panel.css`), not the panel-title face;
control labels such as the "Place with cursor" toggle use `.cursor-toggle-label`; a modal that names an action under its title splits them: the place as the Berkshire `.modal-title` ("Trading Post"), the action as a Lora `.modal-subtitle` under it ("Add Items to Sell"), never one "Place: action" string; Google Fonts loads Berkshire Swash, Lora and Philosopher (`public/index.html`); Arial is only the fallback while Philosopher loads. Form controls are the trap: a `<button>`, `<input>`, `<select>` or `<textarea>` ignores the page font and shows the system one (Arial), so `theme.css` sets text fields to the body font and makes buttons inherit, and a component built on a `<button>` (ResourceButton) names `--font-body` itself.

**Six text roles** (family + size + color, `--font-<role>-*`): `title-1` modal title (display,
28), `title-2` panel title (display, 22), `title-3` sub-heading (heading, 16, bold), `title-4`
card title (display, 18), `text-1` body (body, 14), `text-2` caption (body, 12). Reach for the
role first; use the raw scale below only when no role fits.

**The size scale** (`--text-*`, px, never `em`/`rem`): xs 12 · sm 13 · md 14 · lg 16 · xl 18 ·
2xl 20 · 3xl 22 · 4xl 24 · 5xl 28 · 6xl 32.
`--text-panel` (15) is the body size inside panels (`.panel-content`): Philosopher's small x-height
reads a step smaller than Arial did, so panel text and resource-card details (`--text-md`, 14) sit
one step up (2026-10-20).

- **A sentence is 14 px or more** (`--text-md`), on desktop and on phones alike: an
  instruction, a description, a modal's body, a hint, a status line. This is the rule the Email
  and Snug modals broke (13 px and 12 px sentences).
- **Fine print is 13 px** (`--text-sm`, class `.text-fineprint`): legal, privacy, "we never
  share your email", secondary table cells.
- **12 px is the floor** (`--text-xs`, class `.text-caption`) and only for things that are
  not sentences: counts, tags, timestamps, badges, a "Locked" label.
- Nothing below 12 px except the two in-board overlays whose size follows the tile, not the
  scale: the phone status bar (11 px) and timer text drawn over a board object or crafting
  slot (11 px). Mark them `style-ok`. Decorative glyphs (the butterfly VFX) are not text.
- **Phones use the same scale.** `mobile.css` may move a role up or down one step for room
  (a 22 px panel title can be 20), but never takes a sentence under 14 or fine print under 13.
- **Text inputs are 16 px** (`--text-lg`) on touch, or iOS zooms the page when one gets focus.
- Emoji drawn as icons (a 32 px 🐄 on a card) are icon sizes, not type: a literal px with
  `/* style-ok: icon */` is fine.
- A one-off size outside the scale needs a `style-ok: <reason>` comment; if two places want
  the same off-scale size, add a token instead.

**Weight**: bold (`--weight-bold`) for titles, buttons, sub-headings and the number that
matters on a card; regular for sentences. Line height `--leading-body` (1.4) for paragraphs,
`--leading-tight` (1.2) for titles and cards.

**Italics: three uses only**, each a class in `theme.css`:

| Class | When | Example |
|---|---|---|
| `.text-hint` | an aside that helps but asks nothing of the player | NPC panel "With a better relationship...", a quest's "return to ..." line |
| `.text-empty` | an empty state | "No candidates", "No one ran for mayor this election cycle." |
| `.text-quote` | in-world writing | the Town News, a letter, a sign |

Never italicise an instruction, a number, a button, a title, or anything in Berkshire
(it has no italic and the browser fakes one). Everything else that was italic (flavour lines,
"last updated", rarity notes) is regular text in the secondary color.

**Text colors** (`--color-text-*`): `primary` #333 for every sentence; `secondary` #555 for
labels, captions and hints; `muted` #6b6b6b for fine print and empty states (#888 was too
faint on the parchment panels); `title` (brand gold) for display titles; `heading` for
sub-headings; `positive` (leaf ink) for "you have enough", gains and success in a sentence;
`negative` (berry) for "you are short", losses and errors in a sentence; `warning`; `link`;
`white` on dark faces. A component that needs another text color adds a token here first.

## 10. Color (the brand palette)

- **Brand palette**: the `--brand-*` block at the top of `theme.css`: grass, forest, leaf,
  leaf-ink, gold, parchment, dirt, ink, berry, sky, sun. Every semantic token (`--color-*`,
  `--color-btn-*`, `--color-text-*`, `--d-pill-bg` ...) derives from these, so the game's look
  is tuned in one block.
- **Terrain palette**: `UI/Styles/tileColors.js` holds the tile-type colors (grass `g`, slate
  `s`, dirt `d`, water `w`, pavement `p`, lava `l`, sand `n`, snow `o`, cobblestone `x`,
  dungeon `y`, moss `z`, clay `c`), because the Pixi renderer and the editor need them in JS.
  `index.js` mirrors them onto `:root` as `--tile-<key>` before the first render, so a
  stylesheet that echoes the board (gridlines, the minimap, the dirt behind it) uses
  `var(--tile-g)`, and JS uses `getTileColor('g')`. No other file hard-codes a tile color.
  Grass and `--brand-grass` are the same green on purpose; change both together.
- Component stylesheets use tokens for text, faces, borders and shadows. Literal colors are
  allowed only for art: a gradient on a premium button, a VFX, a rarity glow, a social brand's
  own color (Facebook blue). Mark those `style-ok: art`.
- Surface tints are tokens too: `--color-bg-tint` (a footer or row set off from the panel),
  `--color-bg-row-hover`, `--color-bg-selected`, `--color-bg-positive-tint` /
  `--color-bg-negative-tint` (state chips), and the crafting-slot states
  `--color-slot-unlocked / -affordable / -affordable-hover / -crafting / -ready`. Text over the
  board (not parchment) that must read as urgent uses `--color-text-negative-on-dark`.
- State colors are shared, not re-invented per panel: ready/affordable = `--color-btn-primary`
  (leaf), inactive/short = `--color-btn-disabled` (gray), collect/sell = `--color-btn-sell`,
  danger = `--color-btn-danger`, premium = `--color-btn-gem` / `btn-gold`. Kent's offer cards
  and the crafting stations show the same two states the same way.

## 11. The style check

`node scripts/check-styles.js` (in `game-client/`) lists, per stylesheet, every font family,
px font size, sub-floor size, text or background color literal, italic and radius literal that
is not a token; `--list` prints each line and `--strict` exits 1. A line that genuinely needs a
literal says why on the same line: `/* style-ok: icon */`, `style-ok: art`,
`style-ok: tile overlay`. Run it after any styling change; the count only goes down.
