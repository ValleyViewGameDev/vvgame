import axios from 'axios';

/**
 * Deploy-freshness detection (ported from House, game-client/api.js there). The game server
 * stamps every response with X-App-Build, its deployed commit. The first one this tab sees is
 * the build it loaded against; when a later response carries a different one, a deploy landed
 * while the tab stayed open, so the code running here is stale: fire a one-shot window event,
 * 'app:build-changed', that UI/Modals/UpdatePrompt.js turns into a "The Game Has Updated"
 * prompt. Detection only. The client polls /api/status every 60 s (App.js), so even an idle
 * tab notices within a minute. The client deploy is checked too (checkClientBuild below).
 */
export const BUILD_CHANGED_EVENT = 'app:build-changed';
let bootBuild = null;
let announced = false;

function checkBuild(headers) {
  const build = headers?.['x-app-build'];
  if (!build) return;
  if (bootBuild === null) { bootBuild = build; return; }
  if (build !== bootBuild && !announced) {
    announced = true;
    try { window.dispatchEvent(new CustomEvent(BUILD_CHANGED_EVENT, { detail: { from: bootBuild, to: build } })); } catch (_) { /* no window */ }
  }
}

// The client side of the same question: the build this bundle was made from (REACT_APP_BUILD,
// set by `npm run build` from Render's RENDER_GIT_COMMIT) against the build.json the static
// site serves now (scripts/write-build-id.js). The server usually finishes deploying first, so a
// player who refreshes the moment the server changes can still load the old client; this catches
// the client landing a few minutes later. Off locally (no REACT_APP_BUILD).
const CLIENT_BUILD = process.env.REACT_APP_BUILD;
async function checkClientBuild() {
  if (!CLIENT_BUILD || CLIENT_BUILD === 'dev' || announced) return;
  try {
    const res = await fetch(`/build.json?cb=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = await res.json();
    if (build && build !== 'dev' && build !== CLIENT_BUILD && !announced) {
      announced = true;
      window.dispatchEvent(new CustomEvent(BUILD_CHANGED_EVENT, { detail: { from: CLIENT_BUILD, to: build, client: true } }));
    }
  } catch (_) { /* offline or no build.json: try again next time */ }
}

let installed = false;
export function installBuildWatch() {
  if (installed) return;
  installed = true;
  if (CLIENT_BUILD && CLIENT_BUILD !== 'dev') setInterval(checkClientBuild, 60 * 1000);
  axios.interceptors.response.use(
    (res) => { checkBuild(res.headers); return res; },
    (err) => { checkBuild(err?.response?.headers); return Promise.reject(err); },
  );
}
