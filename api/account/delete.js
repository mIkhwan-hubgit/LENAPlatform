// POST /api/account/delete  { password?, confirm: "DELETE" }
//
// Erases the account and everything attached to it. This is not a
// nice-to-have. Storing identifiable mental health records creates an
// obligation to let the person take them back, and a deletion route
// that a user can actually reach is the minimum form of that.
//
// The password is required again because this is irreversible and a
// cookie alone is a weaker proof than a password on a shared laptop.
// An account that only signs in with Google has no password; for those
// the typed confirmation in the app is what is asked for.
// The records go through the users cascade, so nothing is left behind.
import { query, json, methodNotAllowed, readBody, requireUser, sameOrigin } from '../_lib/db.js';
import * as A from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOrigin(req)) return json(res, 403, { error: 'wrong_origin' });

  const user = await requireUser(req, res);
  if (!user) return;

  const body = await readBody(req);
  if (String(body.confirm || '') !== 'DELETE') {
    return json(res, 400, { error: 'not_confirmed',
      message: 'Type DELETE to confirm.' });
  }

  try {
    const r = await query('SELECT pw_hash FROM users WHERE id = $1', [user.id]);
    if (!r.rows.length) return json(res, 404, { error: 'not_found' });

    const hasPw = !!r.rows[0].pw_hash;
    const good = !hasPw || await A.verifyPassword(String(body.password || ''), r.rows[0].pw_hash);
    if (!good) {
      return json(res, 401, { error: 'bad_password',
        message: 'That password is not right.' });
    }

    // sessions, records and chat_usage all cascade from users.
    await query('DELETE FROM users WHERE id = $1', [user.id]);

    res.setHeader('Set-Cookie', A.clearedCookie());
    return json(res, 200, { ok: true, deleted: true });
  } catch (e) {
    console.error('account delete failed', e);
    return json(res, 500, { error: 'server_error',
      message: 'Something went wrong. Your account has not been deleted.' });
  }
}
