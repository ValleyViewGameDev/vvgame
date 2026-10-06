// Server auth error codes (routes/auth.js, /update-profile) -> string keys. Unknown codes fall back
// to the server's English message so a new code is never a blank error.
const CODES = {
  NOT_FOUND: 4074,
  NO_PASSWORD: 4073,
  PASSWORD_REQUIRED: 4084,
  BAD_PASSWORD: 4075,
  PASSWORD_SHORT: 4086,
  TAKEN: 4083,
  EMPTY: 4081,
  TOO_SHORT: 4082,
  TOO_LONG: 4082,
  INVALID: 4082,
  PROFANE: 4082,
  RATE_LIMITED: 4087,
  EMAIL_INVALID: 4104,
  GOOGLE_FAILED: 4119,
};

export function authErrorText(err, strings, fallback) {
  const data = err?.response?.data || err?.data || err || {};
  const code = data.code || (typeof data.error === 'string' && CODES[data.error] ? data.error : null);
  if (code && CODES[code] && strings?.[CODES[code]]) return strings[CODES[code]];
  return data.error || fallback;
}
