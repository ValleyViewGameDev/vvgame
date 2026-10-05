# Onboarding plan: first screen, account, email, FTUE

Status: PLAN, 2026-10-05. Nothing here is built. Companion to `refactor-plan.md` (which owns
the data model and the deploy sequence) and `ui-conventions.md`. Numbers quoted from House
are in `house/docs/state-of-game.md`, `house/docs/crm.md` and `house/docs/retention-strategy.md`.

## 1. Goal and the numbers that define it

The first session has to turn a visitor into a player who comes back on day 1. Four
funnel numbers, measured in the analytics dashboard, with a deploy-date marker for every
change so each step gets a before/after read:

| Metric | How it is measured here | House today (best campaign) | Target after this plan |
|---|---|---|---|
| Landing to account | pageview beacon → player created | ~51% | 75%+ (no form before play) |
| FTUE completion | `firsttimeuser == false` | 58 to 73% | 60%+ with a shorter FTUE |
| D1 return | `recordActivity` next UTC day | 10 to 13% (finishers ~16%) | 15% of finishers |
| Email on file | `players.email != null` | 28.7% of all, 38.5% in Safari | 35% of finishers |

## 2. What House taught us (the learnings we are porting)

1. **A password at signup is pure friction.** House asks for a name only, stores the sentinel
   `'none'` as the password, and lets a passwordless account log in with the username alone.
   Players add a password later from Profile (prompted after a purchase). No reset flow was
   ever needed; the "Email us" link covers the rare lockout.
2. **The session is `playerId` in localStorage, nothing else.** No cookies, no tokens. The
   client resumes with `/whoami {playerId}`; a 4xx clears the cache, a network error keeps
   it and shows Retry. Same model as vvgame already uses.
3. **The create-profile → first-action gap was the biggest drop (~37%).** House now skips the
   era picker and auto-starts the first reign. Every screen between "Begin" and play costs.
4. **Email asked at the end of the first session, optional, with a reason.** "Heir & Spare is
   a web game, and depending on your browser it can be tricky to find your way back." Emails
   on file went 17% → 29%; typed emails 2 → 84. A settings toggle and an unsubscribe route
   keep it honest. Never at signup.
5. **The welcome email had no measurable effect on D1** (14.1 vs 14.3 against a quasi
   control). **Event emails reactivated 5.5% of lapsed players** when the event was real and
   dated, 1% when it was not. So: transactional Loops only, Mongo as the audience, no drip.
6. **Email links must carry `?signin=1&u=<name>`** or returning players create duplicate
   accounts (19 did). The link opens the sign-in with the name prefilled, only when no live
   session exists, and is skipped inside in-app browsers.
7. **Meta/Instagram in-app browsers are a separate funnel.** D1 ~3%, FTUE 43%, 7.5% with
   email. localStorage does not survive there. The fix proposed in House: give the "open in
   Safari" prompt a reason, and ask for email right after the profile exists.
8. **FTUE length matters.** Going from 12 to 14 minutes median raised mid-FTUE quits from
   10.6% to 13.4%. An FTUE that ends on a loss cost D1 (9.7% vs 13.5%). Keep it under ~12
   minutes and end on a win and an open loop.
9. **A gift used on day 0 doubled D1** (13% vs 6%). The welcome mailbox message is that gift
   here; collecting it should be a tutorial beat, not an afterthought.
10. **Username-only accounts already are the anonymous tier.** House has no guest mode and
    no account merge; "claiming" is adding a password, an email or Google. The lesson for the
    guest question in §5: never create a second record to merge.
11. **PWA install prompt and web push are deferred** until the in-game loop lifts D7; iOS
    push needs a manual home-screen install. Same posture here (BL-1 stays in the backlog
    until §7 phase D).

## 3. Where vvgame is today (the parts that change)

- Create-account form: username, password, language select, avatar carousel, "Begin Your
  Journey!" (`Authentication/CreateAccount.js`). The avatar is discarded server-side
  (`auth.js` always writes the default icon). Validation is "non-empty", errors are
  hard-coded English. Language is a dropdown, not detected.
- `password` is required on the Player and bcrypt-checked at `/login`. Returning players
  resume from `localStorage.player` with no server check beyond `GET /api/player/:id`,
  which returns the whole document including the password hash.
- Open, unauthenticated routes used by the editor: `/reset-password` sets the password to
  the literal `temp`; `/delete-player`; `/update-profile` applies any `$set`.
