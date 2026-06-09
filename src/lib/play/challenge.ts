// Lightweight "compare with a friend" challenge. Stage 6.10.
//
// A friendly, deck-INDEPENDENT comparison: the inviter's result summary is encoded into
// the share URL (?c=base64url(json)); the friend takes their own normal adaptive test and
// sees a side-by-side of estimates/levels/zones. NOT the same 100-card deck, NOT a verified
// battle. No backend, no auth, no QIDs, no per-card data. The payload is non-PII (estimate,
// level, counts, range, top theme tags, region, locale). Decoding always fails SAFE → null.

import type { LevelLabel } from './result-estimate';

export interface InviterSummary {
  estimate:  number;
  level:     LevelLabel;
  answered:  number;
  know:      number;
  heard:     number;
  dontKnow:  number;
  rangeLow:  number;
  rangeHigh: number;
  zones:     string[];   // axis:tag theme tags, max 4 — no names/QIDs
  region:    string;
  locale:    string;
}

const LEVELS: readonly LevelLabel[] = ['beginner', 'casual', 'good', 'strong', 'erudite', 'master'];
const MAX_RAW = 800;        // reject absurdly long params
const MAX_ZONES = 4;
const MAX_ZONE_LEN = 48;

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function b64urlEncode(s: string): string {
  // payload is ASCII (numbers, level enum, axis:tag latin tags, region/locale) → btoa is safe
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
}

// Compact wire shape (short keys keep the URL small).
export function encodeChallenge(s: InviterSummary): string {
  const wire = {
    v:  1,
    e:  clampInt(s.estimate, 0, 30000),
    l:  s.level,
    n:  clampInt(s.answered, 0, 1_000_000),
    k:  clampInt(s.know, 0, 1_000_000),
    h:  clampInt(s.heard, 0, 1_000_000),
    d:  clampInt(s.dontKnow, 0, 1_000_000),
    rl: clampInt(s.rangeLow, 0, 30000),
    rh: clampInt(s.rangeHigh, 0, 30000),
    z:  (s.zones ?? []).slice(0, MAX_ZONES),
    rg: s.region,
    lo: s.locale,
  };
  return b64urlEncode(JSON.stringify(wire));
}

// Always fails safe: any malformed / oversized / tampered input → null (caller shows the
// normal result with no comparison). Never throws.
export function decodeChallenge(raw: string | string[] | undefined | null): InviterSummary | null {
  const c = Array.isArray(raw) ? raw[0] : raw;
  if (!c || typeof c !== 'string' || c.length > MAX_RAW) return null;

  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(b64urlDecode(c)) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  if (obj.v !== 1) return null;
  if (typeof obj.l !== 'string' || !LEVELS.includes(obj.l as LevelLabel)) return null;

  const zones = Array.isArray(obj.z)
    ? obj.z.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= MAX_ZONE_LEN).slice(0, MAX_ZONES)
    : [];
  const locale = (obj.lo === 'en' || obj.lo === 'ru' || obj.lo === 'kk') ? obj.lo : 'en';
  const region = typeof obj.rg === 'string' && obj.rg.length <= 32 ? obj.rg : 'global';

  return {
    estimate:  clampInt(obj.e, 0, 30000),
    level:     obj.l as LevelLabel,
    answered:  clampInt(obj.n, 0, 1_000_000),
    know:      clampInt(obj.k, 0, 1_000_000),
    heard:     clampInt(obj.h, 0, 1_000_000),
    dontKnow:  clampInt(obj.d, 0, 1_000_000),
    rangeLow:  clampInt(obj.rl, 0, 30000),
    rangeHigh: clampInt(obj.rh, 0, 30000),
    zones,
    region,
    locale,
  };
}
