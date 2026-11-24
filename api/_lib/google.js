// ════════════════════════════════════════════════════════════════════
// Checking a "Sign in with Google" token.
//
// The page gets an ID token from Google (a signed JWT) and sends it
// here. Nothing in it is trusted until all of this holds:
//   1. it is signed by one of Google's current keys (RS256),
//   2. it was issued by Google (iss),
//   3. it was issued for LENA's own client ID (aud), so a token made
//      for some other website cannot be replayed here,
//   4. it has not expired (exp), allowing a minute of clock drift,
//   5. Google has verified the email address (email_verified).
// This is the check Google's own libraries do, written with Node's
// built-in crypto so there is nothing extra to install on Vercel.
// Google's public keys are fetched once and kept for as long as Google
// says they are valid (its Cache-Control), at most a day.
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const SKEW = 60;   // seconds of clock drift allowed

let keys = null, keysUntil = 0;

async function googleKeys(fetchImpl, force) {
  if (!force && keys && Date.now() < keysUntil) return keys;
  const r = await (fetchImpl || fetch)(CERTS_URL);
  if (!r.ok) throw new GoogleTokenError('keys_unavailable', 'Could not reach Google to check the sign-in.');
  const body = await r.json();
  const cc = (r.headers && r.headers.get && r.headers.get('cache-control')) || '';
  const m = /max-age=(\d+)/.exec(cc);
  keys = Array.isArray(body.keys) ? body.keys : [];
  keysUntil = Date.now() + Math.min(m ? +m[1] : 3600, 86400) * 1000;
  return keys;
}

export class GoogleTokenError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function part(s) {
  return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
}

/* Returns { sub, email, name, picture } or throws GoogleTokenError. */
export async function verifyGoogleIdToken(token, { clientId, now, fetchImpl } = {}) {
  const bad = (code, msg) => new GoogleTokenError(code, msg || 'That Google sign-in could not be checked. Please try again.');
  if (!clientId) throw bad('not_configured', 'Google sign-in is not set up yet.');
  if (typeof token !== 'string' || token.length > 8192) throw bad('bad_token');
  const bits = token.split('.');
  if (bits.length !== 3) throw bad('bad_token');

  let header, payload;
  try { header = part(bits[0]); payload = part(bits[1]); } catch (e) { throw bad('bad_token'); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw bad('bad_token');

  // Google rotates its keys. An unknown kid means the cached set may be
  // out of date, so fetch once more before giving up.
  let list = await googleKeys(fetchImpl, false);
  let jwk = list.find(k => k.kid === header.kid);
  if (!jwk) { list = await googleKeys(fetchImpl, true); jwk = list.find(k => k.kid === header.kid); }
  if (!jwk) throw bad('unknown_key');

  let ok = false;
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    ok = crypto.verify('RSA-SHA256', Buffer.from(bits[0] + '.' + bits[1]), key, Buffer.from(bits[2], 'base64url'));
  } catch (e) { ok = false; }
  if (!ok) throw bad('bad_signature');

  const t = Math.floor((now || Date.now()) / 1000);
  if (!ISSUERS.includes(payload.iss)) throw bad('wrong_issuer');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(clientId)) throw bad('wrong_audience');
  if (typeof payload.exp !== 'number' || payload.exp < t - SKEW) throw bad('expired', 'That sign-in has expired. Please try again.');
  if (typeof payload.iat === 'number' && payload.iat > t + 5 * 60) throw bad('bad_token');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255) throw bad('bad_token');
  if (!(payload.email_verified === true || payload.email_verified === 'true') || typeof payload.email !== 'string') {
    throw bad('email_unverified', 'Your Google account email is not verified yet. Verify it with Google, then try again.');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name.slice(0, 80) : null,
    picture: typeof payload.picture === 'string' && /^https:\/\//.test(payload.picture) ? payload.picture.slice(0, 500) : null
  };
}

// for the tests
export function _resetGoogleKeys() { keys = null; keysUntil = 0; }
