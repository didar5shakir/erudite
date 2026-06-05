// Analytics ingestion endpoint. Stage 6.3a — DEBUG SINK ONLY.
//
// Phase 6.3a: validates + whitelists the payload and logs it to the server console
// (visible in Vercel Function Logs). NO database write yet — Supabase is wired in a
// later phase by swapping the sink below; call sites and payload stay unchanged.
//
// Security/privacy: only the known events and whitelisted aggregated fields are kept;
// anything else (incl. any accidental PII) is dropped before logging.

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
  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (obj[key] !== undefined) safe[key] = obj[key];
  }
  if (typeof safe.timestamp !== 'string') safe.timestamp = new Date().toISOString();

  // ── SINK (Phase 6.3a): debug console only. No DB write. ──
  console.log('[analytics]', JSON.stringify(safe));

  return new Response(null, { status: 204 });
}