- No email field, no mailer except the owner alert (`emailUtils.js`, nodemailer/Gmail).
- The opening dungeon already exists: every new player spawns in their own copy of
  `layouts/gridLayouts/dungeon/opening.json` (the FTUE cave, `ownerId` = player, never reset)
  with Constable Elbow, a Gem, trees, the Signpost Home. Buying the Home Deed (1000 Money)
  creates the homestead. 14 FTUE steps follow (`tuning/FTUEsteps.json`), ending at the
  Mailbox. No skip. Step state is `ftuestep` on the Player, saved from the client.
- Analytics: pageview beacon with `vv_visitor_id`, `client_info` at registration (surface
  detects FB/IG/TikTok in-app browsers), FTUE funnel derived from `ftuestep`.

## 4. The new first session, screen by screen

### 4.1 First screen (visitor)

One screen, logo and key art, one button: **Play**. Below it, small: "Sign in again?" and
the language. Language is detected from `navigator.language` (first match in the enabled
list, else English) and shown as a tappable pill so it can be changed; no dropdown.

No name, no password, no avatar, no email. The avatar picker moves to the Profile panel
and to an FTUE beat (see 4.4). Terms/privacy stays a link.

Why: House's landing → signup is 51% with a one-field form; every field and every screen
before play is a drop. The avatar carousel is doubly wasted since the server ignores it.

### 4.2 Account creation: silent, on Play

