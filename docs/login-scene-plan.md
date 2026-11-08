# The Login Scene: a living grid behind the Begin screen

BUILT 2026-11-08 (greenlit the same day; decisions in §7). As built: §3 holds, except the hand-off: Begin and sign-in both reload the page, so the scene never shares the screen with the game's board and needs no special teardown. The owner asked for more trees after the first look (forest density 0.68 in view, 0.58 beyond, a quarter of the glades treed).

## 1. What we are making

The key art behind the Begin modal and the sign-in panel (`KeyArtImage` + `LoginScreenButterflies` in `App.js`, the `showKeyArt` block) is replaced by a real, live grid:

- 64 x 64 tiles, drawn by the game's own renderer, so it always looks exactly like the game (atlas art, tile edges, the water shader, y-sort) and every future art upgrade lands here for free.
- No interactivity: no taps, no hover, no tooltips, no panning, no zoom, no player avatar.
- Fixed camera anchored at the grid's top-left corner. What matters sits in the top-left 32 x 32 tiles, because that is all a desktop browser shows. A phone shows less (see §4).
- Ambient effects: butterflies (as on a homestead) AND clouds (as in a valley), at the same time.
- Resources: mostly trees (Oak and Pine, with their autumn and light variants), plus a few rare, pretty finds: a handful of Daisies, and Mushrooms on a patch of moss (see Q1).
- Life: 2 Coyotes and 2 Bears wandering, and a Lumberjack walking from tree to tree and chopping them down.
- It never ends: felled trees grow back, so the forest never thins out however long the visitor waits.

## 2. Approach: reuse the real renderer in "scene mode"

Two ways were weighed:

| | A. The real `PixiRenderer` with a `scene` prop (recommended) | B. A separate, small Pixi scene |
|---|---|---|
| Looks like the game | Always, by construction | Only until the renderer next changes (the resource drawing alone is ~150 lines we would copy) |
| New code | Scene guards in the renderer + a small driver | A second tile/resource/NPC renderer |
| Risk | Touches the live renderer (guarded by one prop) | Duplicate code that drifts |

**Recommendation: A.** The renderer already takes everything as props (`grid`, `tileTypes`, `resources`, `npcs`) and already tolerates a missing `currentPlayer` almost everywhere (optional chaining). Only one Pixi application exists at a time, which matters on iOS.

## 3. The pieces

### 3.1 The layout: `game-server/layouts/gridLayouts/homestead/start-screen.json`

- The ordinary grid-layout format (`tiles` + `resources`, 64 rows of 64 codes), so it is drawn and edited in the VVGame Editor's Layouts tab like any other grid. It sits beside `homestead.json` in the homestead folder (owner 2026-11-08: "start screen"); homesteads always load `homestead.json` by name, so the extra file is never picked for a real homestead.
- I author a first version by script (`tools/login-scene.js`, deterministic seed), then you can hand-tune it in the editor.
- Ground: mostly grass, a dirt path wandering through, the moss patch for the mushrooms. Optional extra: a small pond in view, to show off the water shader (see Q6).
- Zones, planned for the framing in §4:

| Zone | Tiles | What goes there |
|---|---|---|
| Phone window | top-left ~10 x 20 | Every "hero" element visible at least once: trees, the Lumberjack's beat, a coyote, the daisies |
| Desktop window | top-left 32 x 18 | The full cast: both bears, both coyotes, mushrooms on moss, the clearing |
| Tall desktop | rows 18-32 | More forest, a second clearing |
| Outside 32 x 32 | the rest | Sparse forest only, so a very wide monitor (57+ tiles) still looks finished |

- Tree density: about 35-45 % of tiles in the forest areas, with clearings so the animals and the Lumberjack stay visible rather than hidden behind canopies.

### 3.2 Serving it: `GET /api/login-scene`

- Returns the layout JSON (cached in memory at boot and sent with a long `Cache-Control`). It reads nothing from the database, and needs no player and no auth.
- The client decodes the codes with `masterResources` (`layoutkey`), which is already loaded before the Begin gate (App init step 1).
- It is fetched in parallel with step 1 so it adds no wait.

