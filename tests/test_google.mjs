/* Sign in with Google, end to end against a real Postgres.

   Google itself is replaced by a key pair made here: tokens are signed
   with it, and the "Google keys" request is answered with its public
   half. Everything else is the real code: the signature check, the
   database, the cookie, sync and account deletion.

     DATABASE_URL=postgres://lena@127.0.0.1:5499/lenatest node tests/test_google.mjs

   Never point it at the live database. */
import crypto from 'node:crypto';
import google from '../api/auth/google.js';
import me from '../api/auth/me.js';
import logout from '../api/auth/logout.js';
import del from '../api/account/delete.js';
import sync from '../api/sync.js';
import config from '../api/config.js';
import { query } from '../api/_lib/db.js';
import { verifyGoogleIdToken, _resetGoogleKeys } from '../api/_lib/google.js';
import * as A from '../api/_lib/auth.js';

if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL to a throwaway database.'); process.exit(1); }
const CLIENT = '1234567890-test.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_ID = CLIENT;

// ── a stand-in for Google ────────────────────────────────────────────
const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
let KID = 'k1', certFetches = 0;
const jwk = () => ({ ...kp.publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o) => {
  if (String(url).startsWith('https://www.googleapis.com/oauth2/v3/certs')) {
    certFetches++;
    return new Response(JSON.stringify({ keys: [jwk()] }), { status: 200, headers: { 'cache-control': 'public, max-age=20000' } });
  }
  return realFetch(url, o);
};
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(claims = {}, { key = kp.privateKey, kid = KID, alg = 'RS256' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const p = { iss: 'https://accounts.google.com', aud: CLIENT, sub: '1001', email: 'aina@gmail.com', email_verified: true,
              name: 'Aina', picture: 'https://lh3.googleusercontent.com/a/x', iat: now, exp: now + 3600, ...claims };
  const h = b64({ alg, kid, typ: 'JWT' }), b = b64(p);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + b), key).toString('base64url');
  return h + '.' + b + '.' + sig;
}

// ── a Vercel-shaped request and response ─────────────────────────────
function call(handler, { method = 'GET', body, cookie, q, origin } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'user-agent': 'test', host: 'lenaplatform.vercel.app' };
    if (cookie) headers.cookie = cookie;
    if (origin !== undefined) headers.origin = origin; else if (method !== 'GET') headers.origin = 'https://lenaplatform.vercel.app';
    const req = { method, headers, body, query: q || {} };
    const out = { status: 0, headers: {}, body: null };
    const res = {
      setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
      status(s) { out.status = s; return res; },
      send(b) { out.body = JSON.parse(b); resolve(out); },
      json(b) { out.body = b; resolve(out); }
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
const cookieFrom = r => (r.headers['set-cookie'] || '').split(';')[0];
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond || !extra ? '' : '  [' + extra + ']')); };

await query("DELETE FROM users WHERE email_norm LIKE '%@gmail.com' OR email_norm LIKE '%@test.my'");
_resetGoogleKeys();

