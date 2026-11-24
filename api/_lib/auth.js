// ════════════════════════════════════════════════════════════════════
// Password hashing and session handling.
//
// scrypt comes from Node's built-in crypto, so there is no dependency
// to install and no native build step on Vercel. bcrypt and argon2
// would both have been reasonable; scrypt wins here only because it
// is already present.
//
// The session cookie holds a random token. The database stores only
// the SHA-256 of that token, so somebody who reads the sessions table
// still cannot sign in as anybody. Sessions are rows rather than
// signed JWTs because a row can be revoked, which matters when the
// data behind it is mental health records.
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';

const SCRYPT_N = 16384;      // cost. ~100ms per hash on Vercel's Node runtime
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN   = 64;

const SESSION_DAYS = 30;
const COOKIE_NAME  = 'lena_session';

// ── passwords ───────────────────────────────────────────────────────

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p },
      (err, key) => {
        if (err) return reject(err);
        // Everything needed to verify later is in the string, so the
        // parameters can be raised in future without breaking old rows.
        resolve(['scrypt', SCRYPT_N, SCRYPT_r, SCRYPT_p,
                 salt.toString('hex'), key.toString('hex')].join('$'));
      });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    if (typeof stored !== 'string') return resolve(false);
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return resolve(false);
    const N = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    let salt, expected;
    try {
      salt = Buffer.from(parts[4], 'hex');
      expected = Buffer.from(parts[5], 'hex');
    } catch (e) { return resolve(false); }
    crypto.scrypt(password, salt, expected.length, { N, r, p }, (err, key) => {
      if (err) return resolve(false);
      // Constant time, so a wrong password cannot be narrowed down by
      // measuring how long the comparison took.
      resolve(key.length === expected.length &&
              crypto.timingSafeEqual(key, expected));
    });
  });
}

// ── sessions ────────────────────────────────────────────────────────

function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sessionCookie(token, maxAgeSeconds) {
  // HttpOnly keeps it out of reach of any script, which matters because
  // a single injected script would otherwise own every account.
  // SameSite=Lax blocks the cookie on cross-site POSTs, which is the
  // CSRF protection for the state-changing endpoints.
  const bits = [
    COOKIE_NAME + '=' + token,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=' + maxAgeSeconds
  ];
  return bits.join('; ');
}

function clearedCookie() {
  return COOKIE_NAME + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

function readCookie(req, name) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i++) {
    const kv = parts[i].trim();
    const eq = kv.indexOf('=');
    if (eq > 0 && kv.slice(0, eq) === name) return kv.slice(eq + 1);
  }
  return null;
}

// ── validation ──────────────────────────────────────────────────────

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validEmail(email) {
  const e = normaliseEmail(email);
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

// Length only. Composition rules push people towards predictable
// substitutions and towards writing the password down, and current
// guidance favours length with a blocklist over character classes.
function passwordProblem(pw) {
  const s = String(pw || '');
  if (s.length < 8)   return 'Your password needs to be at least 8 characters.';
  if (s.length > 200) return 'That password is too long.';
  const common = ['password', '12345678', 'qwertyui', 'password1', 'iloveyou',
                  'abc12345', '11111111', 'lenalena'];
  if (common.indexOf(s.toLowerCase()) > -1) {
    return 'That password is too easy to guess. Please choose another.';
  }
  return null;
}

export {
  COOKIE_NAME, SESSION_DAYS,
  hashPassword, verifyPassword,
  newSessionToken, hashToken,
  sessionCookie, clearedCookie, readCookie,
  normaliseEmail, validEmail, passwordProblem
};
