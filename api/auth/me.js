// /api/auth/me
//
// GET   who is signed in. The client calls this on boot to decide
//       whether to show the app or the sign-in screen. It answers 200
//       with a user, or 200 with null, rather than 401, because "nobody
//       is signed in" is a normal state here and not an error.
// PATCH (v42) change your own account, signed in only:
//         { displayName }   the name LENA calls you, kept on the account
//                           so it follows you to every device
//         { password }      add a password to an account made with
//                           Google, so email + password works too. Only
//                           when it has none: changing an existing one
//                           goes through "Forgot password?", which
//                           checks the inbox.
// One file for both, because Vercel's free plan allows 12 server
// functions and LENA has 9.
import { json, methodNotAllowed, currentUser, publicUser, query, readBody, sameOrigin } from '../_lib/db.js';
import * as A from '../_lib/auth.js';

async function patch(req, res) {
  if (!sameOrigin(req)) return json(res, 403, { error: 'wrong_origin' });
  const u = await currentUser(req);
  if (!u) return json(res, 401, { error: 'signed_out' });
  const b = await readBody(req);
  if (b.displayName !== undefined) {
    const name = String(b.displayName || '').trim().slice(0, 80);
    if (!name) return json(res, 400, { error: 'name_empty' });
    await query('UPDATE users SET display_name = $2 WHERE id = $1', [u.id, name]);
    u.display_name = name;
  }
  if (b.password !== undefined) {
    if (u.has_password) return json(res, 409, { error: 'has_password' });
    const problem = await A.passwordProblem(b.password, u.email);
    if (problem) return json(res, 400, { error: problem });
    // only if still none, so two tabs cannot race each other
    const up = await query('UPDATE users SET pw_hash = $2 WHERE id = $1 AND pw_hash IS NULL RETURNING id',
      [u.id, await A.hashPassword(String(b.password))]);
    if (!up.rows.length) return json(res, 409, { error: 'has_password' });
    u.has_password = true;
  }
  return json(res, 200, { user: publicUser(u) });
}

export default async function handler(req, res) {
  if (req.method === 'PATCH') {
    try { return await patch(req, res); }
    catch (e) { console.error('me patch failed', e); return json(res, 500, { error: 'server_error' }); }
  }
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET', 'PATCH']);
  try {
    const u = await currentUser(req);
    if (!u) return json(res, 200, { user: null });
    return json(res, 200, { user: publicUser(u) });
  } catch (e) {
    console.error('me failed', e);
    // If the database is unreachable the app should fall back to
    // working offline rather than locking the person out.
    return json(res, 200, { user: null, degraded: true });
  }
}
