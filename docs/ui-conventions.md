# UI conventions

The standing rules for the game client's UI. Read this before any UI/UX change; add a rule
here when a treatment becomes something other surfaces must follow, instead of re-deriving it
per component. Where a rule lives in code, the file is named so you can check the current
value rather than trust this page.

## 1. Where the layout lives

- Desktop chrome is fixed pixels: a 60 px nav rail, the 220 px base panel, 240 px slide-in
  panels (`UI/Panels/Panel.css`), a 60 px header (`App.css`), modals in `UI/Modals/Modal.css`.
  The board starts 300 px in.
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
- The NPC greeting, Eat Food, Choose Avatar, level-up, revival, share, language and
  service-status modals all follow this; the trading inventory modal (`.inventory-modal`) is
  the one custom overlay and is covered by the same phone rule.
- Full-screen modals with a commit button over scrolling content pin the footer below the
  scroll area; do not float a button over the content.

## 3. Panels (the right-hand slide-ins) and the base panel

- Desktop: panels are 240 px, overlap the base panel, z-index 999, closed with
  `.panel-close-btn`. One panel open at a time (`UI/Panels/PanelContext.js`).
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
  nav pill: its backdrop-filter would make it their containing block.

## 4. Header, status bar, notifications

- Phone header rows are fixed by orientation (see the `mobile.css` header comment): portrait
  is name + gems + money, then the three bar stats (level, health, inventory) with their fill
  bars, then the icon-only command row; landscape is the zoom column, the two-line title,
  then the control rows. Every portrait row is centred.
- Secondary header commands render icon-only on phones through `headerLabel()` in `App.js`;
  the desktop keeps text labels. Add a new header command to both branches.
- The status bar sits directly under the header and the board under it; nothing else
  scrolls (the document is kept 1 px taller than the viewport so a board tap can nudge
  Safari's bars away).
- Notifications are dismissable by tap, auto-dismiss after 5 s unless their type is in the
  persistent list (`UI/Notifications/Notifications.js`), span the width above the zoom buttons
  on phones, z-index 1500.
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
