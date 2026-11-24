// ════════════════════════════════════════════════════════════════════
// GET  /api/sync?since=<ISO timestamp>   pull everything changed since
// PUT  /api/sync   { records: [...] }    push local changes
//
// The merge rule is last write wins, compared on updated_at. This is
// deliberately the simplest rule that is still correct for this data.
// A conflict here means the same person edited the same record on two
// devices while one was offline, which is rare, and the loss is one
// edit rather than a record. Anything cleverer, such as per-field
// merging or a CRDT, is a large amount of machinery for a case that
// barely arises in single-user journalling and mood data.
//
// Record ids are generated on the client. That is what lets somebody
// who used LENA without an account upload what they already have on
// their first sign-in, with no renumbering and no collisions.
//
// A record is never hard deleted by sync, because a second device
// cannot tell the difference between "this was deleted" and "I have
// not seen this yet". Deletion sets a flag and keeps the row.
// ════════════════════════════════════════════════════════════════════
import { query, json, methodNotAllowed, readBody, requireUser, sameOrigin } from './_lib/db.js';

const KINDS = ['mood', 'sleep', 'screening', 'journal', 'safety_plan', 'prefs'];
const MAX_RECORDS_PER_PUSH = 500;
const MAX_PAYLOAD_BYTES    = 64 * 1024;   // one journal entry, generously
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function badRecord(r) {
  if (!r || typeof r !== 'object') return 'not an object';
  if (!UUID_RE.test(String(r.id || ''))) return 'id must be a uuid';
  if (KINDS.indexOf(r.kind) === -1) return 'unknown kind';
  if (r.payload === undefined || r.payload === null) return 'missing payload';
  const t = Date.parse(r.updated_at);
  if (!isFinite(t)) return 'updated_at is not a date';
  // A clock far in the future would win every future merge, so clamp.
  if (t > Date.now() + 24 * 60 * 60 * 1000) return 'updated_at is in the future';
  let size;
  try { size = Buffer.byteLength(JSON.stringify(r.payload)); }
  catch (e) { return 'payload is not serialisable'; }
  if (size > MAX_PAYLOAD_BYTES) return 'payload too large';
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return methodNotAllowed(res, ['GET', 'PUT']);
  }

  if (req.method === 'PUT' && !sameOrigin(req)) return json(res, 403, { error: 'wrong_origin' });
  const user = await requireUser(req, res);
  if (!user) return;

  try {
    // ── pull ────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const sinceRaw = (req.query && req.query.since) || '';
      const sinceMs = Date.parse(sinceRaw);
      const since = isFinite(sinceMs) ? new Date(sinceMs) : new Date(0);

      const r = await query(
        `SELECT id, kind, payload, updated_at, deleted
           FROM records
          WHERE user_id = $1 AND updated_at > $2
          ORDER BY updated_at ASC
          LIMIT 5000`, [user.id, since.toISOString()]);

      return json(res, 200, {
        now: new Date().toISOString(),
        records: r.rows.map(row => ({
          id: row.id, kind: row.kind, payload: row.payload,
          updated_at: new Date(row.updated_at).toISOString(),
          deleted: row.deleted
        }))
      });
    }

    // ── push ────────────────────────────────────────────────────────
    const body = await readBody(req);
    const records = Array.isArray(body.records) ? body.records : null;
    if (!records) {
      return json(res, 400, { error: 'bad_request', message: 'records must be an array' });
    }
    if (records.length > MAX_RECORDS_PER_PUSH) {
      return json(res, 413, { error: 'too_many',
        message: 'Send at most ' + MAX_RECORDS_PER_PUSH + ' records per request.' });
    }

    const rejected = [];
    const accepted = [];
    for (let i = 0; i < records.length; i++) {
      const why = badRecord(records[i]);
      if (why) rejected.push({ index: i, id: records[i] && records[i].id, why });
      else accepted.push(records[i]);
    }

    let applied = 0;
    for (const rec of accepted) {
      // The WHERE on the DO UPDATE is what makes this last write wins.
      // An older copy arriving late from a device that was offline is
      // stored only if nothing newer is already there.
      const out = await query(
        `INSERT INTO records (id, user_id, kind, payload, updated_at, deleted)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         ON CONFLICT (user_id, id) DO UPDATE
            SET payload    = EXCLUDED.payload,
                kind       = EXCLUDED.kind,
                updated_at = EXCLUDED.updated_at,
                deleted    = EXCLUDED.deleted
          WHERE EXCLUDED.updated_at > records.updated_at
         RETURNING id`,
        [rec.id, user.id, rec.kind, JSON.stringify(rec.payload),
         new Date(rec.updated_at).toISOString(), !!rec.deleted]);
      if (out.rowCount) applied++;
    }

    return json(res, 200, {
      now: new Date().toISOString(),
      received: records.length,
      applied,                       // lower than received when the server already had newer
      rejected
    });
  } catch (e) {
    console.error('sync failed', e);
    return json(res, 500, { error: 'server_error',
      message: 'Sync did not complete. Your data is still saved on this device.' });
  }
}
