# Email setup: Render variables and Loops templates

What the server needs before the Phase C welcome email (and the Phase D event email) can
send. Code: `game-server/utils/mailer.js`, `emailNotifications.js`, `crmAudience.js`; names
in `game-server/.env.example`. Without `LOOPS_API_KEY` every send is logged and skipped,
and the once-only stamp is released, so nothing is lost by deploying before this is done.

## 1. Render: environment variables on `vvgame-server`

Render dashboard → service **vvgame-server** → **Environment** → **Add Environment Variable**.
Saving triggers a redeploy (or use Manual Deploy → Deploy latest commit).

| Key | Value | Needed for |
|---|---|---|
| `LOOPS_API_KEY` | The API key from the Loops workspace (Settings → API). The same key as the House service if both games live in one workspace; see §2.1 | every send |
| `LOOPS_TID_WELCOME_EN` | Transactional ID of the English welcome template (§2.3) | Phase C welcome |
| `LOOPS_TID_WELCOME_ES` / `_FR` / `_DE` | Transactional IDs of the translated welcome templates. Optional: a missing one falls back to EN | welcome in that language |
| `PUBLIC_SERVER_URL` | `https://vvgame-server.onrender.com` (base of the unsubscribe link in marketing emails) | Phase D |
| `LOOPS_TID_EVENT_EN` (+ `_ES`/`_FR`/`_DE`) | Transactional IDs of the event-announcement template(s) | Phase D |
| `SIGNUP_IP_SALT` | Any long random string (salts the signup IP hash; falls back to `SECRET_KEY` when unset) | optional |

Already present and reused: `YOUR_DOMAIN` (`https://www.secretsofelsinore.com`) is the base
of the sign-in link inside the welcome email, `ALERT_EMAIL_*` keeps sending you the new-user
alert (that one still goes through Gmail, not Loops).

Nothing is needed on the `vvgame-client` static site.

## 2. Loops

### 2.1 Workspace and sending domain

Loops keys and sending domains are per workspace. Two ways to reuse the House account:

- **Same workspace, House sending domain.** Use the House `LOOPS_API_KEY`. Each transactional
  template sets its own From name, so set the From name to "Secrets of Elsinore" and the
  Reply-To to an address you read; the From address stays on the verified House domain
  (`@heirandspare.io`). Zero DNS work; the only cost is that the envelope domain is House's.
- **Same workspace, second domain.** If your Loops plan lets you add another sending domain
  (Settings → Domain), add `secretsofelsinore.com`, copy the SPF, DKIM and DMARC records it
  gives you into the domain's DNS (same drill as `heirandspare.io` in House's `docs/crm.md`,
  2026-07-29), wait for "Verified", then use `@secretsofelsinore.com` as the From address on
  the Elsinore templates. If the plan allows only one domain, use the first option or a
  separate workspace (its own key, its own domain).

Either way the audience never lives in Loops: the server sends through the transactional
API with the player's address each time, and consent is decided in `crmAudience.js`.

### 2.2 Data variables the server sends

Declare exactly these in each template (Loops rejects a send whose variables do not match
the template's declared ones):

| Template | Variables |
|---|---|
| Welcome | `username`, `signinUrl` |
| Event announcement (Phase D) | `username`, `eventName`, `eventDates`, `eventCloses`, `eventHook`, `ctaUrl`, `unsubscribeUrl` |

`signinUrl` is built server-side as
`https://www.secretsofelsinore.com/?utm_source=email&utm_medium=email&utm_campaign=welcome&signin=1&u=<username>`
so the button in the email opens the sign-in form with the name prefilled on a device
without a session, and goes straight into the game on the player's usual browser. Do not
hand-write that link in the template; use the variable as the button's URL.

### 2.3 Create the welcome template

1. Loops → **Transactional** → **New** → name it `Elsinore welcome (EN)`.
2. **Data variables** (right-hand panel): add `username` and `signinUrl`.
3. From name "Secrets of Elsinore"; From address per §2.1; Reply-To an address you read.
4. Subject, for example: `Welcome to Elsinore, {{username}}`.
5. Body, two short paragraphs and a button. Suggested copy (edit freely in Loops; no deploy
   needed to change it):
   - "Your homestead is waiting. Crops keep growing while you are away, the Train pays well
     for goods, and the Carnival comes through Town. This is your way back:"
   - Button label "Return to your homestead", button URL `{{signinUrl}}`.
   - Small print: "You asked for this note when you added your email in the game. The
     occasional update follows; turn it off any time under Profile in the game."
6. **Publish**. Open the template's **Send** (or "Use this email") tab: the code sample shows
   `transactionalId: "clxxxxxxxxxxxxxxxxxxxxxxxxx"`. That value is `LOOPS_TID_WELCOME_EN`.
7. For Spanish, French and German: **Duplicate**, translate, publish, copy each ID into the
   matching `LOOPS_TID_WELCOME_<LANG>`. Skip any language you do not want; EN is the fallback.

The event template (Phase D) is the same procedure with the seven variables above; its body
must contain a link to `{{unsubscribeUrl}}` (CAN-SPAM), which the server supplies per
player.

### 2.4 Test before players see it

1. Loops → the template → **Send test** with your own address: checks rendering and the
   sending domain, not the server plumbing.
2. End to end, once the Render variables are saved and the deploy is live: sign in as a dev
   account (for example `newtest`) on secretsofelsinore.com, open Profile → Email → Add email,
   enter your address, Save. Within a minute the welcome should arrive; the Render logs for
   `vvgame-server` show `[mail] sent <templateId> → <address>` on success or
   `[mail] send failed <templateId> <status> <body>` with Loops' reason on failure (a
   mismatch in declared variables is the usual one).
3. The stamp: `welcome_email_sent_at` is set on the player only after a 2xx from Loops, so a
   failed attempt can be retried by saving the email again. To re-test on the same dev
   account, clear the stamp:

```bash
cd game-server && node -e "require('dotenv').config();const m=require('mongoose');const P=require('./models/player');(async()=>{await m.connect(process.env.MONGODB_URI);const r=await P.updateOne({username:'newtest'},{\$set:{welcome_email_sent_at:null}});console.log(r.modifiedCount);await m.disconnect();})()"
```

### 2.5 What never needs a code change

Template copy, subject, design, From name and Reply-To all live in Loops. Only the
transactional IDs are configuration, and only the variable names are code.
