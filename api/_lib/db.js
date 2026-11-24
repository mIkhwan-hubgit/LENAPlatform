// ════════════════════════════════════════════════════════════════════
// Database access and the pieces every endpoint needs.
//
// Uses node-postgres against Neon's POOLED connection string. On a
// serverless platform each invocation is its own short-lived process,
// so a direct connection string would open a new Postgres backend per
// request and exhaust the server's connection slots under any load.
// The pooled endpoint exists for exactly this shape of traffic.
//
// DATABASE_URL is read from the environment and never appears in this
// repository. Set it in the Vercel project settings.
// ════════════════════════════════════════════════════════════════════
// pg is published as CommonJS, so it is imported whole and Pool taken
// from it. A named import of Pool fails under Node's ESM loader.
import pg from 'pg';
import { hashToken, readCookie, COOKIE_NAME, newSessionToken, sessionCookie, SESSION_DAYS } from './auth.js';
const { Pool } = pg;

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    const url = process.env.DATABASE_URL;
    pool = new Pool({
      connectionString: url,
      // Neon needs TLS. A database on this same machine (the tests) does not.
      ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : { rejectUnauthorized: true },
      max: 1,                       // one per invocation, the pooler does the rest
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000 // Neon wakes a suspended compute in about a second
    });
  }
  return pool;
}

async function query(text, params) {
  const res = await getPool().query(text, params);
  return res;
}

// ── request helpers ─────────────────────────────────────────────────

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // These responses are per-user and must never be cached by a CDN.
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body));
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return json(res, 405, { error: 'method_not_allowed' });
}

// Vercel parses JSON bodies for us, but a hand-rolled request or a
// different runtime may not, so fall back to reading the stream.
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) { req.destroy(); resolve({}); }  // 1 MB cap
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

// ── session ─────────────────────────────────────────────────────────

/* Returns { id, email, display_name } or null.
   Expired sessions are deleted as they are encountered, which keeps
   the table tidy without needing a scheduler. */
async function currentUser(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  const th = hashToken(token);
  const r = await query(
    `SELECT u.id, u.email, u.display_name, u.picture, u.google_sub,
            u.pw_hash IS NOT NULL AS has_password, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1`, [th]);
  if (!r.rows.length) return null;
  const row = r.rows[0];
  if (new Date(row.expires_at) < new Date()) {
    await query('DELETE FROM sessions WHERE token_hash = $1', [th]);
    return null;
  }
  return { id: row.id, email: row.email, display_name: row.display_name, picture: row.picture,
           google: !!row.google_sub, has_password: row.has_password };
}

/* What the page is told about the signed-in person. */
function publicUser(u) {
  return { id: u.id, email: u.email, displayName: u.display_name || null,
           picture: u.picture || null, provider: u.google ? 'google' : 'email' };
}

/* A new session row and its cookie. The cookie holds a random token;
   the table holds only its hash. */
async function startSession(req, res, userId) {
  const token = newSessionToken();
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent)
     VALUES ($1, $2, now() + ($3 || ' seconds')::interval, $4)`,
    [hashToken(token), userId, String(maxAge),
     String((req.headers && req.headers['user-agent']) || '').slice(0, 200)]);
  res.setHeader('Set-Cookie', sessionCookie(token, maxAge));
}

/* Requests that change something must come from LENA's own pages.
   Browsers always send Origin on these requests, so a form or script on
   another site trying to sign someone in or delete their account is
   turned away here. The SameSite cookie already blocks most of this;
   this is the second lock. */
function sameOrigin(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return true;   // not a browser cross-site request
  const host = String((req.headers['x-forwarded-host'] || req.headers.host || '')).split(',')[0].trim();
  try { return new URL(origin).host === host; } catch (e) { return false; }
}

async function requireUser(req, res) {
  const u = await currentUser(req);
  if (!u) { json(res, 401, { error: 'not_signed_in' }); return null; }
  return u;
}

export {
  query, json, methodNotAllowed, readBody, currentUser, requireUser,
  publicUser, startSession, sameOrigin
};
