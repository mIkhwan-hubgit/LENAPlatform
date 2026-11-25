/* Email accounts, end to end against a real Postgres.

   Gmail is replaced by a stand-in that keeps the emails, so the tests
   can read the codes the way a person would. Everything else is the
   real code: passwords, codes, counters, sessions, the database.

     DATABASE_URL=postgres://lena@127.0.0.1:5499/lenatest node tests/test_email.mjs

   Never point it at the live database. */
import crypto from 'node:crypto';
import email from '../api/auth/email.js';
import google from '../api/auth/google.js';
import me from '../api/auth/me.js';
import del from '../api/account/delete.js';
import config from '../api/config.js';
import { query } from '../api/_lib/db.js';
import { build } from '../api/_lib/mail.js';
import * as A from '../api/_lib/auth.js';

if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL to a throwaway database.'); process.exit(1); }
process.env.LENA_HIBP = 'off';

// ── a stand-in for Gmail ─────────────────────────────────────────────
const outbox = []; let smtpDown = false;
globalThis.__lenaMailTransport = { async sendMail(m) { if (smtpDown) throw new Error('smtp down'); outbox.push(m); } };
const mailsTo = (to) => outbox.filter(m => m.to === to);
const lastCode = (to) => { const m = mailsTo(to).pop(); const x = m && /\b(\d{6})\b/.exec(m.text); return x && x[1]; };

// ── a stand-in for Google (for the joining tests) ────────────────────
const CLIENT = '1234567890-test.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_ID = CLIENT;
const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o) => {
  if (String(url).startsWith('https://www.googleapis.com/oauth2/v3/certs'))
    return new Response(JSON.stringify({ keys: [{ ...kp.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] }), { status: 200 });
  return realFetch(url, o);
};
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function gtoken(claims) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const b = b64({ iss: 'https://accounts.google.com', aud: CLIENT, email_verified: true, iat: now, exp: now + 3600, ...claims });
  return h + '.' + b + '.' + crypto.sign('RSA-SHA256', Buffer.from(h + '.' + b), kp.privateKey).toString('base64url');
}

// ── a Vercel-shaped request and response ─────────────────────────────
function call(handler, { method = 'POST', body, cookie, ip = '10.0.0.1', origin } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'user-agent': 'test', host: 'lenaplatform.vercel.app', 'x-real-ip': ip };
    if (cookie) headers.cookie = cookie;
    headers.origin = origin !== undefined ? origin : 'https://lenaplatform.vercel.app';
    if (method === 'GET' && origin === undefined) delete headers.origin;
    const req = { method, headers, body };
    const out = { status: 0, headers: {}, body: null };
    const res = {
      headersSent: false,
      setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
      status(s) { out.status = s; return res; },
      send(b) { res.headersSent = true; out.body = JSON.parse(b); resolve(out); },
      json(b) { res.headersSent = true; out.body = b; resolve(out); }
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
const E = (body, o) => call(email, { body, ...o });
const cookieFrom = r => (r.headers['set-cookie'] || '').split(';')[0];
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond || extra === undefined ? '' : '  [' + extra + ']')); };
const J = JSON.stringify;
const clean = async () => {
  await query("DELETE FROM users WHERE email_norm LIKE '%@test.my'");
  await query("DELETE FROM email_codes WHERE email_norm LIKE '%@test.my'");
  await query('DELETE FROM auth_throttle');
};
await clean();