Tapping Play creates the account immediately with a **generated username** (adjective +
noun + number, like House's `generateUniqueRandomUsername`), `password: 'none'`,
`email: null`, `named: false`, `client_info`, `signup_ip_hash`, language, and the FTUE cave,
then drops the player into the cave with no reload. This is the guest mode (see §5): the
record exists from the first second, so there is never anything to merge.

The player is asked for a **name** at the one moment it matters: when Constable Elbow sells
the Home Deed. "What name shall I put on the deed?" One field, prefilled with the generated
name so a tap-through still works, uniqueness checked live (`/check-username`). That is also
where `named` flips to true, which is the event the dashboard counts as "account created".

Server rules, ported from House: per-IP-hash cap of 5 new accounts per 24h in production;
`username` unique; a profanity filter on chosen names (`bad-words` is already a dependency,
unused). Generated names never collide with the reserved developer usernames.

### 4.3 Returning players and sign-in

- Same device: `localStorage.player` → `GET /api/player/:id`, which now answers through
  `publicPlayer` (no hash, `hasPassword` flag). 4xx clears the cache and shows the first
  screen; network error keeps it and shows Retry.
- New device or cleared storage: **Sign in again?** opens a modal with username and
  "Password (leave blank if none)". A passwordless account signs in with the name alone; a
  password supplied for one is rejected with the House copy. The modal keeps the
  "@ Email us" link as the only recovery.
- Email links carry `?signin=1&u=<username>`; the client opens the sign-in modal prefilled
  when there is no live session, strips the parameters, and skips it in in-app browsers.
- **Add password** lives in Profile ("Secure your profile"), minimum 4 characters, no
  old-password check for the first one; later changes require the current one. The prompt
  also appears once after the first purchase and once after the first email is saved.
- Google sign-in is phase D, not phase A: it needs the GIS credential flow, link mode, and a
  409 on an already-linked Google ID. It is hidden in in-app browsers anyway.

### 4.4 FTUE: keep the cave, tighten the arc, end on an open loop

Keep the existing 14 beats and their triggers; change what is around them.

- **Cave (steps 1 to 4) is the hook.** It is already instanced per player and already has
  Elbow, a Gem, trees, the Signpost. Add two things: a visible reward on the way to Elbow
  (the Gem is there; make the toast say what it is for), and the name prompt on the deed.
  The first minute must teach tap-to-move by doing (the `_touch` strings are in).
- **Avatar beat**: after the Home Deed, on arrival at the homestead, a one-time "This is
  you" tap on the avatar opens the picker (free icons only). It replaces the signup carousel
  and gives the homestead arrival a moment of ownership.
- **Gift beat**: the welcome mailbox message (500 Money, 25 Gem, wood, seeds) is collected
  as the **first** homestead action, not the last (today the Mailbox is step 13 to 14). House
  measured a day-0 gift at 2x D1. Move the Mailbox beat to right after HomesteadVisit; keep
  the final step short.
- **Length**: aim for 10 to 12 minutes to `completeTutorial`. Measure the median from
  `created` to `firsttimeuser:false` in the dashboard before and after.
- **End on an open loop**: the last toast names something that will be ready later ("Your
  Wheat will be ready in 2 hours") and the Signpost/Train. Never end on a failure state.
- **Skip**: a developer-only skip stays; no player skip (House has none and completion is
  fine). What players need instead is that every beat is dismissable on the action itself.
- **In-app browsers** (`client_info.surface` is FB/IG/TikTok): show the "Open in Safari /
  Chrome" prompt once, after the Home Deed, with the reason ("your progress is saved on this
  device only in here"), and ask for email at the same beat instead of waiting for 4.5.

### 4.5 Email: asked once, with a reason, after the first harvest

Trigger: the first `PlantedFirstCrop` → first harvest collected (the player has waited for
something, which is the moment the "find your way back" argument is true). Modal, House copy
adapted:

> **Let us welcome you**
> Secrets of Elsinore is a web game, and depending on your browser it can be tricky to find
> your way back. Add your email so we can send you a welcome note and the occasional update.
> We'll store your address safely and never share it. Opt out any time in Settings.
> [Maybe later] [Save]

Optional, never blocks, shown once (`email_prompt_seen_at`). Also reachable from Profile
("Add email" / "Change email") and Settings. Settings gets the toggle "Email me game updates
and new Events" (`marketing_consent`, soft opt-in by default, Stripe-sourced addresses
excluded).

Player fields (port from House `models/player.js`): `email`, `email_source`
(`manual|oauth|stripe`), `marketing_consent`, `marketing_consent_at`, `unsubscribe_token`,
`email_bounced_at`, `welcome_email_sent_at`, `email_prompt_seen_at`. Server lowercases and
regex-validates; no double opt-in.

### 4.6 Loops program: transactional only, event-triggered

Port `house/game-server/utils/mailer.js` (Loops transactional POST), `emailNotifications.js`
(template IDs per language with EN fallback, atomic claim-then-send on
`welcome_email_sent_at`, `signinUrlFor`), `crmAudience.js` (`isMarketingEligible`), the
unauthenticated `/api/unsubscribe?token=` route, and the `EmailSend` ledger model. Env:
`LOOPS_API_KEY`, `LOOPS_TID_WELCOME_<LANG>`, `LOOPS_TID_EVENT_<LANG>`.

Emails, in the order they earn their place:

1. **Welcome** (on email saved): sign-in link, one paragraph on what to come back for
   (crops, the Train, the Carnival). Expect no D1 effect; it exists so the player has the
   link in their inbox.
2. **Event announcement** (phase C): Train arrival, Carnival, season end, each a real dated
   event. Runner script with `--auto --send` on a Render cron, ledger-idempotent, CTA with
   utm and `&signin=1`. This is the email that reactivated 5.5% of lapsed House players.
3. **Subscription thanks** when Gold tier checkout completes (Stripe webhook).

No day-2, no lapsed drip. The audience stays in Mongo; Loops never holds a contact list.

### 4.7 Return path and PWA

- Fullscreen/standalone manifest and iOS metas are already there. BL-1 (Add to Home Screen
  prompt as an FTUE step type after the first harvest) moves to phase D, gated on the D7
  read, same posture as House.
- No web push. Email is the only out-of-game channel until D7 says otherwise.

## 5. The guest question: play the cave with no account?

Recommendation: **yes, and build it as the silent account in 4.2, not as a true guest.**

- A true guest (no Player document; state in localStorage; account created on claim) needs
  a merge path: cave progress, inventory, Money, FTUE step and the cave grid itself would
  have to be re-created server-side on claim, and a player who clears storage mid-cave
  loses everything with no record of it. House never built a merge and never needed one.
- The silent account costs one Player document plus one cave grid per Play tap. Abandoned
  ones are cheap but accumulate, so: a nightly purge of players with `named:false`, no
  email, `ftuestep <= 3` and `lastActive` older than 7 days (and their cave grids), logged
  to the dashboard as "bounced in cave". Analytics then has the full pre-name funnel for
  free: Play → moved → talked to Elbow → bought the deed (= named).
- The only thing the player "creates" is a name, at the deed. That is the hook the owner
  asked for: the cave is playable from the first tap, and the ask comes after the player has
  something worth naming.
- Risk to name: a silent account in an in-app browser is a guaranteed orphan once the
  player leaves. The purge handles the DB side; the Safari prompt in 4.4 handles the
  player side.

## 6. Compatibility and security (must hold through every phase)

- Existing players keep their passwords; the schema makes `password` optional with the
  `'none'` sentinel; `/login` handles both. Nobody is logged out by the change.
- `/reset-password` (sets `temp`) and `/delete-player` move behind the developer gate
  (`x-player-id` of a developer account, the same check the maintenance mode uses), and the
  editor's Players tab sends it. `/update-profile` gets the Phase 5 allowlist from the
  refactor plan (`ftuestep`, `aspiration`, settings, email fields), never `password` or
  `username` through it.
- Boot stops using `GET /api/player/:id` (full document with hash); `/whoami` returns the
  public subset (`utils/publicPlayer.js`, port from House).
- Per-IP cap, profanity filter, username length 2 to 20, generated names are the defaults.
- Nothing in this plan touches grids, settlements or the schedulers; it is independent of
  the remaining refactor phases and can ship while `SERVICE_MODE` is still `maintenance`
  (developers bypass), then be the first thing live players see when the mode flips.

## 7. Delivery phases

Each phase ships on its own, with a deploy date noted in `docs/analytics.md` so the
dashboard funnel can be split before/after.

| Phase | Scope | Done when |
|---|---|---|
| **A. Passwordless + hardening** (BUILT 2026-10-05) | `password` optional with the `'none'` sentinel (`utils/publicPlayer.js`); `/login` username-only for passwordless profiles, `NO_PASSWORD` / `PASSWORD_REQUIRED` / `BAD_PASSWORD` codes; every player-returning route goes through `publicPlayer` (hash stripped, `hasPassword` surfaced) instead of a new `/whoami`; sign-in form with "Password (leave blank if none)"; Profile "Secure your profile" via `/player/change-password`; `/reset-password` (now clears the password) and `/delete-player` gated to developers or self; `update-profile` denylist (password, billing, identity; `accountStatus`/`role` developer-only); per-IP cap (production, `signup_ip_hash`, needs `trust proxy`); `utils/usernames.js` rules + `/check-username`; the chosen avatar is honoured; `?signin=1&u=` opens the sign-in form prefilled | Existing players log in unchanged; a new account needs a name only; the password hash never leaves the server |
| **B. Play-first + name at the deed** (core BUILT 2026-10-05) | No first screen: a visitor with no session gets a silent account on load (`Authentication/silentAccount.js` → `/register-new-player {silent:true}`: generated "Brave Fox 4821" name from `utils/usernames.js`, detected language, `named:false`) and lands in the cave; the welcome mailbox gift is sent server-side at registration; the Home Deed trade opens `UI/Modals/NameDeedModal.js` (prefilled, live `/check-username`) → `/player/name` flips `named`, re-stamps the analytics cohort row, fires the owner alert and the ad-pixel sign_up; logout and `?signin=1` are the only paths to the login panel (`vv_signin_requested`); daily purge of unnamed accounts inactive 7+ days (`utils/purgeUnnamed.js`, `schedulers/purgeScheduler.js`, `scripts/purge-unnamed.js --apply`) logged to `analytics_purge` and shown on the dashboard's FTUE title as "bounced in the cave". FTUE beats (same day): steps 5-6 are now the Mailbox gift (7063, step 6 advances on `CollectedMail` from the collect button, so the picker never covers the gift) and the avatar picker (`modalType: "icon"`, 7064) right after the first homestead arrival, the old beats shift by two, and step 15 ends on the open loop (7065, crops growing + the Train); string 740 no longer greets by name (a silent account is unnamed at step 1); `scripts/migrate-ftue-steps-2026-10-05.js --apply` re-maps anyone mid-tutorial | Landing-to-named measured; FTUE median ≤ 12 min |
| **C. Email + Loops** (~2 days) | Player email fields; the email modal after first harvest; Profile/Settings entry points and toggle; Loops mailer + welcome template per language; unsubscribe route; `EmailSend` ledger; in-app-browser early ask + Safari prompt | Emails on file reported per surface in the dashboard; welcome sent once per player |
| **D. Re-engagement** (later, gated on D7) | Event announcement runner on cron (Train/Carnival/season); Google sign-in with link mode; BL-1 install prompt; subscription-thanks email | Each email has a placebo-date control like House's Naples/Granada read |

## 8. Decisions (owner, 2026-10-05)

1. **Silent account**, created the moment the game loads for a visitor with no session.
2. **Name prompt at the Home Deed.**
3. **Email ask after the first harvest** (in-app browsers: at the deed).
4. **No first screen at all.** A visitor with no `localStorage.player` lands directly in
   the cave: no key art, no Play button. The account is created on load (4.2), the language
   is detected, and "Sign in again?" lives in the Settings/Profile panel and on the
   `?signin=1&u=` link. The key art and the LoginPanel are retired with phase B.
5. **Purge after 7 days** for unnamed accounts with no email; never purge a named or
   emailed account; log the count to the dashboard.
