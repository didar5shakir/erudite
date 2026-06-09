// Analytics ingestion endpoint. Stage 6.3b — Supabase sink.
//
// Validates + whitelists the payload, then hands it to the server-only sink which
// inserts one row into Supabase (or falls back to console logging when Supabase env
// vars are absent). The service-role key lives only in server-sink.ts, never here and
// never in any client bundle. Call sites and payload are unchanged from 6.3a.
//
// Security/privacy: only the known events and whitelisted aggregated fields are kept;
// anything else (incl. any accidental PII / QIDs / names) is dropped before the sink.

import { recordAnalyticsEvent } from '@/lib/analytics/server-sink';

const KNOWN_EVENTS = new Set([
  'session_started',
  'reached_30',
  'result_100',
  'result_200',
  'result_300',
  'continue_clicked',
  'share_clicked',
  'restart_clicked',
]);

const ALLOWED_FIELDS = [
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
  'timestamp',
] as const;

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  if (!raw || typeof raw !== 'object') {
    return new Response(null, { status: 204 });
  }
  const obj = raw as Record<string, unknown>;

  // Silently drop anything that isn't one of our known low-frequency events.
  if (typeof obj.event !== 'string' || !KNOWN_EVENTS.has(obj.event)) {
    return new Response(null, { status: 204 });
  }

  // Whitelist only — strips any unexpected/PII fields a client might send.
  // NB: ip_country_code is intentionally NOT in ALLOWED_FIELDS, so any client-sent value
  // is stripped here and can never reach the DB.
  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (obj[key] !== undefined) safe[key] = obj[key];
  }
  if (typeof safe.timestamp !== 'string') safe.timestamp = new Date().toISOString();

  // Country code is SERVER-DERIVED only, from Vercel's geo header — never from the client.
  // Stored as a 2-letter ISO code (e.g. DE/KZ); raw IP is never read or stored. Missing or
  // malformed header → left unset → NULL. Set after whitelisting so it is authoritative.
  const cc = request.headers.get('x-vercel-ip-country');
  if (cc && /^[A-Z]{2}$/.test(cc)) safe.ip_country_code = cc;

  // ── SINK (6.3b): Supabase insert (server-only); console fallback if env missing. ──
  // Awaited so the serverless function does not terminate before the write completes.
  // recordAnalyticsEvent never throws, but guard anyway so the route always returns 204.
  try {
    await recordAnalyticsEvent(safe);
  } catch (err) {
    console.error('[analytics] sink error', err);
  }

  return new Response(null, { status: 204 });
}
