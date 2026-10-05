# UI conventions

The standing rules for the game client's UI. Read this before any UI/UX change; add a rule
here when a treatment becomes something other surfaces must follow, instead of re-deriving it
per component. Where a rule lives in code, the file is named so you can check the current
value rather than trust this page.

## 1. Where the layout lives

- Desktop chrome is the phone pattern at desktop size, through the `--d-*` tokens in
  `App.css`: the board fills the window under the 60 px header and the full-width 24 px
  status bar (`--d-top`); the zoom pill floats top-left, the nav pill under it, the season
  button top-right; 280 px panels (`UI/Panels/Panel.css`) float beside the pill. The base
  panel is the Home sheet on every layout: hidden until the 👸 nav button opens it, then a
  panel like any other (same box, slide and close button). Modals in `UI/Modals/Modal.css`.
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

## 3. Panels (the right-hand slide-ins) and the base panel

- Desktop: panels float over the board right of the nav pill (`--d-panel-width` 280 px,
  rounded, shadowed, z-index 990 under the pill's 1000), slide in from the left and back out
  on close (`panelLeftIn/Out` in `App.css`; the exit is the same ghost clone as on phones,
  `UI/Panels/panelExitGhost.js`, which runs on every layout). Closed with `.panel-close-btn`.
  One panel open at a time (`UI/Panels/PanelContext.js`). When panels switch, the new one
  slides in ON TOP of the old one's ghost (ghost z-index 989, panel 990) on every layout. On
  desktop the zoom pill (995) sits above panels; on phones it sits behind them (980).
- Right panels (desktop only): How to Play, Season and Leaders are `RIGHT_PANELS` in
  `UI/Panels/Panel.js` and get `panel-container--right`: the same box docked at the window's
  right edge, sliding in and out from the right. On phones every panel is a left panel
  (`mobile.css` overrides the class). Add a panel to that set to make it a right panel.
- The desktop header's left block is
  the phone's two-row grid (name, gems, money; then level, health, inventory with bars), the
  title sits at the left on two lines, and the right block is Settings, Chat, Help over
  Leaders, Language, Share.
- Phones: the nav is a floating iOS-style pill over the board (horizontal along the bottom
  in portrait, vertical at the left in landscape). Panels, the Home sheet (the base panel's
  phone form, 👸 button) and the chat share one box docked at the left,
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
  (`.season-controls`); the base panel no longer shows the season.
- The Home sheet is the base panel: map, range note, Town News, feedback links, plus the
  keyboard Controls text on desktop only (`.base-panel-controls`). How to Play lives in the header icon row (❓) on every layout. The
  "Have Feedback?" block is `UI/Panels/FeedbackLinks.js`, shared by the base panel and the
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
- Preview the change on a phone viewport (375x812 portrait and a 500 px-tall landscape) as
  well as desktop before calling it done; the two orientations have separate rules.