// ── passwords ────────────────────────────────────────────────────────
ok('9 characters is too short', await A.passwordProblem('abcdefgh9', 'a@test.my') === 'pw_short');
ok('10 characters is fine', await A.passwordProblem('rimau tidur', 'a@test.my') === null);
ok('spaces and Malay are fine', await A.passwordProblem('kucing saya suka nasi', 'a@test.my') === null);
ok('length counts letters, not bytes', await A.passwordProblem('ééééééééé', 'a@test.my') === 'pw_short');
ok('common password refused', await A.passwordProblem('Password123', 'a@test.my') === 'pw_common');
ok('a run of digits refused', await A.passwordProblem('0123456789', 'a@test.my') === 'pw_common');
ok('one character repeated refused', await A.passwordProblem('zzzzzzzzzzzz', 'a@test.my') === 'pw_common');
ok('password made of the email refused', await A.passwordProblem('aina.rahman1', 'aina.rahman@test.my') === 'pw_email');
ok('email name inside a long phrase is fine', await A.passwordProblem('aina loves rainy evenings', 'aina@test.my') === null);
ok('200+ characters refused', await A.passwordProblem('x'.repeat(201) + 'y', 'a@test.my') === 'pw_long');
{
  delete process.env.LENA_HIBP;
  const pw = 'correct horse staple';
  const sha = crypto.createHash('sha1').update(pw).digest('hex').toUpperCase();
  let asked = '';
  const hibp = async (url) => { asked = url; return new Response('0000000000000000000000000000000000A:3\r\n' + sha.slice(5) + ':42\r\n', { status: 200 }); };
  ok('leaked password refused (Have I Been Pwned)', await A.passwordProblem(pw, 'a@test.my', hibp) === 'pw_breached');
  ok('only 5 characters of the hash are sent', /\/range\/[0-9A-F]{5}$/.test(asked) && !asked.includes(sha.slice(5)), asked);
  ok('a password not in the list passes', await A.passwordProblem('a quiet blue morning', 'a@test.my', hibp) === null);
  ok('service unreachable: check skipped, not blocked', await A.passwordProblem('a quiet blue morning', 'a@test.my', async () => { throw new Error('down'); }) === null);
  process.env.LENA_HIBP = 'off';
}

// ── config and guards ────────────────────────────────────────────────
let r = await call(config, { method: 'GET' });
ok('config: email accounts on once mail is set up', r.body.emailAccounts === true, J(r.body));
r = await E({ action: 'register', email: 'x@test.my', password: 'long enough pw' }, { origin: 'https://evil.example' });
ok('another website is turned away', r.status === 403);
r = await call(email, { method: 'GET' });
ok('GET is refused', r.status === 405);
r = await E({ action: 'nope' });
ok('unknown action refused', r.status === 400 && r.body.error === 'unknown_action');

