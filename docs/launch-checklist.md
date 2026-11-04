# Launch checklist: re-launch with ads and forum posts

Started 2026-10-30 from the launch-readiness assessment (House's lessons: `house/docs/state-of-game.md`,
`house/docs/marketing/ad-campaign-comparison.md`, `house/docs/retention-strategy.md`). Tick items off
here; detail lives in the linked docs and backlog items.

## Must do before spending

- [x] **Close the open admin routes.** Done 2026-10-30 (7df2ac65): `requireDeveloper` on every
  editor/debug route, Mayor-only Courthouse settings, unclaimed developer usernames reserved.
  Follow-up: BL-2 (real session auth instead of the bare `x-player-id`).
- [x] **Developer accounts have passwords.** Owner is setting them on `ftuetester` and `test`
  (passwordless profiles log in with the username alone).
- [x] **Store grants only verified Stripe payments.** Done 2026-10-30 (c70b066d): session checked
  server-side, one grant per session, a Stripe error no longer crashes the server. New restricted
  Stripe key for this game (House keeps the standard key). Tested with a real purchase.
- [x] **Open-in-your-browser prompt for Meta's in-app browser.** House's Campaign 3: in-app FTUE
  43%, D1 3%; 88% of iOS 26 Meta clicks never left the in-app browser. Make "open in your browser"
  the primary action with a reason, and test the real ad-click path on the newest iOS.
  **Built 2026-11-01:** in an in-app browser the Begin screen's main button is "Play in Safari"
  (iOS, `x-safari-https://`) or "Play in your browser" (Android, `intent://` to the default browser, no package; strings 4127-4129), with the reason (the
  homestead is still there when you come back); Begin becomes "Play here anyway". If the page is
  still showing 1.5 s after the tap, the ⋯-menu instructions, a bouncing pointer at the menu and
  Copy link appear (`UI/Modals/BeginModal.js`, `Utils/openInBrowser.js`, strings 4121-4126).
  Dev test: localStorage `vv:forceInApp` = `1`. **Tested (owner, 2026-11-02):** from Facebook's
  browser the detection and the link out work.
- [ ] **Full playthrough to ~L15 on a phone, FTUE timed.** OB-3, OB-6 and OB-10 are built but not
  played. House saw quits rise past a ~12 minute FTUE.
- [x] **Finalize the town layout and upgrade its art.** Done (owner, 2026-10-31; W-15). The town is the first shared place a new
  player sees; art pipeline: `docs/art-pipeline-plan.md`, `docs/art/buildings-bible.md`.
- [ ] **Avatar creation / selection.** Plan: `docs/avatar-plan.md` (rig, catalogue, compositor and
  the developer-only Edit Avatar modal exist; the board does not draw it and players cannot
  create or choose one yet). Decide the launch scope: full parts avatar, or a pick-from-presets
  step in the FTUE.
- [x] **Atlas size pass.** Done 2026-10-30: 11 sheets -> 7 (about 185 MB -> 117 MB of GPU
  memory once decoded). The waste was packing, not resolution (768 px building slots are what a
  size-5 building needs at the closest zoom on a 2x phone): frames are now trimmed to their
  opaque box and MaxRects-packed; every frame verified pixel-identical to the old atlas. The
  download is unchanged at ~6.6 MB WebP (that is the art itself). Possible later: load the
  dungeon / far-region art only when needed, or a lower WebP quality after an eye check.
- [ ] **Tag every link.** `utm_source` per channel (`fb`, `ig`, one per forum), `utm_campaign` per
  buy; never `signin=1` on acquisition links. Judge channels on played-D7, not clicks.
