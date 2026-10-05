// Anonymous landing-page beacon + acquisition capture for the analytics
// dashboard (vvgame/tools/analytics, Site Traffic tab). See docs/analytics.md.
//
// - getVisitorId(): a random UUID minted once per browser and kept in
//   localStorage. No PII, first-party only. Private-mode / blocked storage
//   yields null and the visitor is simply not counted.
// - gatherClientInfo(): the acquisition context sent with /register-new-player
//   so the dashboard's Source charts can attribute the account (utm_* from the
//   landing URL, the referrer host, the play surface) and join it to its
//   pageview through visitor_id. The first landing URL's utm tags are cached in
//   sessionStorage so a later in-app navigation does not lose them.
// - sendPageviewBeacon(): POSTs once per browser per UTC day (fire-and-forget)
//   to /api/analytics/pageview. Skips localhost so dev loads never pollute the
//   funnel's denominator, which cannot be filtered after the fact.
import API_BASE from '../config';

const VISITOR_KEY = 'vv_visitor_id';
const BEACON_DAY_KEY = 'vv_pageview_day';
const LANDING_KEY = 'vv_landing';

function safeGet(store, key) { try { return store.getItem(key); } catch { return null; } }
function safeSet(store, key, val) { try { store.setItem(key, val); } catch { /* storage blocked */ } }

function mintUUID() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  // RFC 4122 v4 fallback for older WebViews.
  const b = new Uint8Array(16);
  if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function getVisitorId() {
  let id = safeGet(window.localStorage, VISITOR_KEY);
  if (!id) {
    id = mintUUID();
    safeSet(window.localStorage, VISITOR_KEY, id);
    // Verify the write took (private mode can accept and drop it).
    if (safeGet(window.localStorage, VISITOR_KEY) !== id) return null;
  }
  return id;
}

function hostOf(url) {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase() || null; } catch { return null; }
}

// Play surface: an in-app browser (Meta/TikTok/Reddit) or an explicit ?source=
// tracking tag beats plain 'web'. Mirrors the value the beacon sends as `source`.
function detectSurface(params) {
  const tagged = params.get('source');
  if (tagged) return tagged.slice(0, 64);
  const ua = navigator.userAgent || '';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook in-app';
  if (/Instagram/i.test(ua)) return 'instagram in-app';
  if (/musical_ly|TikTok|Bytedance/i.test(ua)) return 'tiktok in-app';
  return 'web';
}

// Meta/TikTok in-app browsers: localStorage rarely survives, so the game asks for email early
// and shows the "open in your browser" hint (docs/onboarding-plan.md §4.4).
export function isInAppBrowser() {
  return /FBAN|FBAV|FB_IAB|Instagram|musical_ly|TikTok|Bytedance/i.test(navigator.userAgent || '');
}

// The landing context, captured on the FIRST load of this browser session and
// re-read afterwards (utm tags are only on the landing URL).
function landing() {
  const cached = safeGet(window.sessionStorage, LANDING_KEY);
  if (cached) { try { return JSON.parse(cached); } catch { /* fall through */ } }
  const params = new URLSearchParams(window.location.search);
  const info = {
    utm_source: params.get('utm_source') || null,
    utm_medium: params.get('utm_medium') || null,
    utm_campaign: params.get('utm_campaign') || null,
    referrer_host: hostOf(document.referrer),
    landing_path: (window.location.pathname || '/').slice(0, 256),
    surface: detectSurface(params),
  };
  safeSet(window.sessionStorage, LANDING_KEY, JSON.stringify(info));
  return info;
}

// Shape consumed by routes/auth.js (sanitizeClientInfo) at register.
export function gatherClientInfo() {
  const l = landing();
  return {
    visitor_id: getVisitorId(),
    surface: l.surface,
    acquisition: {
      utm_source: l.utm_source,
      utm_medium: l.utm_medium,
      utm_campaign: l.utm_campaign,
      referrer_host: l.referrer_host,
      landing_path: l.landing_path,
    },
  };
}

const isLocalhost = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

export function sendPageviewBeacon() {
  if (isLocalhost()) return;
  const visitorId = getVisitorId();
  if (!visitorId) return;
  const today = new Date().toISOString().slice(0, 10);
  if (safeGet(window.localStorage, BEACON_DAY_KEY) === today) return;   // once per UTC day
  safeSet(window.localStorage, BEACON_DAY_KEY, today);
  const l = landing();
  const body = JSON.stringify({
    visitor_id: visitorId,
    utm_source: l.utm_source,
    referrer_host: l.referrer_host,
    source: l.surface,
  });
  try {
    fetch(`${API_BASE}/api/analytics/pageview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch { /* fire-and-forget */ }
}
