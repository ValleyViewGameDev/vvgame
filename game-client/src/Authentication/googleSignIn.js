import axios from 'axios';
import API_BASE from '../config';
import { gatherClientInfo, isInAppBrowser } from '../Utils/pageviewBeacon';
import { getBrowserType, getOSType, getDiagnostics } from '../Utils/clientDiagnostics';
import { detectLanguage } from '../Utils/detectLanguage';

// Google sign-in (ported from House). The GIS script is loaded by public/index.html; the button
// renders only when REACT_APP_GOOGLE_CLIENT_ID is set and the page is not inside a Meta/TikTok
// in-app browser (GIS refuses those). Server: routes/auth.js /login-google.
const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

export function isGoogleAvailable() {
  return !!CLIENT_ID && !isInAppBrowser() && !!window.google?.accounts?.id;
}

// Render the Google button into `container`; `onCredential(credential)` gets the id_token.
// GIS has one global callback (the last initialize wins), so each surface re-initialises.
export function renderGoogleButton(container, onCredential, { text = 'continue_with' } = {}) {
  if (!container || !isGoogleAvailable()) return false;
  window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r) => onCredential(r.credential) });
  window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', text, width: 260 });
  return true;
}

// Sign in or create: returns the public player. `linkPlayerId` attaches the identity to the
// current account instead (EmailModal's Google option).
export async function loginWithGoogle(credential, { linkPlayerId } = {}) {
  const payload = { credential, linkPlayerId };
  if (!linkPlayerId) {
    payload.language = detectLanguage();
    payload.browser = getBrowserType();
    payload.os = getOSType();
    payload.diagnostics = await getDiagnostics();
    payload.clientInfo = gatherClientInfo();
  }
  const res = await axios.post(`${API_BASE}/api/login-google`, payload);
  return res.data;
}