- [x] **Render plan: no cold starts.** Done (owner, 2026-10-31): the server is on an always-on tier.
- [ ] **Player surveys, like House's** (added 2026-11-02). House runs two Google Forms through one
  prompt modal (`house/game-client/ui/modals/SurveyPromptModal.js`; analysis in
  `house/docs/research/feedback-survey.md`): a one-time retention micro-survey at the end of the
  FTUE (will you come back, what almost made you stop) and an always-on feature / roadmap survey
  (a Mailbox link plus a one-time nudge later on). Campaign 3 drew more feedback in eight days than
  the twelve weeks before it, so the forms must be live before the buy. Our FTUE feedback modal
  (`GameFeatures/FTUE/FTUE.js`) is the natural place for the first; decide where the second goes.
  **Always-on survey built 2026-11-03:** the Google Form
  (https://docs.google.com/forms/d/e/1FAIpQLSf_uEa9lFdncQt6DPlZKIyoB1AMQMLmIoPFzwjqtf2K3n617g/viewform)
  is a "Take a short survey" button in the "Have Feedback?" block at the bottom of the Mailbox and
  of Settings (`UI/Panels/FeedbackLinks.js`, `SURVEY_URL` is the one copy of the link), plus a
  one-time nudge, `UI/Modals/SurveyPromptModal.js`, when the first level-up modal at L5 or above
  is closed (`SURVEY_PROMPT_LEVEL` in App.js; stamped `Player.survey_prompt_seen_at`; the copy
  points to the Mailbox for later). Players already past L5 see it after their next level-up.
  Still open: the FTUE retention micro-survey (no form yet).

## Should do

- [ ] Phone feel pass: the remaining server-gated actions in OB-2 (craft start, gem purchases,
  Trading Post, shops, pets, scrolls, Farm House) react instantly.
- [ ] Re-voice the FTUE toasts and approve the P3 quest asks (narrative pass).
- [x] Wake-Gertrude migration (`node scripts/wake-gertrude-for-friends.js --apply --except Oberon`).
  Done 2026-11-04 after a backup: PotatoShell, Sheyona, moehong, jgamblin and Entropoly keep her
  awake (they meet her on their next grid entry); Oberon left asleep on purpose.
- [x] `social-share.png` shows the game as it looks now (owner, 2026-11-02).
- [ ] OS version in the pageview beacon (diagnose in-app browser problems).
- [ ] Ad creative: static images first, 4:5 (1080x1350) and 9:16 (1080x1920), from the parts of
  the board that already have painted art.
- [x] **Done 2026-11-02** (`routes/harvestFairRoutes.js`). The Harvest Fair's claim and fill were one
  open route (`/update-carnival-offer`) that set any claimant and `filled` without taking the goods;
  now the server takes the goods, pays, and records the claim for the player making the request.
  Its rewards were already mailed by the Fair's departure, offline included.
- [x] **Done 2026-11-02** (`routes/caravanRoutes.js`, `utils/caravan.js`). Close `/send-mailbox-message`: it is an open route that mails any player any rewards the
  request names, and the Caravan uses it by sending its own reward list from the client. The
  rewards still go to the Mailbox, at the moment the tier is earned (as now); the server should
  work out what this Caravan earned and mail it itself, so the route can be closed (or made
  developer-only, for the debug panel). The order fill itself (backpack/warehouse spend + the
  `train` block saved through `/update-profile`) belongs in the same server route. A tier whose
  mail failed is today only retried when the player next opens the game (`NewTrain.js`
  `checkAndDeliverPreviousTrainRewards`); the train scheduler's departure should sweep those
  instead, so no login is needed.

## Deferred

- **Meta pixel** (owner, 2026-10-30): Events Manager would not create a dataset; launching with
  boosted posts and Traffic-objective ads (optimise for landing page views) measured by UTM
  instead. The loader is written in `public/index.html` with an empty `META_PIXEL_ID`; filling it
  in turns on PageView, CompleteRegistration (Home Deed) and Purchase (verified Stripe).
- Stripe webhook (fulfil a buyer who closes the tab before the redirect), the Gold Pass offer
  (id 1 is not in `store.json`).

## Launch order

1. Must-do items above.
2. Forum posts first (free; tests the funnel; each forum its own source tag).
3. Then a ~7-day paid buy (~$140 gave House a readable result; no A/B split on that budget).
