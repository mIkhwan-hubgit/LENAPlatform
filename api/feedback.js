// POST /api/feedback
//
// Sends the feedback form from Profile & Settings to the LENA team's
// mailbox (FEEDBACK_TO, or GMAIL_USER when that is not set). Uses the same
// Gmail sender as the sign-in codes, so no new settings are needed.
//
// What is sent: the stars, the category, the message, the app language,
// whether the person was signed in, and a reply address only if they typed
// one. Nothing else from their account or entries.
//
// At most 5 messages an hour from one connection, so the form cannot be
// used to flood the team's inbox.
import { query, json, methodNotAllowed, readBody, currentUser, sameOrigin } from './_lib/db.js';
import { mailConfigured } from './_lib/mail.js';
import nodemailer from 'nodemailer';

const CATS = ['General', 'UI / Design', 'Features', 'Content', 'Bug Report', 'Suggestion'];
const MAX = 2000, PER_HOUR = 5;
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]{1,190}\.[a-z]{2,24}$/i;

let transport = null;
function getTransport() {
  if (globalThis.__lenaMailTransport) return globalThis.__lenaMailTransport;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: process.env.GMAIL_USER, pass: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '') },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000
    });
  }
  return transport;
}
function clientIp(req) {
  const h = req.headers || {};
  const ip = h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] ||
             (req.socket && req.socket.remoteAddress) || 'unknown';
  return String(ip).trim().slice(0, 64);
}
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOrigin(req)) return json(res, 403, { error: 'wrong_origin' });
  if (!mailConfigured()) return json(res, 503, { error: 'not_configured' });

  const b = await readBody(req);
  const text = clean(b.text, MAX + 1);
  if (!text) return json(res, 400, { error: 'empty' });
  if (text.length > MAX) return json(res, 400, { error: 'too_long' });
  const stars = Number.isInteger(b.stars) && b.stars >= 1 && b.stars <= 5 ? b.stars : null;
  const category = CATS.includes(b.category) ? b.category : 'General';
  const lang = b.lang === 'ms' ? 'ms' : 'en';
  const replyTo = clean(b.replyTo, 254);
  if (replyTo && !EMAIL_RE.test(replyTo)) return json(res, 400, { error: 'bad_email' });

  if (process.env.DATABASE_URL) {
    try {
      const r = await query(
        `INSERT INTO auth_throttle (key, hits, window_start) VALUES ($1, 1, now())
         ON CONFLICT (key) DO UPDATE SET
           hits = CASE WHEN auth_throttle.window_start < now() - interval '1 hour' THEN 1 ELSE auth_throttle.hits + 1 END,
           window_start = CASE WHEN auth_throttle.window_start < now() - interval '1 hour' THEN now() ELSE auth_throttle.window_start END
         RETURNING hits`, ['fb:' + clientIp(req)]);
      if (r.rows[0].hits > PER_HOUR) return json(res, 429, { error: 'too_many' });
    } catch (e) { /* a counter problem must not lose the message */ }
  }

  let signedIn = false;
  try { signedIn = !!(await currentUser(req)); } catch (e) {}

  const to = process.env.FEEDBACK_TO || process.env.GMAIL_USER || 'lena.platform.iium@gmail.com';
  const from = process.env.GMAIL_USER || 'lena.platform.iium@gmail.com';
  const starTxt = stars ? '★'.repeat(stars) + '☆'.repeat(5 - stars) + ' (' + stars + '/5)' : 'not given';
  const body = [
    'New feedback from the LENA app.', '',
    'Category:   ' + category,
    'Rating:     ' + starTxt,
    'Language:   ' + (lang === 'ms' ? 'Bahasa Melayu' : 'English'),
    'Signed in:  ' + (signedIn ? 'yes' : 'no (guest)'),
    'Reply to:   ' + (replyTo || 'no address given'),
    'Sent:       ' + new Date().toISOString(), '',
    '── Message ──', text, '',
    '--', 'Sent by the feedback form in Profile & Settings, lenaplatform.vercel.app'
  ].join('\n');
  try {
    await getTransport().sendMail({
      from: { name: 'LENA feedback', address: from }, to,
      subject: 'LENA feedback: ' + category + (stars ? ' · ' + stars + '/5' : ''),
      text: body, ...(replyTo ? { replyTo } : {})
    });
  } catch (e) {
    return json(res, 502, { error: 'send_failed' });
  }
  return json(res, 200, { ok: true });
}
