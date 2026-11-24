// POST /api/auth/google  { credential }
//
// "Continue with Google". The page hands over the ID token Google gave
// it; this checks it (see _lib/google.js), finds or makes the LENA
// account for that Google account, and starts a session.
//
// Accounts are matched on Google's permanent account number (sub), not
// on the email, because a person can change the email on their Google
// account. The email is only used once, to join an existing LENA
// account with the same address the first time someone uses Google.
//
// Joining is careful. Email sign-up on LENA does not check that people
// own the address they type, so an account with this email could have
// been made by someone else. Google has checked the address, so the
// Google user is the real owner: on joining, any password on the old
// account is removed and its other sessions are ended, so whoever made
// it can no longer get in.
import { query, json, methodNotAllowed, readBody, publicUser, startSession, sameOrigin } from '../_lib/db.js';
import { normaliseEmail } from '../_lib/auth.js';
import { verifyGoogleIdToken, GoogleTokenError } from '../_lib/google.js';

const FIELDS = 'id, email, display_name, picture, google_sub';

async function findOrCreate(g) {
  const email = normaliseEmail(g.email);
  // 1. Seen this Google account before.
  let r = await query(`SELECT ${FIELDS} FROM users WHERE google_sub = $1`, [g.sub]);
  if (r.rows.length) {
    const u = r.rows[0];
    const up = await query(
      `UPDATE users SET picture = $2, display_name = COALESCE(display_name, $3), last_login_at = now()
        WHERE id = $1 RETURNING ${FIELDS}`, [u.id, g.picture, g.name]);
    return up.rows[0];
  }
  // 2. An account with the same address, made before Google was used.
  r = await query(`SELECT ${FIELDS} FROM users WHERE email_norm = $1`, [email]);
  if (r.rows.length) {
    const u = r.rows[0];
    if (u.google_sub) {
      // Already joined to a different Google account. Do not take it over.
      const e = new Error('email_in_use'); e.code = 'email_in_use'; throw e;
    }
    await query('DELETE FROM sessions WHERE user_id = $1', [u.id]);
    const up = await query(
      `UPDATE users SET google_sub = $2, picture = $3, pw_hash = NULL, display_name = COALESCE(display_name, $4),
              failed_logins = 0, locked_until = NULL, last_login_at = now()
        WHERE id = $1 RETURNING ${FIELDS}`, [u.id, g.sub, g.picture, g.name]);
    return up.rows[0];
  }
  // 3. Someone new.
  try {
    const ins = await query(
      `INSERT INTO users (email, email_norm, pw_hash, display_name, google_sub, picture, last_login_at)
       VALUES ($1, $2, NULL, $3, $4, $5, now()) RETURNING ${FIELDS}`,
      [g.email, email, g.name, g.sub, g.picture]);
    return ins.rows[0];
  } catch (e) {
    // Two taps at once: the other request made the account first.
    if (e && e.code === '23505') {
      const again = await query(`SELECT ${FIELDS} FROM users WHERE google_sub = $1`, [g.sub]);
      if (again.rows.length) return again.rows[0];
    }
    throw e;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOrigin(req)) return json(res, 403, { error: 'wrong_origin' });
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  if (!clientId) return json(res, 503, { error: 'not_configured', message: 'Google sign-in is not set up yet.' });

  const body = await readBody(req);
  let g;
  try {
    g = await verifyGoogleIdToken(body.credential, { clientId });
  } catch (e) {
    if (e instanceof GoogleTokenError) {
      const status = e.code === 'keys_unavailable' ? 503 : 401;
      return json(res, status, { error: e.code, message: e.message });
    }
    console.error('google verify failed', e);
    return json(res, 500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
  }

  try {
    const row = await findOrCreate(g);
    await startSession(req, res, row.id);
    return json(res, 200, { user: publicUser({ ...row, google: true }) });
  } catch (e) {
    if (e && e.code === 'email_in_use') {
      return json(res, 409, { error: 'email_in_use',
        message: 'That email is already joined to a different Google account on LENA.' });
    }
    console.error('google sign-in failed', e);
    return json(res, 500, { error: 'server_error', message: 'Something went wrong signing you in. Please try again.' });
  }
}
