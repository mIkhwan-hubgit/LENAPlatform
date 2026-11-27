// POST /api/auth/email  { action, ... }
//
// Email accounts: register, check the code, sign in, forgot password,
// choose a new password. One file rather than five because Vercel's
// free plan allows 12 server functions per site and LENA already has 8.
//
//   register  { email, password, displayName, lang }  -> emails a code
//   verify    { email, code }                         -> makes the account, signs in
//   login     { email, password }                     -> signs in
//   forgot    { email, lang }                         -> emails a reset code
//   reset     { email, code, password, lang }         -> new password, signs out everywhere
//
// What this follows (OWASP Authentication and Forgot Password cheat
// sheets, NIST SP 800-63B):
// - v42: the page says when an address already has an account, as most
//   sites do, so people are not left waiting for an email: register
//   answers "already registered" (and whether it signs in with Google),
//   and an account made with Google says so on sign-in and on forgot
//   password. A wrong password and an unknown address still read the
//   same, and every lookup counts towards the per-connection limit.
// - Codes: 6 random digits, only a hash stored, 15 minutes, 5 tries,
//   one live code per address, a new one at most once a minute.
// - Wrong passwords slow down rather than lock the account, so a
//   classmate cannot lock somebody out on purpose.
// - After a reset every session is ended, the person is told by email,
//   and they sign in again with the new password.
// - One email, one account, and registering never changes an existing
//   account. An account made with Google has no LENA password until its
//   owner adds one while signed in (PATCH /api/auth/me). Google sign-in
//   on an email account joins them: see google.js.
import crypto from 'node:crypto';
import { query, json, methodNotAllowed, readBody, publicUser, startSession, sameOrigin } from '../_lib/db.js';
import * as A from '../_lib/auth.js';
import { sendMail, mailConfigured } from '../_lib/mail.js';

const CODE_TRIES = 5;
const DUMMY_HASH = 'scrypt$16384$8$1$' + '00'.repeat(16) + '$' + '00'.repeat(64);
const USER_FIELDS = 'id, email, display_name, picture, google_sub, pw_hash';

// ── small helpers ───────────────────────────────────────────────────
function clientIp(req) {
  const h = req.headers || {};
  const ip = h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] ||
             (req.socket && req.socket.remoteAddress) || 'unknown';
  return String(ip).trim().slice(0, 64);
}
const langOf = (b) => (b && b.lang === 'ms') ? 'ms' : 'en';
const codeHash = (email, purpose, code) => crypto.createHash('sha256').update(email + '|' + purpose + '|' + code).digest('hex');
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const userOut = (u) => publicUser({ ...u, google: !!u.google_sub, has_password: !!u.pw_hash });

// ── counters ────────────────────────────────────────────────────────
/* Adds one to a counter and returns its count within the window. */
async function bump(key, windowSec) {
  const r = await query(
    `INSERT INTO auth_throttle (key, hits, window_start) VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN auth_throttle.window_start < now() - make_interval(secs => $2::float8)
                   THEN 1 ELSE auth_throttle.hits + 1 END,
       window_start = CASE WHEN auth_throttle.window_start < now() - make_interval(secs => $2::float8)
                   THEN now() ELSE auth_throttle.window_start END
     RETURNING hits`, [key, windowSec]);
  return r.rows[0].hits;
}
async function waitFor(keys) {
  const r = await query(
    `SELECT max(extract(epoch FROM (blocked_until - now()))) AS s
       FROM auth_throttle WHERE key = ANY($1) AND blocked_until > now()`, [keys]);
  const s = r.rows[0] && r.rows[0].s;
  return s ? Math.ceil(Number(s)) : 0;
}
async function hold(key, seconds) {
  await query('UPDATE auth_throttle SET blocked_until = now() + make_interval(secs => $2::float8) WHERE key = $1', [key, seconds]);
}
async function housekeeping() {
  // No scheduler on Neon's free plan, so tidy up now and then.
  if (Math.random() > 0.05) return;
  await query(`DELETE FROM email_codes WHERE expires_at < now() - interval '1 day'`);
  await query(`DELETE FROM auth_throttle WHERE window_start < now() - interval '1 day'
                 AND (blocked_until IS NULL OR blocked_until < now())`);
  await query('DELETE FROM sessions WHERE expires_at < now()');
}

/* Emails go to an inbox somebody can be annoyed through, so they are
   limited: 6 an hour to one address (quietly), 100 an hour from one
   connection (a whole class on school wifi shares one). */
