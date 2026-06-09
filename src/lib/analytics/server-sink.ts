// Server-only analytics sink. Stage 6.3b.
//
// Inserts one row per low-frequency checkpoint event into the Supabase
// `analytics_events` table via the PostgREST endpoint (no @supabase/supabase-js
// dependency). The service-role key is read ONLY here and never leaves the server.
//
// `import 'server-only'` makes the build fail if this module is ever imported into a
// client component — a hard guard that the service-role key can never reach the browser.
import 'server-only';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANALYTICS_DEBUG = process.env.ANALYTICS_DEBUG === '1';

const TABLE = 'analytics_events';

// Columns persisted to the DB. `created_at` is set by the table default (server time
// is authoritative); the client-sent `timestamp` is intentionally NOT stored.
const DB_COLUMNS = [
  'event',
  'anonymous_id',
  'session_id',
  'locale',
  'region',
  'total_answers',
  'know_count',
  'heard_count',
  'dont_know_count',
  'estimate',
  'range_low',
  'range_high',
  'level',
  'top_zones',
  'ip_country_code',   // server-derived (route) from x-vercel-ip-country; never client-sent
] as const;

// `safe` is the already-whitelisted payload from the route. Inserts a single row;
// never throws — analytics must never break the request (route always returns 204).
export async function recordAnalyticsEvent(safe: Record<string, unknown>): Promise<void> {
  // Build the row from known DB columns only (drops client `timestamp` and anything else).
  const row: Record<string, unknown> = {};
  for (const col of DB_COLUMNS) {
    if (safe[col] !== undefined) row[col] = safe[col];
  }

  // No Supabase configured → fall back to console sink (matches Stage 6.3a behaviour).
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[analytics] Supabase env missing — console fallback');
    console.log('[analytics]', JSON.stringify(safe));
    return;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn(`[analytics] Supabase insert failed: ${res.status} ${detail}`.trim());
      return;
    }

    if (ANALYTICS_DEBUG) console.log('[analytics] inserted', JSON.stringify(row));
  } catch (err) {
    // Network/runtime error — log server-side, swallow so UX is unaffected.
    console.error('[analytics] Supabase insert error', err);
  }
}
