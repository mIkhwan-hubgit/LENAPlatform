// POST /api/auth/logout
//
// Deletes the session row as well as clearing the cookie. Clearing the
// cookie alone would leave a token that still works if it had been
// captured, which is the whole reason sessions are rows here.
import { query, json, methodNotAllowed, sameOrigin } from '../_lib/db.js';
import * as A from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOrigin(req)) return json(res, 403, { error: 'wrong_origin' });

  const token = A.readCookie(req, A.COOKIE_NAME);
  if (token) {
    try {
      await query('DELETE FROM sessions WHERE token_hash = $1', [A.hashToken(token)]);
    } catch (e) {
      // Still clear the cookie. A failure to tidy the table must not
      // leave the person apparently signed in.
      console.error('logout cleanup failed', e);
    }
  }
  res.setHeader('Set-Cookie', A.clearedCookie());
  return json(res, 200, { ok: true });
}
