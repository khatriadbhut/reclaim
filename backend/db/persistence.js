/**
 * Optional Postgres durability for panel state (sessions, profile, visit log).
 * Without DATABASE_URL, all functions no-op and the server uses in-memory maps only.
 */
import pg from "pg";

let pool = null;

export function isPersistenceEnabled() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

function getPool() {
  if (!isPersistenceEnabled()) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 10),
    });
  }
  return pool;
}

export async function initSchema() {
  const p = getPool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS reclaim_sync (
      user_id TEXT PRIMARY KEY,
      sessions JSONB NOT NULL DEFAULT '{}'::jsonb,
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      visit_log JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * @param {{ userSessions: Record<string, unknown>, userProfiles: Record<string, unknown>, userVisitLogs: Record<string, unknown> }} stores
 */
export async function loadIntoGlobals(stores) {
  const p = getPool();
  if (!p) return;
  await initSchema();
  const { rows } = await p.query(
    "SELECT user_id, sessions, profile, visit_log FROM reclaim_sync"
  );
  for (const row of rows) {
    const uid = row.user_id;
    if (row.sessions && typeof row.sessions === "object") {
      stores.userSessions[uid] = row.sessions;
    }
    if (row.profile && typeof row.profile === "object") {
      stores.userProfiles[uid] = row.profile;
    }
    if (Array.isArray(row.visit_log)) {
      stores.userVisitLogs[uid] = row.visit_log;
    }
  }
  console.log(`Postgres: loaded ${rows.length} user sync row(s)`);
}

export async function persistUser(userId, sessions, profile, visitLog) {
  const p = getPool();
  if (!p) return;
  await initSchema();
  await p.query(
    `INSERT INTO reclaim_sync (user_id, sessions, profile, visit_log, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       sessions = EXCLUDED.sessions,
       profile = EXCLUDED.profile,
       visit_log = EXCLUDED.visit_log,
       updated_at = NOW()`,
    [
      String(userId),
      JSON.stringify(sessions || {}),
      JSON.stringify(profile || {}),
      JSON.stringify(Array.isArray(visitLog) ? visitLog : []),
    ]
  );
}

export async function healthCheck() {
  const p = getPool();
  if (!p) return { enabled: false };
  try {
    await p.query("SELECT 1");
    return { enabled: true, ok: true };
  } catch (e) {
    return { enabled: true, ok: false, error: e?.message || String(e) };
  }
}
