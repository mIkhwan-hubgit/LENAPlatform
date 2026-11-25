/* Unit tests for the parts that need no database, namely password
   hashing, session token handling, cookie parsing, input validation
   and the sync record validator.

   Run from the project root:  node tests/test_auth.mjs */
import assert from 'node:assert';
import * as A from '../api/_lib/auth.js';

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); console.log('PASS  ' + name); pass++; }
  catch (e) { console.log('FAIL  ' + name + '  [' + e.message + ']'); fail++; }
}

await t('hash then verify succeeds', async () => {
  const h = await A.hashPassword('correct horse battery');
  assert.strictEqual(await A.verifyPassword('correct horse battery', h), true);
});

await t('wrong password fails', async () => {
  const h = await A.hashPassword('correct horse battery');
  assert.strictEqual(await A.verifyPassword('correct horse batteryy', h), false);
});

await t('two hashes of the same password differ, so salting works', async () => {
  const a = await A.hashPassword('same');
  const b = await A.hashPassword('same');
  assert.notStrictEqual(a, b);
  assert.strictEqual(await A.verifyPassword('same', a), true);
  assert.strictEqual(await A.verifyPassword('same', b), true);
});

await t('hash string carries its own parameters', async () => {
  const h = await A.hashPassword('x');
  const parts = h.split('$');
  assert.strictEqual(parts.length, 6);
  assert.strictEqual(parts[0], 'scrypt');
  assert.ok(parseInt(parts[1], 10) >= 16384, 'cost too low');
});

await t('garbage in the hash column fails closed', async () => {
  for (const bad of ['', 'x', null, undefined, 'scrypt$1$2$3', '$$$$$',
                     'bcrypt$16384$8$1$aa$bb']) {
    assert.strictEqual(await A.verifyPassword('anything', bad), false, String(bad));
  }
});

await t('a tampered hash fails', async () => {
  const h = await A.hashPassword('secret');
  const parts = h.split('$');
  parts[5] = parts[5].replace(/^./, c => (c === 'a' ? 'b' : 'a'));
  assert.strictEqual(await A.verifyPassword('secret', parts.join('$')), false);
});

await t('session tokens are long and unique', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const tok = A.newSessionToken();
    assert.ok(tok.length >= 40, 'token too short');
    assert.ok(!seen.has(tok), 'duplicate token');
    seen.add(tok);
  }
});

await t('token hash is stable and not the token', () => {
  const tok = A.newSessionToken();
  assert.strictEqual(A.hashToken(tok), A.hashToken(tok));
  assert.notStrictEqual(A.hashToken(tok), tok);
  assert.strictEqual(A.hashToken(tok).length, 64);
});

await t('session cookie has the protective flags', () => {
  const c = A.sessionCookie('abc', 100);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=100']) {
    assert.ok(c.includes(flag), 'missing ' + flag);
  }
  assert.ok(A.clearedCookie().includes('Max-Age=0'));
});

await t('cookie parsing finds the right cookie', () => {
  const req = { headers: { cookie: 'a=1; lena_session=tok123; b=2' } };
  assert.strictEqual(A.readCookie(req, 'lena_session'), 'tok123');
  assert.strictEqual(A.readCookie(req, 'missing'), null);
  assert.strictEqual(A.readCookie({ headers: {} }, 'lena_session'), null);
  assert.strictEqual(A.readCookie({ headers: { cookie: 'xlena_session=no' } }, 'lena_session'), null);
});

await t('cookie reader is not fooled by a name that is a suffix', () => {
  const req = { headers: { cookie: 'evil_lena_session=bad; lena_session=good' } };
  assert.strictEqual(A.readCookie(req, 'lena_session'), 'good');
});

await t('email validation', () => {
  for (const good of ['a@b.my', 'ikhwan@iium.edu.my', ' IKHWAN@IIUM.EDU.MY ']) {
    assert.ok(A.validEmail(good), 'should accept ' + good);
  }
  for (const bad of ['', 'a@b', 'a@@b.my', 'a b@c.my', '@b.my', 'a@.my', 'a@b.m']) {
    assert.ok(!A.validEmail(bad), 'should reject ' + JSON.stringify(bad));
  }
  assert.strictEqual(A.normaliseEmail(' IKHWAN@IIUM.EDU.MY '), 'ikhwan@iium.edu.my');
});

await t('password rules (v39: 10 characters, common and leaked passwords refused)', async () => {
  process.env.LENA_HIBP = 'off';
  assert.strictEqual(await A.passwordProblem('short9char'.slice(0, 9)), 'pw_short');
  assert.strictEqual(await A.passwordProblem('password123'), 'pw_common');
  assert.strictEqual(await A.passwordProblem('PASSWORD123'), 'pw_common', 'common check is case insensitive');
  assert.strictEqual(await A.passwordProblem('a-reasonable-one'), null);
  assert.strictEqual(await A.passwordProblem('x'.repeat(201) + 'y'), 'pw_long');
});

// The sync module must load without a live database, since the pool
// is only created on the first query.
const sync = await import('../api/sync.js');

await t('sync module loads and exports a handler', () => {
  assert.strictEqual(typeof sync.default, 'function');
});

await t('sync accepts a well formed record', () => {
  assert.strictEqual(sync.badRecord({
    id: '6f1d2c4e-8a9b-5c3d-9e7f-1a2b3c4d5e6f', kind: 'mood',
    payload: { v: 3 }, updated_at: new Date().toISOString() }), null);
});

await t('sync rejects malformed records', () => {
  const ok = { id: '6f1d2c4e-8a9b-5c3d-9e7f-1a2b3c4d5e6f', kind: 'mood',
               payload: { v: 3 }, updated_at: new Date().toISOString() };
  assert.ok(sync.badRecord(null));
  assert.ok(sync.badRecord({ ...ok, id: 'not-a-uuid' }));
  assert.ok(sync.badRecord({ ...ok, kind: 'diary' }));
  assert.ok(sync.badRecord({ ...ok, payload: null }));
  assert.ok(sync.badRecord({ ...ok, updated_at: 'yesterday' }));
  assert.ok(sync.badRecord({ ...ok, updated_at: new Date(Date.now() + 3 * 864e5).toISOString() }));
  assert.ok(sync.badRecord({ ...ok, payload: { t: 'x'.repeat(70 * 1024) } }));
});

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) process.exit(1);
