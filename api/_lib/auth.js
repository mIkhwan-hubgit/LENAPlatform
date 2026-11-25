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

// ── choosing a password ─────────────────────────────────────────────
// Length plus a blocklist, no "must contain a symbol" rules. This is
// what NIST SP 800-63B asks for: composition rules push people towards
// predictable swaps (Passw0rd!) without making passwords harder to
// guess, while a long password and a check against passwords already
// known to attackers do. Spaces and any language are fine.
const MIN_PW = 10, MAX_PW = 200;

// Common choices of 10 or more characters. The leaked-password check
// below catches far more; this list still works when that check cannot
// be reached.
const COMMON = new Set([
  '1234567890','0123456789','0987654321','1111111111','0000000000','1212121212',
  '1122334455','1234512345','1234554321','1q2w3e4r5t','q1w2e3r4t5','qwertyuiop',
  'asdfghjkl1','asdfghjkl;','zxcvbnm123','qwerty1234','qwerty12345','1qaz2wsx3edc',
  'password12','password123','password1234','passw0rd12','p@ssw0rd12','iloveyou12',
  'iloveyou123','abcdefghij','abc1234567','abcd123456','abcde12345','12345abcde',
  'football12','sayangku123','sayangkuu1','malaysia123','malaysia12','iiumiium12',
  'letmein123','welcome123','admin12345','loveyou123','princess12','sunshine12',
  'lenalena12','lena123456','lenaplatform'
]);

async function leaked(pw, fetchImpl) {
  // Have I Been Pwned's range search. Only the first 5 characters of the
  // password's SHA-1 leave the server; the full password and the full
  // hash never do (k-anonymity). If the service cannot be reached in
  // 2.5 seconds the check is skipped rather than blocking sign-up.
  if (process.env.LENA_HIBP === 'off') return false;
  try {
    const sha = crypto.createHash('sha1').update(pw, 'utf8').digest('hex').toUpperCase();
    const r = await (fetchImpl || fetch)('https://api.pwnedpasswords.com/range/' + sha.slice(0, 5),
      { headers: { 'Add-Padding': 'true' }, signal: AbortSignal.timeout(2500) });
    if (!r.ok) return false;
    const body = await r.text();
    const tail = sha.slice(5);
    return body.split('\n').some((line) => {
      const [suffix, count] = line.trim().split(':');
      return suffix === tail && parseInt(count, 10) > 0;
    });
  } catch (e) { return false; }
}

/* null when the password is fine, otherwise a short code the page turns
   into a message: pw_short, pw_long, pw_common, pw_email, pw_breached. */
async function passwordProblem(pw, email, fetchImpl) {
  const s = String(pw == null ? '' : pw);
  if ([...s].length < MIN_PW) return 'pw_short';
  if (s.length > MAX_PW) return 'pw_long';
  const low = s.toLowerCase();
  if (COMMON.has(low)) return 'pw_common';
  if (/^(.)\1+$/u.test(s)) return 'pw_common';                       // aaaaaaaaaa
  if ('01234567890123456789'.includes(low) || '98765432109876543210'.includes(low) ||
      'abcdefghijklmnopqrstuvwxyz'.includes(low)) return 'pw_common';  // runs
  const local = normaliseEmail(email).split('@')[0] || '';
  if (local.length >= 4 && low.includes(local) && low.replace(local, '').length < 6) return 'pw_email';
  if (await leaked(s, fetchImpl)) return 'pw_breached';
  return null;
}

export {
  COOKIE_NAME, SESSION_DAYS,
  hashPassword, verifyPassword,
  newSessionToken, hashToken,
  sessionCookie, clearedCookie, readCookie,
  normaliseEmail, validEmail, passwordProblem, MIN_PW
};
