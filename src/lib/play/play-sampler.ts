import type { Person, PlayPools } from './types';
import { SENSITIVE_OCCUPATIONS } from './localized-labels';
import { getCardFitScore } from './adaptive-profile';
import type { AdaptiveProfile } from './adaptive-profile';

export const SESSION_CARD_COUNT = 100;
export const CALIB_SIZE         = 30;
export const ADAPTIVE_TAIL_SIZE      = 70;
export const ADAPTIVE_DOMAIN_MAX     = 30;
export const ADAPTIVE_SUBDOMAIN_MAX  = 20;
export const ADAPTIVE_COUNTRY_MAX    = 20;
export const ADAPTIVE_SOFT_MAX       = 2;
export const TOP_K                   = 200;
export const EXPLORATION_RATIO_EARLY = 0.20;
export const EXPLORATION_RATIO_LATE  = 0.10;

// kz_ca_top lives in JSON but not in shared types.ts
export interface PlayPoolsExtended extends PlayPools {
  kz_ca_top?: Person[];
}

export interface SessionCounts {
  softSensitiveCount: number;
  domainCount:        Record<string, number>;
  subdomainCount:     Record<string, number>;
  countryCount:       Record<string, number>;
}

// ── Fisher-Yates shuffle ──────────────────────────────────────────────────────

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Sample without replacement ────────────────────────────────────────────────

export function sampleUnique<T extends { wikidata_id: string }>(
  items: T[],
  count: number,
  usedIds: Set<string>,
): T[] {
  const candidates = items.filter((p) => !usedIds.has(p.wikidata_id));
  const shuffled = shuffle(candidates);
  const picked = shuffled.slice(0, count);
  picked.forEach((p) => usedIds.add(p.wikidata_id));
  return picked;
}

// ── Bucket configs ────────────────────────────────────────────────────────────

interface Bucket { min: number; max: number; need: number; }

// Remaining 70 after calibration block (default: 56+6+5+3=70)
const TOP_BUCKETS_70: Bucket[] = [
  { min: 1,    max: 100,  need: 14 },
  { min: 101,  max: 500,  need: 14 },
  { min: 501,  max: 1500, need: 14 },
  { min: 1501, max: 5000, need: 14 },
];

// Remaining 70 after calibration block (kz: 32+12+24+2=70)
const KZ_BUCKETS_70: Bucket[] = [
  { min: 1,    max: 100,  need: 8 },
  { min: 101,  max: 500,  need: 8 },
  { min: 501,  max: 1500, need: 8 },
  { min: 1501, max: 5000, need: 8 },
];

// kz_ca slot for remaining 70; calibration takes ~6 from the 26-entry pool,
// so remaining targets 24 (20 real kz_ca + 4 fallback from kz_quota)
const KZ_CA_REMAINING = 24;

// ── Calibration block constants ───────────────────────────────────────────────

const CALIB_EASY          = 10;
const CALIB_MEDIUM        = 12;
const CALIB_HARD          = 8;
const CALIB_DOMAIN_MAX    = 5;
const CALIB_SUBDOMAIN_MAX = 3;
const CALIB_ERA_MAX       = 8;
const CALIB_REGION_MAX    = 8;  // default mode only
const CALIB_KZ_CA_TARGET  = 6;  // seed count for kz calibration phase
const CALIB_KZ_CA_MAX     = 8;  // hard cap for kz_ca in calibration block

// ── Sensitive filter ──────────────────────────────────────────────────────────

function isSensitivePerson(person: Person): boolean {
  return SENSITIVE_OCCUPATIONS.has(person.occupation ?? '');
}

// ── Calibration block ─────────────────────────────────────────────────────────

interface CalibRelaxLog {
  mode: 'global' | 'kz';
  relaxedEra: number;
  relaxedSub: number;
  relaxedDomain: number;
  relaxedDifficulty: number;
}

export let lastCalibRelaxLog: CalibRelaxLog | null = null;

