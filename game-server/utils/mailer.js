// Thin wrapper over the transactional-email provider (Loops), ported from House. Sends a HOSTED
// template by id + merge variables: the template lives in the Loops dashboard, not in code.
// Never throws: provider failures are logged and reported via the return value, so a mail
// hiccup can never block a signup or a save. Env: LOOPS_API_KEY (server only).
const LOOPS_ENDPOINT = 'https://app.loops.so/api/v1/transactional';

async function sendTemplateEmail({ to, transactionalId, dataVariables = {} }) {
  if (!to || !transactionalId) return false;
  if (!process.env.LOOPS_API_KEY) {
    console.warn('[mail] LOOPS_API_KEY unset; skipping send of', transactionalId);
    return false;
  }
  try {
    const res = await fetch(LOOPS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LOOPS_API_KEY}` },
      body: JSON.stringify({ transactionalId, email: to, dataVariables }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[mail] send failed', transactionalId, res.status, body);
      return false;
    }
    console.log('[mail] sent', transactionalId, '→', to);
    return true;
  } catch (err) {
    console.error('[mail] error sending', transactionalId, err.message);
    return false;
  }
}

module.exports = { sendTemplateEmail };
