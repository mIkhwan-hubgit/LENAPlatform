// GET /api/auth/me
//
// The client calls this on boot to decide whether to show the app or
// the sign-in screen. It answers 200 with a user, or 200 with null,
// rather than 401, because "nobody is signed in" is a normal state
// here and not an error worth logging.
import { json, methodNotAllowed, currentUser, publicUser } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
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