async function mayEmail(email, ip, res) {
  if (await bump('ip-send:' + ip, 3600) > 100) {
    json(res, 429, { error: 'slow_down', retryAfter: 600 });
    return null;
  }
  return (await bump('send:' + email, 3600)) <= 6;
}
async function freshCode(email, purpose) {
  const r = await query(
    `SELECT created_at > now() - interval '60 seconds' AS fresh FROM email_codes
      WHERE email_norm = $1 AND purpose = $2`, [email, purpose]);
  return !!(r.rows[0] && r.rows[0].fresh);
}
async function storeCode(email, purpose, pwHash, name, typed) {
  const code = newCode();
  await query(
    `INSERT INTO email_codes (email_norm, purpose, code_hash, pw_hash, display_name, attempts, created_at, expires_at, email)
     VALUES ($1, $2, $3, $4, $5, 0, now(), now() + interval '15 minutes', $6)
     ON CONFLICT (email_norm, purpose) DO UPDATE SET
       code_hash = EXCLUDED.code_hash, pw_hash = EXCLUDED.pw_hash, display_name = EXCLUDED.display_name,
       attempts = 0, created_at = now(), expires_at = EXCLUDED.expires_at, email = EXCLUDED.email`,
    [email, purpose, codeHash(email, purpose, code), pwHash, name, typed || email]);
  return code;
}
/* Checks a typed code. Returns the stored row, or answers the request. */
async function checkCode(email, purpose, typed, ip, res) {
  if (await bump('ip-code:' + ip, 3600) > 60) { json(res, 429, { error: 'slow_down', retryAfter: 600 }); return null; }
  const code = String(typed || '').replace(/\D/g, '');
  const r = await query(
    `SELECT *, expires_at < now() AS expired FROM email_codes WHERE email_norm = $1 AND purpose = $2`, [email, purpose]);
  const row = r.rows[0];
  if (!row || row.expired || row.attempts >= CODE_TRIES) {
    json(res, 400, { error: 'code_expired' }); return null;
  }
  if (code.length !== 6 || !sameHash(codeHash(email, purpose, code), row.code_hash)) {
    const up = await query(
      `UPDATE email_codes SET attempts = attempts + 1 WHERE email_norm = $1 AND purpose = $2 RETURNING attempts`,
      [email, purpose]);
    const left = Math.max(0, CODE_TRIES - ((up.rows[0] && up.rows[0].attempts) || CODE_TRIES));
    if (!left) await query('DELETE FROM email_codes WHERE email_norm = $1 AND purpose = $2', [email, purpose]);
    json(res, 400, { error: left ? 'wrong_code' : 'code_expired', triesLeft: left }); return null;
  }
  await query('DELETE FROM email_codes WHERE email_norm = $1 AND purpose = $2', [email, purpose]);
  return row;
}

// ── actions ─────────────────────────────────────────────────────────
async function register(req, res, b, ip) {
  const email = A.normaliseEmail(b.email);
  if (!A.validEmail(email)) return json(res, 400, { error: 'bad_email' });
  const problem = await A.passwordProblem(b.password, email);
  if (problem) return json(res, 400, { error: problem });
  const name = String(b.displayName || '').trim().slice(0, 80) || null;

  const may = await mayEmail(email, ip, res);
  if (may === null) return;
  const done = () => json(res, 200, { ok: true, next: 'code' });
  const u = (await query(`SELECT ${USER_FIELDS} FROM users WHERE email_norm = $1`, [email])).rows[0];
  // Already has an account: say so here, and how it signs in. No email.
  if (u) return json(res, 409, { error: 'already_registered', via: u.pw_hash ? 'email' : 'google' });
  if (!may) return done();
  const pwHash = await A.hashPassword(String(b.password));
  try {
    if (await freshCode(email, 'signup')) return done();
    const code = await storeCode(email, 'signup', pwHash, name, String(b.email).trim().slice(0, 254));
    await sendMail(email, 'signup_code', langOf(b), { code, name });
    return done();
  } catch (e) {
    console.error('register email failed', e && e.message);
    await query(`DELETE FROM email_codes WHERE email_norm = $1 AND purpose = 'signup'`, [email]).catch(() => {});
    return json(res, 503, { error: 'email_unavailable' });
  }
}

async function verify(req, res, b, ip) {
  const email = A.normaliseEmail(b.email);
  if (!A.validEmail(email)) return json(res, 400, { error: 'code_expired' });
  const row = await checkCode(email, 'signup', b.code, ip, res);
  if (!row) return;

  let u = (await query(`SELECT ${USER_FIELDS} FROM users WHERE email_norm = $1`, [email])).rows[0];
  let created = false;
  if (!u) {
    try {
      u = (await query(
        `INSERT INTO users (email, email_norm, pw_hash, display_name, email_verified, last_login_at)
         VALUES ($1, $2, $3, $4, true, now()) RETURNING ${USER_FIELDS}`,
        [row.email || email, email, row.pw_hash, row.display_name])).rows[0];
      created = true;
    } catch (e) {
      if (!(e && e.code === '23505')) throw e;
      u = (await query(`SELECT ${USER_FIELDS} FROM users WHERE email_norm = $1`, [email])).rows[0];
    }
  }
  // Made in the meantime (another tab, or Google): never changed here.
  if (!created) return json(res, 409, { error: 'already_registered' });
  await query('DELETE FROM auth_throttle WHERE key = $1 OR key LIKE $2', ['la:' + email, 'lf:' + email + ':%']);
  await startSession(req, res, u.id);
  return json(res, 200, { user: userOut(u), created });
}