// ── the token check on its own ────────────────────────────────────────
const v = await verifyGoogleIdToken(token(), { clientId: CLIENT });
ok('a good token is accepted, with name and picture', v.sub === '1001' && v.email === 'aina@gmail.com' && v.name === 'Aina' && v.picture.startsWith('https://'));
const rejects = async (t, code) => { try { await verifyGoogleIdToken(t, { clientId: CLIENT }); return 'accepted'; } catch (e) { return e.code === code ? true : e.code; } };
ok('token for another website (aud) is refused', (await rejects(token({ aud: 'someone-else.apps.googleusercontent.com' }), 'wrong_audience')) === true);
ok('token not from Google (iss) is refused', (await rejects(token({ iss: 'https://evil.example' }), 'wrong_issuer')) === true);
ok('expired token is refused', (await rejects(token({ exp: Math.floor(Date.now() / 1000) - 600 }), 'expired')) === true);
ok('token signed with a different key is refused', (await rejects(token({}, { key: other.privateKey }), 'bad_signature')) === true);
ok('altered token is refused', (await rejects(token().replace(/\.([^.]+)\./, (m, p) => '.' + b64({ ...JSON.parse(Buffer.from(p, 'base64url')), sub: '9999' }) + '.'), 'bad_signature')) === true);
ok('"alg: none" trick is refused', (await rejects(b64({ alg: 'none', kid: 'k1' }) + '.' + b64({ sub: 'x' }) + '.', 'bad_token')) === true);
ok('unverified Google email is refused', (await rejects(token({ email_verified: false }), 'email_unverified')) === true);
ok('rubbish is refused', (await rejects('not.a.token', 'bad_token')) === true && (await rejects(undefined, 'bad_token')) === true);
const before = certFetches; KID = 'k2';
ok('when Google rotates keys, the new key is fetched once', (await verifyGoogleIdToken(token(), { clientId: CLIENT })).sub === '1001' && certFetches === before + 1);
const before2 = certFetches; await verifyGoogleIdToken(token(), { clientId: CLIENT });
ok('keys are reused, not fetched on every sign-in', certFetches === before2);

// ── the endpoint ─────────────────────────────────────────────────────
let r = await call(config);
ok('config hands out the client ID, email accounts off', r.body.googleClientId === CLIENT && r.body.emailAccounts === false);
r = await call(google, { method: 'POST', body: { credential: token() } });
const c1 = cookieFrom(r);
ok('new Google user: 200, account made, cookie set', r.status === 200 && r.body.user.email === 'aina@gmail.com' && r.body.user.provider === 'google' && /^lena_session=/.test(c1), JSON.stringify(r.body));
ok('cookie is HttpOnly, Secure, SameSite=Lax', /HttpOnly/.test(r.headers['set-cookie']) && /Secure/.test(r.headers['set-cookie']) && /SameSite=Lax/.test(r.headers['set-cookie']));
const uid = r.body.user.id;
r = await call(me, { cookie: c1 });
ok('me knows who it is', r.body.user && r.body.user.id === uid && r.body.user.picture && r.body.user.displayName === 'Aina');
r = await call(google, { method: 'POST', body: { credential: token({ name: 'Aina B' }) } });
ok('signing in again finds the same account (by Google number)', r.status === 200 && r.body.user.id === uid);
r = await call(google, { method: 'POST', body: { credential: token({ email: 'aina.new@gmail.com' }) } });
ok('a changed Google email still finds the same account', r.status === 200 && r.body.user.id === uid);
const n = (await query("SELECT count(*)::int AS n FROM users WHERE google_sub = '1001'")).rows[0].n;
ok('still only one account for that Google user', n === 1);
r = await call(google, { method: 'POST', body: { credential: token({ aud: 'x.apps.googleusercontent.com' }) } });
ok('bad token: 401 with a plain message, no cookie', r.status === 401 && r.body.message && !r.headers['set-cookie']);
r = await call(google, { method: 'POST', body: { credential: token() }, origin: 'https://evil.example' });
ok('sign-in posted from another website: 403', r.status === 403);
r = await call(google, { method: 'GET' });
ok('GET is not allowed', r.status === 405);
delete process.env.GOOGLE_CLIENT_ID;
r = await call(google, { method: 'POST', body: { credential: token() } });
ok('not set up yet: 503 not_configured', r.status === 503 && r.body.error === 'not_configured');
r = await call(config);
ok('config says no Google when not set up', r.body.googleClientId === null);
process.env.GOOGLE_CLIENT_ID = CLIENT;