function createCalibrationBlock(
  safe: PlayPoolsExtended,
  kzCaIds: Set<string>,
  region: 'kz' | 'global',
  usedIds: Set<string>,
): Person[] {
  // Candidate pool: deduped by QID, no hard- or soft-sensitive, never relaxed
  const seenQids = new Set<string>();
  const poolOrder: Person[][] = region === 'kz'
    ? [safe.kz_ca_top ?? [], safe.top_30000, safe.ru_quota, safe.kz_quota, safe.hpi_quota]
    : [safe.top_30000, safe.ru_quota, safe.kz_quota, safe.hpi_quota];

  const allCandidates: Person[] = [];
  for (const src of poolOrder) {
    for (const p of src) {
      if (
        !seenQids.has(p.wikidata_id) &&
        !usedIds.has(p.wikidata_id) &&
        p.content_sensitivity === 'normal'
      ) {
        seenQids.add(p.wikidata_id);
        allCandidates.push(p);
      }
    }
  }

  const shuffled = shuffle(allCandidates);

  const domainCount:      Record<string, number> = {};
  const subdomainCount:   Record<string, number> = {};
  const eraCount:         Record<string, number> = {};
  const macroRegionCount: Record<string, number> = {};
  const diffCount:        Record<string, number> = { easy: 0, medium: 0, hard: 0, unknown: 0 };
  let kzCaCount = 0;

  const block: Person[] = [];
  const blockIds = new Set<string>();

  interface RelaxFlags {
    relaxEra?:    boolean;
    relaxSub?:    boolean;
    relaxDomain?: boolean;
    relaxRegion?: boolean;
  }

  function isConstrained(p: Person, flags: RelaxFlags = {}): boolean {
    if (blockIds.has(p.wikidata_id)) return true;
    const d   = p.domain       || 'unknown';
    const sub = p.subdomain;
    const era = p.era_bucket   || 'unknown';
    const reg = p.macro_region || 'unknown';
    if (!flags.relaxDomain && (domainCount[d] ?? 0) >= CALIB_DOMAIN_MAX) return true;
    if (!flags.relaxSub    && sub && (subdomainCount[sub] ?? 0) >= CALIB_SUBDOMAIN_MAX) return true;
    if (!flags.relaxEra    && (eraCount[era] ?? 0) >= CALIB_ERA_MAX) return true;
    if (!flags.relaxRegion && region === 'global' &&
        (macroRegionCount[reg] ?? 0) >= CALIB_REGION_MAX) return true;
    if (kzCaIds.has(p.wikidata_id) && kzCaCount >= CALIB_KZ_CA_MAX) return true;
    return false;
  }

  function addCard(p: Person): void {
    block.push(p);
    blockIds.add(p.wikidata_id);
    usedIds.add(p.wikidata_id);
    const d   = p.domain       || 'unknown';
    const sub = p.subdomain;
    const era = p.era_bucket   || 'unknown';
    const reg = p.macro_region || 'unknown';
    domainCount[d]          = (domainCount[d]          ?? 0) + 1;
    eraCount[era]           = (eraCount[era]            ?? 0) + 1;
    macroRegionCount[reg]   = (macroRegionCount[reg]    ?? 0) + 1;
    if (sub) subdomainCount[sub] = (subdomainCount[sub] ?? 0) + 1;
    diffCount[p.difficulty_bucket ?? 'unknown'] =
      (diffCount[p.difficulty_bucket ?? 'unknown'] ?? 0) + 1;
    if (kzCaIds.has(p.wikidata_id)) kzCaCount++;
  }

  const relaxLog: CalibRelaxLog = { mode: region, relaxedEra: 0, relaxedSub: 0, relaxedDomain: 0, relaxedDifficulty: 0 };

  function fillRelaxed(flags: RelaxFlags, logKey: keyof Omit<CalibRelaxLog, 'mode'>): void {
    if (block.length >= CALIB_SIZE) return;
    const before = block.length;
    for (const p of shuffled) {
      if (block.length >= CALIB_SIZE) break;
      if (!isConstrained(p, flags)) addCard(p);
    }
    relaxLog[logKey] += block.length - before;
  }

  // Phase 1 (kz only): seed with CALIB_KZ_CA_TARGET kz_ca cards
  if (region === 'kz') {
    for (const p of shuffled) {
      if (kzCaCount >= CALIB_KZ_CA_TARGET) break;
      if (kzCaIds.has(p.wikidata_id) && !isConstrained(p)) addCard(p);
    }
  }

  // Phase 2: fill difficulty targets; prefer non-unknown era
  const diffTargets: Array<[string, number]> = [
    ['easy',   CALIB_EASY],
    ['medium', CALIB_MEDIUM],
    ['hard',   CALIB_HARD],
  ];
  for (const [diff, target] of diffTargets) {
    for (const p of shuffled) {
      if ((diffCount[diff] ?? 0) >= target) break;
      if (p.difficulty_bucket === diff &&
          (p.era_bucket ?? 'unknown') !== 'unknown' &&
          !isConstrained(p)) addCard(p);
    }
    for (const p of shuffled) {
      if ((diffCount[diff] ?? 0) >= target) break;
      if (p.difficulty_bucket === diff && !isConstrained(p)) addCard(p);
    }
  }

  // Phase 3: fill remaining (all constraints)
  for (const p of shuffled) {
    if (block.length >= CALIB_SIZE) break;
    if (!isConstrained(p)) addCard(p);
  }

  // Relaxation phases (order: era → subdomain → domain → last resort)
  // Content sensitivity is NEVER relaxed.
  fillRelaxed({ relaxEra: true },                              'relaxedEra');
  fillRelaxed({ relaxEra: true, relaxSub: true },             'relaxedSub');
  fillRelaxed({ relaxEra: true, relaxSub: true, relaxDomain: true }, 'relaxedDomain');

  // Last resort: only blockIds guard remains (soft-sensitive still excluded by candidate pool)
  if (block.length < CALIB_SIZE) {
    const before = block.length;
    for (const p of shuffled) {
      if (block.length >= CALIB_SIZE) break;
      if (!blockIds.has(p.wikidata_id)) addCard(p);
    }
    relaxLog.relaxedDifficulty += block.length - before;
  }

  lastCalibRelaxLog = relaxLog;
  return shuffle(block);
}

