// One-click unsubscribe from an email footer (ported from House). Deliberately UNAUTHENTICATED:
// the random unsubscribe_token IS the credential and grants exactly one action, turning
// marketing email off. GET renders a tiny standalone page (mail clients follow links with GET);
// POST exists for RFC 8058 one-click headers and link pre-fetchers. Unknown tokens get the same
// success page so the endpoint cannot be used to probe which tokens are real.
const express = require('express');
const Player = require('../models/player');
const { setMarketingConsent } = require('../utils/crmAudience');

const router = express.Router();
const SITE = 'https://www.secretsofelsinore.com';

function page(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f3f0d8;font-family:Georgia,'Times New Roman',serif;color:#3b3a2a">
<div style="max-width:30rem;padding:2rem;text-align:center">
<h1 style="font-size:1.5rem;margin:0 0 .75rem">${title}</h1>
<p style="font-size:1rem;line-height:1.5;margin:0 0 1.25rem">${message}</p>
<a href="${SITE}" style="color:#5a7a2a">Return to Secrets of Elsinore</a>
</div></body></html>`;
}

async function optOutByToken(token) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' };
  const player = await Player.findOne({ unsubscribe_token: token });
  if (!player) return { ok: false, reason: 'unknown' };
  setMarketingConsent(player, false);
  await player.save();
  console.log(`[mail] unsubscribe: ${player.username} opted out of marketing email`);
  return { ok: true, player };
}

router.get('/unsubscribe', async (req, res) => {
  try {
    const { reason } = await optOutByToken(req.query?.token);
    if (reason === 'missing') {
      return res.status(400).send(page('Link incomplete', 'That unsubscribe link is missing its code. You can also turn these emails off in the game, under Settings.'));
    }
    return res.status(200).send(page('You are unsubscribed', 'You will no longer receive game updates or event announcements. Profile emails will still be sent. You can turn updates back on any time in the game, under Settings.'));
  } catch (err) {
    console.error('[mail] /unsubscribe error:', err);
    return res.status(500).send(page('Something went wrong', 'We could not process that just now. You can also turn these emails off in the game, under Settings.'));
  }
});

router.post('/unsubscribe', async (req, res) => {
  try { await optOutByToken(req.body?.token); return res.status(200).json({ ok: true }); }
  catch (err) { console.error('[mail] /unsubscribe POST error:', err); return res.status(500).json({ ok: false }); }
});

module.exports = router;
