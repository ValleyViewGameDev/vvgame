/**
 * publicPlayer: the projection every route uses when it answers with a Player record.
 *
 * - Strips the password hash and the signup IP hash: neither leaves the server.
 * - Surfaces `hasPassword` so the client can show "Add password" (initial set, no old-password
 *   check) or "Change password" (verify the old one). Accounts made since the passwordless
 *   change (docs/onboarding-plan.md phase A) store the sentinel NO_PASSWORD and sign in with
 *   the username alone.
 */
const NO_PASSWORD = 'none';

function hasPassword(player) {
  const p = player && player.password;
  return !!p && p !== NO_PASSWORD;
}

function publicPlayer(playerDoc) {
  if (!playerDoc) return playerDoc;
  const p = typeof playerDoc.toObject === 'function' ? playerDoc.toObject() : { ...playerDoc };
  p.hasPassword = hasPassword(p);
  delete p.password;
  delete p.signup_ip_hash;
  return p;
}

module.exports = { NO_PASSWORD, hasPassword, publicPlayer };