// ── Main function ─────────────────────────────────────────────────────────────

export function createMixedSessionDeck(pools: PlayPoolsExtended, region?: 'kz'): Person[] {
  const safe: PlayPoolsExtended = {
    top_30000: pools.top_30000.filter(p => !isSensitivePerson(p)),
    ru_quota:  pools.ru_quota.filter(p  => !isSensitivePerson(p)),
    kz_quota:  pools.kz_quota.filter(p  => !isSensitivePerson(p)),
    hpi_quota: pools.hpi_quota.filter(p => !isSensitivePerson(p)),
    kz_ca_top: pools.kz_ca_top?.filter(p => !isSensitivePerson(p)),
  };

  const kzCaIds = new Set((safe.kz_ca_top ?? []).map(p => p.wikidata_id));
  const usedIds = new Set<string>();

  // Cards 1–30: balanced calibration block
  const calib = createCalibrationBlock(safe, kzCaIds, region ?? 'global', usedIds);

  // Cards 31–100: pool-based fill (usedIds already has calib QIDs)
  const remaining: Person[] = [];

  function pick(pool: Person[], n: number): void {
    let picked = sampleUnique(pool, n, usedIds);
    if (picked.length < n) {
      picked = [...picked, ...sampleUnique(safe.top_30000, n - picked.length, usedIds)];
    }
    remaining.push(...picked);
  }

  function pickBuckets(buckets: Bucket[]): void {
    for (const b of buckets) {
      const pool = safe.top_30000.filter(
        p => p.global_rank >= b.min && p.global_rank <= b.max,
      );
      pick(pool, b.need);
    }
  }

  if (region === 'kz') {
    pickBuckets(KZ_BUCKETS_70);        // 32 from top_30000
    pick(safe.ru_quota, 12);           // 12 ru_quota
    // kz_ca_top slot (target 24): takes remaining unique kz_ca, fills from kz_quota then top_30000
    {
      const kzPool = safe.kz_ca_top ?? [];
      let slot = sampleUnique(kzPool, KZ_CA_REMAINING, usedIds);
      if (slot.length < KZ_CA_REMAINING) {
        slot = [...slot, ...sampleUnique(safe.kz_quota, KZ_CA_REMAINING - slot.length, usedIds)];
      }
      if (slot.length < KZ_CA_REMAINING) {
        slot = [...slot, ...sampleUnique(safe.top_30000, KZ_CA_REMAINING - slot.length, usedIds)];
      }
      remaining.push(...slot);
    }
    pick(safe.hpi_quota, 2);           // 2 hpi_quota
    // Total remaining: 32+12+24+2 = 70
  } else {
    pickBuckets(TOP_BUCKETS_70);       // 56 from top_30000
    pick(safe.ru_quota, 6);            // 6 ru_quota
    pick(safe.kz_quota, 5);            // 5 kz_quota
    pick(safe.hpi_quota, 3);           // 3 hpi_quota
    // Total remaining: 56+6+5+3 = 70
  }

  // calib is already shuffled; shuffle remaining before appending
  return [...calib, ...shuffle(remaining)];
}

// ── Adaptive tail helpers ─────────────────────────────────────────────────────

export function getInitialSessionCounts(calib: Person[]): SessionCounts {
  const domainCount:    Record<string, number> = {};
  const subdomainCount: Record<string, number> = {};
  const countryCount:   Record<string, number> = {};
  let softSensitiveCount = 0;

  for (const p of calib) {
    const d = p.domain || 'unknown';
    domainCount[d] = (domainCount[d] ?? 0) + 1;
    if (p.subdomain)   subdomainCount[p.subdomain]   = (subdomainCount[p.subdomain]   ?? 0) + 1;
    if (p.country_tag) countryCount[p.country_tag]   = (countryCount[p.country_tag]   ?? 0) + 1;
    if (p.content_sensitivity === 'crime_sensitive' ||
        p.content_sensitivity === 'scandal_sensitive') softSensitiveCount++;
  }

  return { softSensitiveCount, domainCount, subdomainCount, countryCount };
}

