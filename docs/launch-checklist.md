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
- [ ] **Open-in-your-browser prompt for Meta's in-app browser.** House's Campaign 3: in-app FTUE
  43%, D1 3%; 88% of iOS 26 Meta clicks never left the in-app browser. Make "open in your browser"
  the primary action with a reason, and test the real ad-click path on the newest iOS.
- [ ] **Full playthrough to ~L15 on a phone, FTUE timed.** OB-3, OB-6 and OB-10 are built but not
  played. House saw quits rise past a ~12 minute FTUE.
- [ ] **Finalize the town layout and upgrade its art.** The town is the first shared place a new
  player sees; art pipeline: `docs/art-pipeline-plan.md`, `docs/art/buildings-bible.md`.
- [ ] **Avatar creation / selection.** Plan: `docs/avatar-plan.md` (rig, catalogue, compositor and
  the developer-only Edit Avatar modal exist; the board does not draw it and players cannot
  create or choose one yet). Decide the launch scope: full parts avatar, or a pick-from-presets
  step in the FTUE.
- [ ] **Atlas size pass.** The atlas is current (`npm run check:atlas` passes) but has grown to
  eleven 2048 px sheets, 6.7 MB WebP, all loaded at startup: about 185 MB of GPU memory once
  decoded, a real risk on iPhones (Safari kills heavy tabs) and a slow first load for an ad
  click. Five sheets hold only four sprites each (very high-res sources). Cap each sprite's
  baked size at what the board can show at max zoom, rebuild, and consider loading the
  dungeon / far-region sheets only when needed.
- [ ] **Tag every link.** `utm_source` per channel (`fb`, `ig`, one per forum), `utm_campaign` per
  buy; never `signin=1` on acquisition links. Judge channels on played-D7, not clicks.
- [ ] **Spend log.** Record spend, impressions and landing-page views per campaign; House could
  not compute cost per retained player without it.
- [ ] **Render plan: no cold starts.** Confirm the server is on an always-on tier.

## Should do

- [ ] Phone feel pass: the remaining server-gated actions in OB-2 (craft start, gem purchases,
  Trading Post, shops, pets, scrolls, Farm House) react instantly.
- [ ] Re-voice the FTUE toasts and approve the P3 quest asks (narrative pass).
- [ ] Wake-Gertrude migration (`node scripts/wake-gertrude-for-friends.js --apply --except Oberon`,
  backup first, good connection).
- [ ] `social-share.png` shows the game as it looks now.
- [ ] OS version in the pageview beacon (diagnose in-app browser problems).
- [ ] Ad creative: static images first, 4:5 (1080x1350) and 9:16 (1080x1920), from the parts of
  the board that already have painted art.
- [ ] Close `/send-mailbox-message` (the Train's rewards come from the client).

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
