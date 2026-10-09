# UI conventions

The standing rules for the game client's UI. Read this before any UI/UX change; add a rule
here when a treatment becomes something other surfaces must follow, instead of re-deriving it
per component. Where a rule lives in code, the file is named so you can check the current
value rather than trust this page.

## 1. Where the layout lives

- Desktop chrome is the phone pattern at desktop size, through the `--d-*` tokens in
  `App.css`: the board fills the window under the 60 px header and the full-width 24 px
  status bar (`--d-top`); the zoom pill floats top-left with the map button under it, the
  season button top-right, and the nav is a horizontal bar centred along the bottom (the
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
- A tap on the board closes the open panel on phones (`onBoardTap` in `App.js`), EXCEPT the
  Farming and Tools panels, which stay open for repeated placement. Add to that exemption list
  deliberately, not per feature.
- When a panel action needs the avatar visible (relationship actions), call
  `revealPlayerBesidePanels()` so the camera eases the avatar into the uncovered part of the
  board; never move the panel.
- The zoom buttons are their own small pill (portrait: top-left under the status bar, z 980,
  so panels cover them; landscape: the header's first column). They are not children of the
  nav pill: its backdrop-filter would make it their containing block. The season button (📅,
  opens the Season panel) is the zoom pill's twin at the board's top-right on every layout
  (`.season-controls`). The map button (`.map-controls`, 🗺️) is its other twin: under the
  zoom pill on desktop and in portrait, under the season button in landscape (zoom lives in
  the header there). It toggles the Map panel (a second tap closes it); on phones it sits
  behind an open panel like the zoom pill, so the panel's × or a board tap closes it there.
  The Town News button (`.season-controls.news-controls`, 📰, toggles `UI/Panels/TownNewsPanel.js`)
  sits right under the season button on desktop and in portrait, and under the map button in
  landscape (BL-11).
- The Map panel (`ZoomedOut/MapPanel.js`, formerly the base panel / Home sheet) is an
  ordinary `Panel`: map, range note, feedback links, plus the keyboard Controls
  text on desktop only (`.map-panel-controls`). How to Play lives in the header icon row (❓) on every layout. The
  "Have Feedback?" block is `UI/Panels/FeedbackLinks.js`, shared by the Map panel and the
  bottom of the Settings panel.

## 4. Header, status bar, notifications

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

- Buttons use the shared classes in `UI/Buttons/SharedButtons.css` inside a
  `.shared-buttons` wrapper: `btn-basic` (the foundation every button takes) plus a role:
  `btn-success` (confirm/collect), `btn-neutral` (cancel/secondary), `btn-danger`,
  `btn-gold` (premium/gems), `btn-sell`, `btn-collect`, and a size: `btn-mini`, `btn-modal`,
  `btn-modal-small`, `btn-header`. No ad-hoc button styling in feature CSS.
- Button `:hover` rules live inside `@media (hover: hover) { }`. On touch screens `:hover`
  sticks after a tap, so an unguarded hover colour (the ResourceButton's is near-white) leaves a
  tapped button looking spent until something else is tapped (BL-3). A transaction-mode button
  stays locked until its handler returns, so do not await follow-up refreshes inside it.
- No hovertips on touch screens (BL-4). Every hover tooltip checks `canHover()`
  (`Utils/inputMode.js`) before it opens; touch browsers fake mouseenter on a tap, so an
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
- Preview the change on a phone viewport (375x812 portrait and a 500 px-tall landscape) as
  well as desktop before calling it done; the two orientations have separate rules.

## 9. Type sizes

- The scale is the `--font-*` tokens in `UI/Styles/theme.css`: title-1 28 px (modal titles),
  title-2 22 px (panel titles), title-3 16 px (sub-headings, timers), title-4 18 px (button
  titles), text-1 14 px (body and UI text), text-2 12 px (captions, secondary text). Use the
  token, not a bare number, when a new element fits one of those roles.
- **12 px is the floor for anything the player reads**: a hint, a timestamp, a tag, a
  "Locked" label, a progress count. Body text and anything with a number the player acts on
  (a cost, a quantity, an XP line) is 14 px or more; small modals that show one fact
  (`ResourceModalSmall`: 17 px line, 14 px ingredients) can go larger because there is room.
- Nothing below 12 px except the two in-board overlays whose size follows the tile, not the
  type scale: the phone status bar (11 px, one line of secondary state) and timer text drawn
  over a board object or a crafting slot (11 px). Decorative glyphs (the 7 px butterfly VFX)
  are not text.
- Size in `px` (or a token), not `em`/`rem`: `rem` ignores the phone's smaller panel text and
  `em` compounds (the Mailbox unread tag used to be 0.7em inside a 0.9em row inside the 13 px
  phone panel: 8 px). The sweep of 2026-10-05 brought every sub-floor site up (Mailbox,
  Inventory Gold Pass note, Trophy progress, relationship badge, BulkCrafting labels, minimap
  dungeon timer, Trade Stall and resource/quest button details); `grep -rn "font-size: 0\."`
  and `grep -rnE "font-size: (1?[0-9])px"` over `game-client/src` should stay empty apart
  from the two overlays above.