// ── joining an older account with the same email ─────────────────────
const pw = await A.hashPassword('correct horse battery');
const old = (await query("INSERT INTO users (email, email_norm, pw_hash) VALUES ('Siti@test.my','siti@test.my',$1) RETURNING id", [pw])).rows[0].id;
await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('oldsession', $1, now() + interval '1 day')", [old]);
r = await call(google, { method: 'POST', body: { credential: token({ sub: '2002', email: 'siti@test.my', name: 'Siti' }) } });
const row = (await query('SELECT google_sub, pw_hash FROM users WHERE id = $1', [old])).rows[0];
const oldSess = (await query("SELECT count(*)::int AS n FROM sessions WHERE token_hash = 'oldsession'")).rows[0].n;
ok('same email: joined to the existing account', r.status === 200 && r.body.user.id === old && row.google_sub === '2002');
ok('…its password is removed and its other sessions ended', row.pw_hash === null && oldSess === 0);
r = await call(google, { method: 'POST', body: { credential: token({ sub: '3003', email: 'siti@test.my' }) } });
ok('a different Google account with that email cannot take it over', r.status === 409 && r.body.error === 'email_in_use');

// ── sync with a Google session ───────────────────────────────────────
const id1 = crypto.randomUUID(), id2 = crypto.randomUUID();
r = await call(sync, { method: 'PUT', cookie: c1, body: { records: [
  { id: id1, kind: 'mood', payload: { t: 1, m: 4 }, updated_at: new Date().toISOString() },
  { id: id2, kind: 'journal', payload: { id: 9, x: 'private words' }, updated_at: new Date().toISOString() }] } });
ok('push works with a Google session', r.status === 200 && r.body.applied === 2, JSON.stringify(r.body));
r = await call(sync, { method: 'PUT', cookie: c1, body: { records: [{ id: id2, kind: 'journal', payload: { id: 9 }, updated_at: new Date(Date.now() + 1000).toISOString(), deleted: true }] } });
r = await call(sync, { cookie: c1, q: { since: '1970-01-01T00:00:00Z' } });
ok('a deleted entry comes back marked deleted', r.status === 200 && r.body.records.find(x => x.id === id2).deleted === true && r.body.records.find(x => x.id === id1).deleted === false);
r = await call(sync, { method: 'PUT', cookie: c1, body: { records: [] }, origin: 'https://evil.example' });
ok('push from another website: 403', r.status === 403);
r = await call(sync, { q: {} });
ok('sync without signing in: 401', r.status === 401);

// ── sign out and delete ──────────────────────────────────────────────
r = await call(google, { method: 'POST', body: { credential: token() } });
const c2 = cookieFrom(r);
r = await call(logout, { method: 'POST', cookie: c2 });
ok('sign out ends that session', r.status === 200 && (await call(me, { cookie: c2 })).body.user === null);
r = await call(del, { method: 'POST', cookie: c1, body: { confirm: 'nope' } });
ok('delete needs the confirmation', r.status === 400);
r = await call(del, { method: 'POST', cookie: c1, body: { confirm: 'DELETE' }, origin: 'https://evil.example' });
ok('delete from another website: 403', r.status === 403);
r = await call(del, { method: 'POST', cookie: c1, body: { confirm: 'DELETE' } });
const left = (await query('SELECT (SELECT count(*) FROM users WHERE id = $1)::int AS u, (SELECT count(*) FROM records WHERE user_id = $1)::int AS r', [uid])).rows[0];
ok('a Google account (no password) can delete itself, and everything goes', r.status === 200 && left.u === 0 && left.r === 0, JSON.stringify(r.body));
ok('…and its session no longer works', (await call(me, { cookie: c1 })).body.user === null);
r = await call(del, { method: 'POST', cookie: cookieFrom(await call(google, { method: 'POST', body: { credential: token({ sub: '2002', email: 'siti@test.my' }) } })), body: { confirm: 'DELETE' } });
ok('joined account deletes too', r.status === 200);

await query("DELETE FROM users WHERE email_norm LIKE '%@gmail.com' OR email_norm LIKE '%@test.my'");
console.log(pass + '/' + (pass + fail) + ' checks passed');
process.exit(fail ? 1 : 0);