async function login(req, res, b, ip) {
  const email = A.normaliseEmail(b.email);
  const pw = String(b.password == null ? '' : b.password);
  const keyF = 'lf:' + email + ':' + ip, keyA = 'la:' + email;
  if (!A.validEmail(email) || !pw) return json(res, 401, { error: 'bad_credentials' });

  const wait = await waitFor([keyF, keyA]);
  if (wait > 0) return json(res, 429, { error: 'slow_down', retryAfter: wait });

  const u = (await query(`SELECT ${USER_FIELDS} FROM users WHERE email_norm = $1`, [email])).rows[0];
  // Made with Google and no LENA password yet: say so, so the person
  // knows to use the Google button (or add a password once inside).
  if (u && !u.pw_hash) return json(res, 401, { error: 'google_account' });
  // Same work whether or not the account exists, so a wrong password
  // and an unknown address cannot be told apart by timing.
  const good = await A.verifyPassword(pw, (u && u.pw_hash) || DUMMY_HASH) && !!(u && u.pw_hash);
  if (!good) {
    // From one connection: after 5 misses, wait 30 s, then 1, 2, 4,
    // then 5 minutes at most. From everywhere: 30 misses in an hour
    // pauses the address for 15 minutes.
    const f = await bump(keyF, 3600);
    if (f >= 5) await hold(keyF, Math.min(30 * 2 ** (f - 5), 300));
    const a = await bump(keyA, 3600);
    if (a >= 30) await hold(keyA, 900);
    return json(res, 401, { error: 'bad_credentials' });
  }
  await query('DELETE FROM auth_throttle WHERE key = $1', [keyF]);
  await query('UPDATE users SET last_login_at = now(), failed_logins = 0, locked_until = NULL WHERE id = $1', [u.id]);
  await startSession(req, res, u.id);
  return json(res, 200, { user: userOut(u) });
}

async function forgot(req, res, b, ip) {
  const email = A.normaliseEmail(b.email);
  if (!A.validEmail(email)) return json(res, 400, { error: 'bad_email' });
  const done = () => json(res, 200, { ok: true, next: 'reset' });
  const may = await mayEmail(email, ip, res);
  if (may === null) return;
  const u = (await query(`SELECT ${USER_FIELDS} FROM users WHERE email_norm = $1`, [email])).rows[0];
  if (!u) { await sleep(700 + Math.floor(Math.random() * 800)); return done(); }  // about as long as sending
  // Made with Google: there is no LENA password to reset. Say so here.
  if (!u.pw_hash) return json(res, 409, { error: 'google_account' });
  if (!may || await freshCode(email, 'reset')) return done();
  try {
    const code = await storeCode(email, 'reset', null, null);
    await sendMail(email, 'reset_code', langOf(b), { code, name: u.display_name });
  } catch (e) {
    console.error('reset email failed', e && e.message);
    await query(`DELETE FROM email_codes WHERE email_norm = $1 AND purpose = 'reset'`, [email]).catch(() => {});
    return json(res, 503, { error: 'email_unavailable' });
  }
  return done();
}

async function reset(req, res, b, ip) {
  const email = A.normaliseEmail(b.email);
  if (!A.validEmail(email)) return json(res, 400, { error: 'code_expired' });
  const problem = await A.passwordProblem(b.password, email);
  if (problem) return json(res, 400, { error: problem });
  const row = await checkCode(email, 'reset', b.code, ip, res);
  if (!row) return;
  const u = (await query(`SELECT ${USER_FIELDS} FROM users WHERE email_norm = $1`, [email])).rows[0];
  if (!u || !u.pw_hash) return json(res, 400, { error: 'code_expired' });
  const pwHash = await A.hashPassword(String(b.password));
  await query(`UPDATE users SET pw_hash = $2, email_verified = true, failed_logins = 0, locked_until = NULL WHERE id = $1`, [u.id, pwHash]);
  await query('DELETE FROM sessions WHERE user_id = $1', [u.id]);
  await query('DELETE FROM auth_throttle WHERE key = $1 OR key LIKE $2', ['la:' + email, 'lf:' + email + ':%']);
  try { await sendMail(email, 'pw_changed', langOf(b), { name: u.display_name }); }
  catch (e) { console.error('changed-notice email failed', e && e.message); }
  // Not signed in here: the person signs in with the new password.
  return json(res, 200, { ok: true });
}

const ACTIONS = { register, verify, login, forgot, reset };

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOrigin(req)) return json(res, 403, { error: 'wrong_origin' });
  if (!mailConfigured()) return json(res, 503, { error: 'not_configured' });
  const b = await readBody(req);
  const act = ACTIONS[b && b.action];
  if (!act) return json(res, 400, { error: 'unknown_action' });
  try {
    await act(req, res, b, clientIp(req));
    housekeeping().catch(() => {});
  } catch (e) {
    console.error('email auth failed', b.action, e);
    if (!res.headersSent) json(res, 500, { error: 'server_error' });
  }
}