// ── register and verify ──────────────────────────────────────────────
const PW = 'rainy days in gombak';
r = await E({ action: 'register', email: 'Aina@Test.my', password: 'short', displayName: 'Aina', lang: 'en' });
ok('weak password: told why, nothing sent', r.status === 400 && r.body.error === 'pw_short' && mailsTo('aina@test.my').length === 0);
r = await E({ action: 'register', email: 'not-an-email', password: PW });
ok('bad email refused', r.status === 400 && r.body.error === 'bad_email');
r = await E({ action: 'register', email: 'Aina@Test.my', password: PW, displayName: 'Aina', lang: 'en' });
const firstAnswer = J(r.body);
ok('register: "check your email"', r.status === 200 && r.body.next === 'code', firstAnswer);
let code = lastCode('aina@test.my');
let m = mailsTo('aina@test.my').pop();
ok('a 6-digit code is emailed', /^\d{6}$/.test(code || '') && m.subject === 'Your LENA code: ' + code, m && m.subject);
ok('the email greets by name and has no links', /^Hi Aina,/.test(m.text) && !/https?:\/\//.test(m.text) && !/href=/.test(m.html));
ok('the email has no em or en dashes', !/[–—]/.test(m.text + m.html + m.subject));
let row = (await query("SELECT * FROM email_codes WHERE email_norm='aina@test.my'")).rows[0];
ok('only a hash of the code is stored', row && row.code_hash.length === 64 && !J(row).includes('"' + code + '"'));
ok('the chosen password is stored hashed', row && row.pw_hash.startsWith('scrypt$') && !J(row).includes(PW));
ok('no account until the code is typed', (await query("SELECT 1 FROM users WHERE email_norm='aina@test.my'")).rows.length === 0);
r = await E({ action: 'login', email: 'aina@test.my', password: PW });
ok('cannot sign in before typing the code', r.status === 401);
const wrong = code === '000000' ? '111111' : '000000';
r = await E({ action: 'verify', email: 'aina@test.my', code: wrong });
ok('wrong code: tries left shown', r.status === 400 && r.body.error === 'wrong_code' && r.body.triesLeft === 4, J(r.body));
r = await E({ action: 'verify', email: 'AINA@test.my ', code: code.slice(0, 3) + ' ' + code.slice(3) });
ok('right code (any spacing, any case): account made, signed in', r.status === 200 && r.body.created === true && r.body.user.hasPassword === true && r.body.user.provider === 'email', J(r.body));
let cookie = cookieFrom(r);
ok('session cookie is HttpOnly and Secure', /HttpOnly/.test(r.headers['set-cookie']) && /Secure/.test(r.headers['set-cookie']));
r = await call(me, { method: 'GET', cookie });
ok('/me knows who it is', r.body.user && r.body.user.email === 'Aina@Test.my' && r.body.user.displayName === 'Aina', J(r.body));
ok('the address is marked checked', (await query("SELECT email_verified FROM users WHERE email_norm='aina@test.my'")).rows[0].email_verified === true);
r = await E({ action: 'verify', email: 'aina@test.my', code });
ok('a used code does not work again', r.status === 400 && r.body.error === 'code_expired');

// ── registering an address that already has an account ───────────────
outbox.length = 0;
r = await E({ action: 'register', email: 'aina@test.my', password: 'another long one', lang: 'en' });
ok('same answer as a new address (nothing given away)', r.status === 200 && J(r.body) === firstAnswer);
m = mailsTo('aina@test.my').pop();
ok('the owner is told by email instead, with no code', m && m.subject === 'You already have a LENA account' && !/\b\d{6}\b/.test(m.text), m && m.subject);
ok('no code is made', (await query("SELECT 1 FROM email_codes WHERE email_norm='aina@test.my'")).rows.length === 0);
r = await E({ action: 'login', email: 'aina@test.my', password: 'another long one' });
ok('and the old password is unchanged', r.status === 401);

// ── Malay ────────────────────────────────────────────────────────────
r = await E({ action: 'register', email: 'siti@test.my', password: PW, displayName: 'Siti', lang: 'ms' });
m = mailsTo('siti@test.my').pop();
ok('Malay: the email is in Malay', m && /^Kod LENA awak: \d{6}$/.test(m.subject) && /^Hai Siti,/.test(m.text) && /sah selama 15 minit/.test(m.text), m && m.subject);

// ── resend, tries, expiry ────────────────────────────────────────────
const before = mailsTo('siti@test.my').length;
r = await E({ action: 'register', email: 'siti@test.my', password: PW, lang: 'ms' });
ok('asking again within a minute sends nothing new', r.status === 200 && mailsTo('siti@test.my').length === before);
const oldCode = lastCode('siti@test.my');
await query("UPDATE email_codes SET created_at = now() - interval '61 seconds' WHERE email_norm='siti@test.my'");
r = await E({ action: 'register', email: 'siti@test.my', password: PW, lang: 'ms' });
const newCode = lastCode('siti@test.my');
ok('after a minute a new code is sent', mailsTo('siti@test.my').length === before + 1 && newCode);
if (newCode !== oldCode) {
  r = await E({ action: 'verify', email: 'siti@test.my', code: oldCode });
  ok('the old code stops working', r.status === 400);
} else ok('the old code stops working (codes happened to match)', true);
await query("UPDATE email_codes SET attempts = 0 WHERE email_norm='siti@test.my'");
for (let i = 0; i < 4; i++) await E({ action: 'verify', email: 'siti@test.my', code: newCode === '999999' ? '888888' : '999999' });
r = await E({ action: 'verify', email: 'siti@test.my', code: newCode === '999999' ? '888888' : '999999' });
ok('5th wrong code: the code is used up', r.status === 400 && r.body.error === 'code_expired' && r.body.triesLeft === 0, J(r.body));
r = await E({ action: 'verify', email: 'siti@test.my', code: newCode });
ok('then even the right code fails (ask for a new one)', r.status === 400 && r.body.error === 'code_expired');
await query("UPDATE email_codes SET created_at = now() - interval '2 minutes' WHERE email_norm='siti@test.my'");
await E({ action: 'register', email: 'siti@test.my', password: PW, lang: 'ms' });
const c3 = lastCode('siti@test.my');
await query("UPDATE email_codes SET expires_at = now() - interval '1 second' WHERE email_norm='siti@test.my'");
r = await E({ action: 'verify', email: 'siti@test.my', code: c3 });
ok('a code older than 15 minutes fails', r.status === 400 && r.body.error === 'code_expired');

// ── email sending fails ──────────────────────────────────────────────
smtpDown = true;
r = await E({ action: 'register', email: 'down@test.my', password: PW });
smtpDown = false;
ok('Gmail down: says so, leaves no half-made code', r.status === 503 && r.body.error === 'email_unavailable' &&
   (await query("SELECT 1 FROM email_codes WHERE email_norm='down@test.my'")).rows.length === 0);
r = await E({ action: 'register', email: 'down@test.my', password: PW });
ok('…and trying again straight away works', r.status === 200 && lastCode('down@test.my'));

// ── sign in ──────────────────────────────────────────────────────────
await query('DELETE FROM auth_throttle');
r = await E({ action: 'login', email: ' AINA@test.my', password: PW });
ok('sign in with the right password', r.status === 200 && r.body.user.email === 'Aina@Test.my' && cookieFrom(r));
r = await E({ action: 'login', email: 'aina@test.my', password: PW + 'x' });
const wrongBody = J(r.body);
ok('wrong password: 401', r.status === 401 && r.body.error === 'bad_credentials');
r = await E({ action: 'login', email: 'nobody@test.my', password: PW });
ok('unknown address: exactly the same answer', r.status === 401 && J(r.body) === wrongBody);
await query("INSERT INTO users (email, email_norm, google_sub, email_verified) VALUES ('g@test.my','g@test.my','g-only-1',true)");
r = await E({ action: 'login', email: 'g@test.my', password: PW });
ok('Google-only account: the same answer too', r.status === 401 && J(r.body) === wrongBody);
let t0 = Date.now(); await E({ action: 'login', email: 'nobody@test.my', password: PW }); const tNone = Date.now() - t0;
t0 = Date.now(); await E({ action: 'login', email: 'aina@test.my', password: PW + 'y' }); const tReal = Date.now() - t0;
ok('timing: unknown and real addresses take about as long', Math.abs(tNone - tReal) < 120, tNone + 'ms vs ' + tReal + 'ms');

// ── slowing down guessing ────────────────────────────────────────────
await query('DELETE FROM auth_throttle');
for (let i = 0; i < 4; i++) await E({ action: 'login', email: 'aina@test.my', password: 'guess ' + i + ' xxxxx' }, { ip: '10.0.0.66' });
r = await E({ action: 'login', email: 'aina@test.my', password: 'guess 5 xxxxx' }, { ip: '10.0.0.66' });
ok('5th wrong guess is still answered normally', r.status === 401);
r = await E({ action: 'login', email: 'aina@test.my', password: PW }, { ip: '10.0.0.66' });
ok('then that connection waits (even with the right password)', r.status === 429 && r.body.error === 'slow_down' && r.body.retryAfter > 0 && r.body.retryAfter <= 30, J(r.body));
r = await E({ action: 'login', email: 'aina@test.my', password: PW }, { ip: '10.0.0.77' });
ok('the owner on another connection is not locked out', r.status === 200);
const hold = (await query("SELECT extract(epoch FROM blocked_until - now()) s FROM auth_throttle WHERE key = 'lf:aina@test.my:10.0.0.66'")).rows[0];
ok('the wait is short (30 s at first)', hold && hold.s > 20 && hold.s <= 30, hold && hold.s);
await query("UPDATE auth_throttle SET hits = 9, blocked_until = NULL WHERE key = 'lf:aina@test.my:10.0.0.66'");
await E({ action: 'login', email: 'aina@test.my', password: 'guess again xx' }, { ip: '10.0.0.66' });
const hold2 = (await query("SELECT extract(epoch FROM blocked_until - now()) s FROM auth_throttle WHERE key = 'lf:aina@test.my:10.0.0.66'")).rows[0];
ok('it grows, but never past 5 minutes', hold2 && hold2.s > 240 && hold2.s <= 300, hold2 && hold2.s);
await query('DELETE FROM auth_throttle');
for (let i = 0; i < 30; i++) await E({ action: 'login', email: 'aina@test.my', password: 'spray ' + i + ' xxxx' }, { ip: '10.1.' + i + '.1' });
r = await E({ action: 'login', email: 'aina@test.my', password: PW }, { ip: '10.9.9.9' });
ok('30 wrong guesses from many places in an hour: the address pauses 15 min', r.status === 429 && r.body.retryAfter > 800, J(r.body));

// ── forgot password ──────────────────────────────────────────────────
outbox.length = 0;
r = await E({ action: 'forgot', email: 'nobody@test.my', lang: 'en' });
const forgotNone = J(r.body);
ok('forgot, no account: "check your email", nothing sent', r.status === 200 && r.body.next === 'reset' && mailsTo('nobody@test.my').length === 0);
r = await E({ action: 'forgot', email: 'aina@test.my', lang: 'en' });
ok('forgot, real account: the same answer', r.status === 200 && J(r.body) === forgotNone);
const rc = lastCode('aina@test.my');
m = mailsTo('aina@test.my').pop();
ok('a reset code is emailed', m && m.subject === 'Your LENA password reset code: ' + rc, m && m.subject);
// a second device that is signed in now
const other = cookieFrom(await E({ action: 'login', email: 'aina@test.my', password: PW }, { ip: '10.2.2.2' })) || cookie;
r = await E({ action: 'reset', email: 'aina@test.my', code: rc, password: 'short' });
ok('weak new password: told why, code not used up', r.status === 400 && r.body.error === 'pw_short' &&
   (await query("SELECT attempts FROM email_codes WHERE email_norm='aina@test.my' AND purpose='reset'")).rows[0].attempts === 0);
r = await E({ action: 'reset', email: 'aina@test.my', code: rc === '123456' ? '654321' : '123456', password: 'a brand new pass' });
ok('wrong reset code refused', r.status === 400 && r.body.error === 'wrong_code');
r = await E({ action: 'reset', email: 'aina@test.my', code: rc, password: 'a brand new pass' });
ok('right code: password changed, not signed in (sign in again)', r.status === 200 && r.body.ok && !r.headers['set-cookie'], J(r.body));
r = await call(me, { method: 'GET', cookie: other });
ok('every other device is signed out', r.body.user === null);
m = mailsTo('aina@test.my').pop();
ok('the owner gets a "password changed" email', m && m.subject === 'Your LENA password was changed');
ok('the wrong-password counters on the address are cleared', (await query("SELECT count(*)::int n FROM auth_throttle WHERE key LIKE 'l_:aina@test.my%'")).rows[0].n === 0);
r = await E({ action: 'login', email: 'aina@test.my', password: PW });
ok('old password no longer works', r.status === 401);
r = await E({ action: 'login', email: 'aina@test.my', password: 'a brand new pass' });
ok('new password works', r.status === 200);
cookie = cookieFrom(r);

// ── one email, one account ───────────────────────────────────────────
// (a) Google first, then register with the same address: not allowed
await query("INSERT INTO users (email, email_norm, google_sub, display_name, email_verified) VALUES ('Nur@test.my','nur@test.my','g-nur','Nur',true)");
const nurId = (await query("SELECT id FROM users WHERE email_norm='nur@test.my'")).rows[0].id;
await query(`INSERT INTO records (id, user_id, kind, payload, updated_at) VALUES (gen_random_uuid(), $1, 'mood', '{"m":4}', now())`, [nurId]);
outbox.length = 0;
r = await E({ action: 'register', email: 'nur@test.my', password: PW, lang: 'en' });
m = mailsTo('nur@test.my').pop();
ok('Google account + register: same answer on the page', r.status === 200 && J(r.body) === firstAnswer);
ok('…the email says to use Continue with Google, and has no code', m && m.subject === 'You already have a LENA account' &&
   /made with Continue with Google/.test(m.text) && /choose Continue with Google/.test(m.text) && !/\b\d{6}\b/.test(m.text), m && m.text);
ok('…no code is made', (await query("SELECT 1 FROM email_codes WHERE email_norm='nur@test.my'")).rows.length === 0);
r = await E({ action: 'verify', email: 'nur@test.my', code: '123456' });
ok('…so nothing can be confirmed', r.status === 400);
r = await E({ action: 'login', email: 'nur@test.my', password: PW });
ok('…and the Google account still has no password', r.status === 401 &&
   (await query('SELECT pw_hash FROM users WHERE id = $1', [nurId])).rows[0].pw_hash === null);
// a code made before this change cannot add a password either
await query(`INSERT INTO email_codes (email_norm, purpose, code_hash, pw_hash, expires_at) VALUES ('nur@test.my','signup',$1,$2, now() + interval '10 minutes')`,
  [crypto.createHash('sha256').update('nur@test.my|signup|424242').digest('hex'), await A.hashPassword(PW)]);
r = await E({ action: 'verify', email: 'nur@test.my', code: '424242' });
ok('an older code for a Google account is refused', r.status === 409 && r.body.error === 'already_registered' &&
   (await query('SELECT pw_hash FROM users WHERE id = $1', [nurId])).rows[0].pw_hash === null, J(r.body));
outbox.length = 0;
r = await E({ action: 'forgot', email: 'nur@test.my', lang: 'en' });
m = mailsTo('nur@test.my').pop();
ok('Forgot password on a Google account: same answer, email explains, no code', r.status === 200 && J(r.body) === forgotNone &&
   m && m.subject === 'About your LENA password' && !/\b\d{6}\b/.test(m.text) &&
   (await query("SELECT 1 FROM email_codes WHERE email_norm='nur@test.my' AND purpose='reset'")).rows.length === 0, m && m.subject);
r = await E({ action: 'forgot', email: 'nur@test.my', lang: 'ms' });
await query("UPDATE email_codes SET created_at = now() - interval '2 minutes' WHERE email_norm='nur@test.my'");
ok('its entries are untouched', (await query('SELECT count(*)::int n FROM records WHERE user_id = $1', [nurId])).rows[0].n === 1);
r = await call(google, { body: { credential: gtoken({ sub: 'g-nur', email: 'nur@test.my', name: 'Nur' }) } });
ok('Continue with Google still opens it', r.status === 200 && r.body.user.id === nurId);
// (b) register first, then Google with the same address keeps the password
r = await call(google, { body: { credential: gtoken({ sub: 'g-aina', email: 'aina@test.my', name: 'Aina' }) } });
const ainaId = (await query("SELECT id FROM users WHERE email_norm='aina@test.my'")).rows[0].id;
ok('email account + Google: joined, same account', r.status === 200 && r.body.user.id === ainaId);
r = await E({ action: 'login', email: 'aina@test.my', password: 'a brand new pass' });
ok('the password keeps working (checked address)', r.status === 200);
r = await call(me, { method: 'GET', cookie });
ok('and the existing session was not ended', r.body.user && r.body.user.id === ainaId);
// (c) an old unchecked account: Google takes over and the password goes
await query(`INSERT INTO users (email, email_norm, pw_hash, email_verified) VALUES ('old@test.my','old@test.my',$1,false)`, [await A.hashPassword(PW)]);
r = await call(google, { body: { credential: gtoken({ sub: 'g-old', email: 'old@test.my' }) } });
r = await E({ action: 'login', email: 'old@test.my', password: PW });
ok('an old unchecked account: the password is removed on joining', r.status === 401);

// ── deleting an account with a password ──────────────────────────────
const ainaCookie = cookieFrom(await E({ action: 'login', email: 'aina@test.my', password: 'a brand new pass' }));
r = await call(del, { body: { confirm: 'DELETE', password: 'not it at all' }, cookie: ainaCookie });
ok('delete: wrong password refused', r.status === 401 && r.body.error === 'bad_password');
r = await call(del, { body: { confirm: 'DELETE', password: 'a brand new pass' }, cookie: ainaCookie });
ok('delete: right password deletes the account', r.status === 200 && (await query("SELECT 1 FROM users WHERE email_norm='aina@test.my'")).rows.length === 0);
r = await E({ action: 'login', email: 'aina@test.my', password: 'a brand new pass' });
ok('and it can no longer sign in', r.status === 401);

// ── the email templates ──────────────────────────────────────────────
let allOk = true, bad = '';
for (const lang of ['en', 'ms']) for (const kind of ['signup_code', 'google_register', 'google_forgot', 'already', 'reset_code', 'pw_changed']) {
  const x = build(kind, lang, { code: '123456', name: 'Ali <b>' });
  if (/[–—]/.test(x.text + x.html + x.subject) || x.html.includes('Ali <b>') || !x.html.includes('Ali &lt;b&gt;') || /https?:\/\//.test(x.text + x.html)) { allOk = false; bad = lang + ' ' + kind; }
}
ok('every email, both languages: no dashes, names escaped, no links', allOk, bad);

// ── not set up ───────────────────────────────────────────────────────
const saved = globalThis.__lenaMailTransport; delete globalThis.__lenaMailTransport;
r = await E({ action: 'register', email: 'x@test.my', password: PW });
ok('without Gmail settings: 503, nothing happens', r.status === 503 && r.body.error === 'not_configured');
r = await call(config, { method: 'GET' });
ok('and config says email accounts are off', r.body.emailAccounts === false);
globalThis.__lenaMailTransport = saved;

await clean();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
