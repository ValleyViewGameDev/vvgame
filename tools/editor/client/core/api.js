/**
 * API client. `local.*` is this tool's own server (files under game-server/); `game.*` is the
 * same-origin proxy to the game server (/api/game/* -> --game-server). Both throw an Error
 * with `.status` and `.body` on a non-2xx so callers can show the server's message.
 */
async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const err = new Error((data && data.error) || (data && data.message) || `${method} ${url} failed (${res.status})`);
    err.status = res.status; err.body = data;
    throw err;
  }
  return data;
}

export const local = {
  info: () => request('GET', '/api/local/info'),
  resources: () => request('GET', '/api/local/resources'),
  randomValley: () => request('GET', '/api/local/random-valley'),
  layouts: () => request('GET', '/api/local/layouts'),
  layout: (dir, name) => request('GET', `/api/local/layouts/${dir}/${encodeURIComponent(name)}`),
  saveLayout: (dir, name, layout) => request('PUT', `/api/local/layouts/${dir}/${encodeURIComponent(name)}`, layout),
  deleteLayout: (dir, name) => request('DELETE', `/api/local/layouts/${dir}/${encodeURIComponent(name)}`),
  tuningList: () => request('GET', '/api/local/tuning'),
  tuning: (id) => request('GET', `/api/local/tuning/${id}`),
  saveTuning: (id, data) => request('PUT', `/api/local/tuning/${id}`, { data }),
  patchPhase: (event, phase, hours) => request('PATCH', '/api/local/tuning/globalTuning/phase', { event, phase, hours }),
  settlementLayouts: () => request('GET', '/api/local/settlement-layouts'),
  frontierLayouts: () => request('GET', '/api/local/frontier-layouts'),
};

export const game = {
  get: (path) => request('GET', `/api/game${path}`),
  post: (path, body) => request('POST', `/api/game${path}`, body),
  put: (path, body) => request('PUT', `/api/game${path}`, body),
  delete: (path) => request('DELETE', `/api/game${path}`),
};
