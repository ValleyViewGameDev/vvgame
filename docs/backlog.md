# Backlog

Loose list of work that is agreed but not scheduled. One entry per item: what, why, and
where to start. Items move to `refactor-plan.md` (or a feature doc) when they get a slot.
Keep done items out of here; the git log is the record.

## Open

### EPIC: NPC / Combat System overhaul (opened 2026-10-07)

**What.** The combat loop, NPC movement, the server trust model for fights, enemy brains,
citizen brains and a tuning pass. Parent document with file:line findings:
`docs/audits/combat-and-npc-review-2026-10-07.md`. NPC kinds (owner, 2026-10-08): Enemies
(`attack`), Spawners (`spawn`), Citizens (`quest`/`trade`/`heal`/`worker`) and Farm Animals
(`graze`). Tracks: 1 action loop (built), 2 kill route (built), 3a movement feel (built),
3b Enemies with a movable home + leash, 4 Citizens (shared idle/roam, then motives/habits),
5 tuning.

**Owner's framing.** Casual, timing-game combat with strong board feedback and little UI to
process; the fight simulated on the client with one outcome request after a kill; NPCs that
read as alive (per-NPC cadence, pauses, home anchors, A\*); town "brains" (motives, habits,
little stories, lighter than SimGame) as the even-more-future track; enemies get a simpler
brain.

**Next.** Track 3b (Enemies), then Track 4 (Citizens).

### BL-1: "Add to Home Screen" prompt in the FTUE (iOS and Android)

**DONE 2026-10-06** as `UI/Modals/InstallPromptModal.js` (docs/onboarding-plan.md phase D): not an FTUE step but the crop harvest after the email ask, phone browsers only, never inside the installed app, "Not now" remembered per device in localStorage; iOS gets the Share → Add to Home Screen text, Android the captured `beforeinstallprompt`. The standalone-fetch retry posture from House was not ported.

**What.** A step in the first-time-user flow that invites the player to install the game on
their home screen, surfaced once, at a moment of earned goodwill (after the first homestead
visit or the first harvest, not on the login screen), with "later" remembered so it never
nags. On iOS the prompt is instructional (Share → Add to Home Screen, with the two icons);
on Android/Chrome it calls the `beforeinstallprompt` event that was captured earlier.

**Why.** A page cannot hide the browser's own bars; in landscape on iPhone a tap at the top
edge brings Safari's toolbar back and takes a strip of the board (owner, 2026-10-04). The
installed app runs without browser chrome in both orientations, gets the full screen, keeps
its orientation, and is the only route to iOS web push later. Everything the install needs
is already in place: `game-client/public/manifest.json` (name, icons, `display: fullscreen`,
`orientation: any`, green theme) and the `apple-mobile-web-app-capable` /
`apple-mobile-web-app-status-bar-style` / `apple-touch-icon` tags in `public/index.html`.

**Leverage House.** House already runs as a standalone PWA on iOS and learned the hard
lessons: `house/game-client/index.html` (the "Add-to-Home-Screen / PWA chrome" block),
`house/game-client/api.js` (fetch behaviour that differs inside the iOS standalone PWA: a
dropped request every so often, retried with backoff in `app.js` around the card fetch), and
`house/docs/crm.md` §"iOS PWA install prompt" (rule: surface the prompt only after a real
first success, never before; expect a single-digit install rate, so it is a quality-of-life
step, not a growth lever). Reuse the detection (`window.matchMedia('(display-mode:
standalone)')` / `navigator.standalone`) so the prompt never shows inside the installed app,
and copy the retry posture for `axios` calls when running standalone.

**Where to start.** `game-client/src/GameFeatures/FTUE/FTUE.js` and
`game-server/tuning/FTUEsteps.json` (a new step type `installPrompt` with its own modal in
`UI/Modals/`), a `dismissedInstallPrompt` flag on the Player (or localStorage, since it is
per device), and `App.js` to capture `beforeinstallprompt` into a ref at boot. Copy in
`UI/Strings/*.json` for all ten languages (the six English stubs just need the English).

**Done when.** On a phone browser the prompt appears once at the chosen FTUE step with the
right instructions for the platform; inside the installed app it never appears; "later" is
remembered; the installed app launches straight into the game full-screen in both
orientations.