### 3.3 Scene mode in `PixiRenderer` (`scene` prop)

When `scene` is set:

- **Input is off:** no click, pointer, wheel, pinch or long-press handlers; the cursor is the default arrow.
- **Not mounted:** PCs, speech, NPC overlays (hp bars, quest marks), cursor, doinker and the settlement/frontier previews.
- **Camera:** placed once, with no follow and no pan. `PixiCamera` gets a fixed `{ x: 0, y: 0 }` top-left framing at the scene zoom (§4), and re-applies it on resize.
- **Ambient:** `AmbientVFXManager` learns to play a LIST of effects (`ambientVFX: ["butterflies", "clouds"]`), with a `VFXMap.json` entry `{ gtype: "loginScene", ... }`. Today it plays exactly one; the change is small and also lets real grids combine effects later.
- **Kept as-is:** tile FX (water, lava) and the y-sort.
- **Guards:** every remaining `currentPlayer` path is null-safe (trade-stall badge, range checks, teleport), and the renderer never reads or writes `GlobalGridStateTilesAndResources`, `NPCsInGridManager` or `PlayersInGrid` while in scene mode.

### 3.4 The scene driver: `game-client/src/LoginScene/` (new folder, small modules)

- **`LoginScene.js`:** the React component. It fetches the layout, builds `tileTypes`/`resources`/`npcs` in its own local state, mounts `<PixiRenderer scene .../>`, and runs the tick.
- **`sceneDriver.js`:** a 100 ms tick, purely local. **It makes no server calls, no saves and no analytics, and does not touch the game's grid singletons.**
  - **Wanderers (2 Coyotes, 2 Bears):**
    - They use their real `movespeed` and the same step / leg / pause rhythm as live NPCs (Track 3a).
    - Each is leashed to a home area inside the desktop window, so they never wander off-screen for long.
    - They avoid trees and each other.
    - They never attack: there is no player, and the Lumberjack is not a target.
    - The renderer already tweens a step, flips the facing and bobs, so the driver only moves positions.
  - **Lumberjack:**
    - The loop: pick a tree in the phone/desktop window, walk to a neighbouring tile (A*, `Utils/Pathfinding.js`), swing 3 times, and the tree falls (`StoryFX.woodChip`, the same chop moment as Peter Quince's FTUE chop).
    - The tree then leaves a short-lived Wood doober, the Lumberjack picks it up, pauses, and moves on.
    - Felled trees grow back after ~45-60 s (fade in), so the scene loops forever.
    - He favours trees near the top-left, so phones see him working.
  - It is seeded and deterministic per page load, so it is easy to test, but it varies between visits.
- **Lifetime:**
  - The driver pauses when the tab is hidden (`visibilitychange`) and stops completely on unmount.
  - The renderer's ticker is capped at 30 fps in scene mode (`frameRate.js`) to keep phones cool, as no gameplay depends on it.

### 3.5 App integration

- Where `showKeyArt` renders `<KeyArtImage/> + <LoginScreenButterflies/>`, render `<LoginScene/>` instead.
- **First paint:** the key art (or a plain grass colour, Q4) shows until the layout, the atlas and the first frame are ready, then the scene fades in over ~400 ms. A new visitor never stares at a blank board.
- **Fallbacks to the static key art:**
  - WebGL/Pixi fails to start;
  - the layout fetch fails;
  - `prefers-reduced-motion` is set (then a still frame of the scene, no motion: decide in Q5).
- **The Begin modal:** the scene sits behind it. Today's overlay (`--color-modal-overlay`) dims everything; the Begin modal gets a lighter overlay so the scene reads (Q3), via a token, not a one-off colour.
- **Hand-off on Begin / sign-in:**
  - The scene stays up through "silent account creating" (it replaces the key art in `LoadingScreen` too).
  - It unmounts when the game's grid is ready, under the existing TransitionProvider fade-to-black, so the two renderers never run at once.
  - `PixiCamera` / `StoryFX` / `CombatFX` detach and re-attach cleanly: that is the renderer's normal unmount path, tested explicitly.
- **Deleted afterwards:** `LoginScreenButterflies.js` (and `KeyArtImage` once it is no longer the fallback).
- **Docs:**
  - `docs/ui-conventions.md` gets a "Login scene" rule (non-interactive, fixed top-left camera, the modal overlay token).
  - CLAUDE.md's onboarding line says "the login scene" instead of "the key art".

## 4. Framing: what each screen sees

At the board's normal tile size (45 px), from the top-left corner:

| Screen | Visible tiles |
|---|---|
| Desktop 1440 x 900 | ~32 x 18 |
| Laptop 1280 x 720 | ~28 x 14 |
| Phone portrait 390 x 844 (minus Safari bars) | ~8.7 x 15 |
| Phone landscape | ~19 x 8 |

The Begin modal covers the middle of a phone screen. Recommendation: zoom the scene out on phones to ~0.7 (about 12 x 22 tiles visible) so the trees, an animal and the Lumberjack all fit around the modal (Q2). The zoom is set per viewport width at mount and on resize; it is never user-controlled.

## 5. Risks and how they are handled

| Risk | Handling |
|---|---|
| First impression for paid/ad traffic (Meta in-app browsers, iOS-heavy) gets slower or heavier | Static key art until ready; the atlas (2.4 MB) was going to download right after Begin anyway, so it is fetched earlier, not extra. A budget for verification: scene visible < 2.5 s on a mid phone on 4G; Begin tap is never blocked by the scene. |
| Scene mode breaks the live renderer | One prop; every scene branch is `if (scene)`, no behaviour change otherwise. Verify a normal session afterwards (homestead, valley, combat, FTUE doinker). |
| Two Pixi apps / leaked singletons (camera, StoryFX) after Begin | Scene unmounts before the game mounts; verify `window.__pixiApp` is the game's and the camera follows the player after Begin. |
| Battery / heat on phones while the visitor reads | 30 fps cap, pause on hidden tab, few moving things (5 NPCs + ambient). |
| Safari GPU wedge (an invisible but tappable UI, known iOS issue) | The Begin button is DOM above the canvas and always works, even if the canvas is wedged. |
| Conversion change is unmeasured | Ship on a known date and compare the Begin-tap rate (pageview beacon to Begin) before and after in the analytics dashboard, the same way the House key-art removal was measured. |

## 6. Build order (each step leaves the game working)

1. **Renderer scene mode + multi-effect ambient.** Behind the prop, nothing uses it yet. Check: normal play is unchanged.
2. **Layout + script + server route + the editor folder.** Check: the scene opens in the editor; `/api/login-scene` answers.
3. **`LoginScene` with a static scene:** tiles, trees, daisies, mushrooms, butterflies and clouds, fixed camera, phone zoom. Wired in place of the key art, with the fallbacks. Check: desktop, phone portrait and landscape, sign-in panel path, Begin hand-off.
4. **The driver:** wanderers, then the Lumberjack chop/regrow loop. Check: 10 minutes idle (no drift off-screen, no stuck NPCs, trees regrow, memory flat).
5. **Polish, docs, delete the old key-art butterflies.** Commit; the push is the deploy.

Estimated size: ~600-900 new lines (driver ~300, scene component ~150, layout script ~150, renderer guards ~100), plus the generated layout.

## 7. Decisions (owner, 2026-11-08)

1. Mushrooms sit on a patch of moss (`z`).
2. Phones: the scene is zoomed out (~12 x 22 tiles visible).
3. The Begin modal's overlay is lightened so the scene reads.
4. Until the scene is ready: plain grass colour, not the key art. The key art is no longer used.
5. No `prefers-reduced-motion` check.
6. Extras in view: a small pond and the cottage.
7. The Lumberjack's wood just disappears when he picks it up.