export function createAdaptiveTail(
  pools:         PlayPoolsExtended,
  region:        'kz' | 'global' | undefined,
  usedIds:       Set<string>,
  profile:       AdaptiveProfile,
  sessionCounts: SessionCounts,
): Person[] {
  const safe: PlayPoolsExtended = {
    top_30000: pools.top_30000.filter(p => !isSensitivePerson(p)),
    ru_quota:  pools.ru_quota.filter(p  => !isSensitivePerson(p)),
    kz_quota:  pools.kz_quota.filter(p  => !isSensitivePerson(p)),
    hpi_quota: pools.hpi_quota.filter(p => !isSensitivePerson(p)),
    kz_ca_top: pools.kz_ca_top?.filter(p => !isSensitivePerson(p)),
  };

  // Unified candidate pool, deduped, excluding already-used
  const seenQids = new Set<string>();
  const srcOrder: Person[][] = region === 'kz'
    ? [safe.kz_ca_top ?? [], safe.top_30000, safe.ru_quota, safe.kz_quota, safe.hpi_quota]
    : [safe.top_30000, safe.ru_quota, safe.kz_quota, safe.hpi_quota];

  const candidates: Person[] = [];
  for (const src of srcOrder) {
    for (const p of src) {
      if (!seenQids.has(p.wikidata_id) && !usedIds.has(p.wikidata_id)) {
        seenQids.add(p.wikidata_id);
        candidates.push(p);
      }
    }
  }

  // Score all candidates once, sort descending
  const scored = candidates
    .map(p => ({ person: p, score: getCardFitScore(p, profile) }))
    .sort((a, b) => b.score - a.score);

  // Mutable cap counters (copy from sessionCounts so callee state is isolated)
  const domainCount    = { ...sessionCounts.domainCount };
  const subdomainCount = { ...sessionCounts.subdomainCount };
  const countryCount   = { ...sessionCounts.countryCount };
  let softSensitiveCount = sessionCounts.softSensitiveCount;

  function isCapBlocked(p: Person): boolean {
    const d = p.domain || 'unknown';
    if ((domainCount[d]   ?? 0) >= ADAPTIVE_DOMAIN_MAX)    return true;
    if (p.subdomain   && (subdomainCount[p.subdomain]   ?? 0) >= ADAPTIVE_SUBDOMAIN_MAX) return true;
    if (p.country_tag && (countryCount[p.country_tag]   ?? 0) >= ADAPTIVE_COUNTRY_MAX)  return true;
    const soft = p.content_sensitivity === 'crime_sensitive' ||
                 p.content_sensitivity === 'scandal_sensitive';
    if (soft && softSensitiveCount >= ADAPTIVE_SOFT_MAX) return true;
    return false;
  }

  function consume(p: Person): void {
    usedIds.add(p.wikidata_id);
    const d = p.domain || 'unknown';
    domainCount[d] = (domainCount[d] ?? 0) + 1;
    if (p.subdomain)   subdomainCount[p.subdomain]   = (subdomainCount[p.subdomain]   ?? 0) + 1;
    if (p.country_tag) countryCount[p.country_tag]   = (countryCount[p.country_tag]   ?? 0) + 1;
    const soft = p.content_sensitivity === 'crime_sensitive' ||
                 p.content_sensitivity === 'scandal_sensitive';
    if (soft) softSensitiveCount++;
  }

  const tail: Person[] = [];

  function fillStage(targetSize: number, explorationRatio: number): void {
    const nExploit = Math.round(targetSize * (1 - explorationRatio));
    const nExplore = targetSize - nExploit;

    // Exploit: greedily pick from top of scored list with live cap check
    const exploitCards: Person[] = [];
    for (const { person: p } of scored) {
      if (exploitCards.length >= nExploit) break;
      if (!usedIds.has(p.wikidata_id) && !isCapBlocked(p)) {
        exploitCards.push(p);
        consume(p);
      }
    }

    // Explore: random from remaining eligible (cap state updated by exploit picks)
    const exploitIds = new Set(exploitCards.map(p => p.wikidata_id));
    const explorePool = shuffle(
      scored.map(s => s.person).filter(p =>
        !usedIds.has(p.wikidata_id) && !exploitIds.has(p.wikidata_id) && !isCapBlocked(p),
      ),
    );
    const exploreCards: Person[] = [];
    for (const p of explorePool) {
      if (exploreCards.length >= nExplore) break;
      if (!isCapBlocked(p)) {
        exploreCards.push(p);
        consume(p);
      }
    }

    tail.push(...shuffle([...exploitCards, ...exploreCards]));
  }

  fillStage(20, EXPLORATION_RATIO_EARLY); // cards 31–50
  fillStage(50, EXPLORATION_RATIO_LATE);  // cards 51–100

  return tail;
}
