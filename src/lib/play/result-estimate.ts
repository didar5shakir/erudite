import type { AdaptiveProfile, AnswerRecord } from './adaptive-profile';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ZoneAxis = 'subdomain' | 'domain' | 'country' | 'macroRegion' | 'era';
export type ZoneCategory = 'topic' | 'geo' | 'time';
export type LevelLabel = 'beginner' | 'casual' | 'good' | 'strong' | 'erudite' | 'master';

export interface ZoneStats {
  axis:     ZoneAxis;
  tag:      string;
  total:    number;
  scoreSum: number;
  rate:     number;
}

export interface BucketStat {
  count:       number;
  scoreRate:   number;
  usedDefault: boolean;
}

export interface ResultEstimate {
  answeredCount:       number;
  knowCount:           number;
  heardCount:          number;
  dontKnowCount:       number;
  scoreSum:            number;
  scorePercent:        number;

  universeTotal:       number;   // public denominator (30 000)
  calibrationEstimate: number;   // raw 30k-base extrapolation (rounded)
  publicEstimate:      number;   // clamped to [0, universeTotal]

  rangeLow:            number;
  rangeHigh:           number;
  rangePercent:        number;

  levelLabel:          LevelLabel;

  bucketStats: {
    easy:   BucketStat;
    medium: BucketStat;
    hard:   BucketStat;
  };
  usedDefaultBuckets:  string[];

  strongZones:         ZoneStats[];
  strongIsFallback:    boolean;     // true ⇒ strongZones empty, UI shows topZones + fallback title
  topZones:            ZoneStats[]; // top eligible by rate, regardless of threshold (fallback pool)
  displayStrongZones:  ZoneStats[]; // top-section list (≤5, ≤2 geo, strong→medium fill)
  mediumZones:         ZoneStats[];
  weakZones:           ZoneStats[];

  isPreliminary:       boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Public universe = 30 000. Bucket universes sum to exactly 30 000, so with each
// bucket rate in [0,1] the extrapolated estimate can never exceed 30 000 by
// construction. The clamps below are a defensive guarantee.
export const UNIVERSE_TOTAL = 30000;
export const BUCKET_UNIVERSE: Record<string, number> = {
  easy:   1500,
  medium: 4500,
  hard:   24000,
};

export const DEFAULT_BUCKET_RATES: Record<string, number> = {
  easy:   0.7,
  medium: 0.4,
  hard:   0.15,
};

// Layer-specific shrinkage strength. Each layer's observed rate is pulled toward its
// conservative default with weight k/(n+k): thin, adaptively-biased layers (esp. hard,
// which carries 80% of the estimate) stay stable, while the central value converges to
// the observed rate as the sample grows (w = n/(n+k) → 1). Stage 6.2d.
export const SHRINKAGE_K: Record<string, number> = {
  easy:   3,
  medium: 5,
  hard:   10,
};

// Ability-aware hard prior. The hard layer carries 80% of the estimate; a FIXED hard
// prior inflates weak users (who get thin hard data, since the hard gate withholds hard
// cards until thematic confidence builds) into a misleading "strong" result. Instead the
// hard layer shrinks toward a prior scaled by the user's OWN observed recognition rate,
// so near-zero users keep a near-zero hard prior. easy/medium keep fixed defaults.
export const HARD_PRIOR_FACTOR = 0.3;
export const HARD_PRIOR_MIN    = 0.02;
export const HARD_PRIOR_MAX    = DEFAULT_BUCKET_RATES.hard; // 0.15 cap

// Nonlinear hard damping. The adaptive hard sample is biased toward the user's strong
// themes, so a linear extrapolation over-credits the 24000-person hard universe. Since
// the shrunk hard rate is in [0,1], rate^1.5 < rate damps it — more for low rates (theme
// noise), less for high rates (genuine breadth). easy/medium stay linear. Stage 6.2e.
export const HARD_DAMP_EXPONENT = 1.5;

// MVP level scale. 30 000 is the measurement base, not a realistic human ceiling —
// most users land ~500–7000, so 6000+ is already very strong and 10000+ exceptional.
//   beginner 0–499 · casual 500–1499 · good 1500–2999 · strong 3000–5999
//   erudite 6000–9999 · master/encyclopedic 10000+
const LEVEL_THRESHOLDS: Array<[number, LevelLabel]> = [
  [10000, 'master'],
  [6000,  'erudite'],
  [3000,  'strong'],
  [1500,  'good'],
  [500,   'casual'],
];

const ZONE_MIN_TOTAL        = 5;
const ZONE_MAX              = 5;
const STRONG_RATE_THRESHOLD = 0.7;
const WEAK_RATE_THRESHOLD   = 0.4;
const STRONG_MAX_GEO        = 2;   // geography may not dominate the strong list

const ZONE_CATEGORY: Record<ZoneAxis, ZoneCategory> = {
  subdomain:   'topic',
  domain:      'topic',
  country:     'geo',
  macroRegion: 'geo',
  era:         'time',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function roundTo(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function getRangePercent(totalAnswers: number): number {
  if (totalAnswers >= 2000) return 7;
  if (totalAnswers >= 1000) return 10;
  if (totalAnswers >= 500)  return 12;
  if (totalAnswers >= 200)  return 15;
  return 20;
}

function getLevelLabel(publicEstimate: number): LevelLabel {
  for (const [threshold, label] of LEVEL_THRESHOLDS) {
    if (publicEstimate >= threshold) return label;
  }
  return 'beginner';
}

// ── Continuation / accuracy helpers (presentation) ──────────────────────────────

export type AccuracyTier = 'baseline' | 'stable' | 'high' | 'detailed';

// Next milestone for the "Continue" button, based on cumulative answeredCount.
// Returns null past 3000 (open-ended "continue further").
export function getContinueMilestone(answeredCount: number): number | null {
  if (answeredCount < 200)  return 200;
  if (answeredCount < 300)  return 300;
  if (answeredCount < 400)  return 400;
  if (answeredCount < 500)  return 500;
  if (answeredCount < 750)  return 750;
  if (answeredCount < 1000) return 1000;
  if (answeredCount < 1500) return 1500;
  if (answeredCount < 2000) return 2000;
  if (answeredCount < 3000) return 3000;
  return null;
}

export function getAccuracyTier(answeredCount: number): AccuracyTier {
  if (answeredCount < 200)  return 'baseline';
  if (answeredCount < 500)  return 'stable';
  if (answeredCount < 1000) return 'high';
  return 'detailed';
}

// ── Main function ─────────────────────────────────────────────────────────────
//
// Cumulative: the estimate and zones are computed from profile.answers[] (all
// answers across all completed sessions), and counts from profile.stats. This is
// what makes "continue to 200" genuinely improve the estimate, not just the range.

export function calculateResultEstimate(profile: AdaptiveProfile): ResultEstimate {
  const answers: AnswerRecord[] = profile.answers ?? [];

  // ── Cumulative counts from profile.stats ──
  const answeredCount = profile.stats.totalAnswers;
  const knowCount     = profile.stats.knowCount;
  const heardCount    = profile.stats.heardCount;
  const dontKnowCount = profile.stats.dontKnowCount;
  const scoreSum      = profile.stats.scoreSum;
  const scorePercent  = answeredCount > 0 ? (scoreSum / answeredCount) * 100 : 0;

  // ── Bucket aggregation from cumulative answers ──
  // Regional-seed cards (kz_ca) are locally-curated / globally-obscure and are NOT
  // representative of the global 30k universe, so they are excluded from the
  // bucket-extrapolation estimate. They still count toward zones/profile below.
  const bucketData: Record<string, { sum: number; count: number }> = {};
  let nonSeedSum = 0, nonSeedCount = 0;
  for (const a of answers) {
    if (a.isRegionalSeed === true) continue;
    nonSeedSum += a.score; nonSeedCount += 1;
    const b = a.difficultyBucket ?? 'unknown';
    if (!bucketData[b]) bucketData[b] = { sum: 0, count: 0 };
    bucketData[b].sum   += a.score;
    bucketData[b].count += 1;
  }

  // Ability-aware hard prior (see constants above); easy/medium keep fixed defaults.
  const userObservedRate = nonSeedCount > 0 ? nonSeedSum / nonSeedCount : 0;
  const hardPrior = Math.min(HARD_PRIOR_MAX, Math.max(HARD_PRIOR_MIN, userObservedRate * HARD_PRIOR_FACTOR));
  const layerDefault: Record<string, number> = {
    easy:   DEFAULT_BUCKET_RATES.easy,
    medium: DEFAULT_BUCKET_RATES.medium,
    hard:   hardPrior,
  };

  // ── 30k-base extrapolation; missing buckets use the (layer) default ──
  let rawEstimate = 0;
  const usedDefaultBuckets: string[] = [];
  const bucketStats = {} as ResultEstimate['bucketStats'];

  for (const b of ['easy', 'medium', 'hard'] as const) {
    const d           = bucketData[b];
    const usedDefault = !(d && d.count > 0);
    const count       = usedDefault ? 0 : d.count;
    // observed rate (shown to the user as "% recognized" — kept raw, not shrunk)
    const scoreRate   = usedDefault ? layerDefault[b] : d.sum / d.count;
    bucketStats[b]    = { count, scoreRate, usedDefault };
    if (usedDefault) usedDefaultBuckets.push(b);
    // estimate uses the SHRUNK rate (observed pulled toward the layer default by k/(n+k))
    const k        = SHRINKAGE_K[b];
    const shrunk   = (count * scoreRate + k * layerDefault[b]) / (count + k);
    // hard layer is damped nonlinearly (theme-bias correction); easy/medium stay linear
    const effective = b === 'hard' ? Math.pow(shrunk, HARD_DAMP_EXPONENT) : shrunk;
    rawEstimate   += BUCKET_UNIVERSE[b] * effective;
  }

  const calibrationEstimate = roundTo(rawEstimate, 100);
  const publicEstimate = clamp(calibrationEstimate, 0, UNIVERSE_TOTAL);

  // ── Range (precision grows with cumulative answered count); clamped to [0,30k] ──
  const rangePercent = getRangePercent(answeredCount);
  const rangeLow     = clamp(roundTo(publicEstimate * (1 - rangePercent / 100), 100), 0, UNIVERSE_TOTAL);
  const rangeHigh    = clamp(roundTo(publicEstimate * (1 + rangePercent / 100), 100), 0, UNIVERSE_TOTAL);

  // ── Level ──
  const levelLabel    = getLevelLabel(publicEstimate);
  const isPreliminary = answeredCount < 100;

  // ── Zones (cumulative; from profile.answers) ──
  const axes: Array<{ axis: ZoneAxis; getTag: (a: AnswerRecord) => string | null }> = [
    { axis: 'subdomain',   getTag: a => a.subdomain },
    { axis: 'domain',      getTag: a => (a.domain && a.domain !== 'unknown') ? a.domain : null },
    { axis: 'country',     getTag: a => a.country },
    { axis: 'macroRegion', getTag: a => (a.macroRegion && a.macroRegion !== 'unknown') ? a.macroRegion : null },
    { axis: 'era',         getTag: a => (a.era && a.era !== 'unknown') ? a.era : null },
  ];

  const zoneMap = new Map<string, ZoneStats>();
  const subToDomain:     Record<string, string> = {};
  const countryToRegion: Record<string, string> = {};

  for (const a of answers) {
    if (a.subdomain && a.domain && a.domain !== 'unknown') subToDomain[a.subdomain] = a.domain;
    if (a.country && a.macroRegion && a.macroRegion !== 'unknown') countryToRegion[a.country] = a.macroRegion;
    for (const { axis, getTag } of axes) {
      const tag = getTag(a);
      if (!tag) continue;
      const key = `${axis}:${tag}`;
      const existing = zoneMap.get(key);
      if (existing) {
        existing.total++;
        existing.scoreSum += a.score;
        existing.rate = existing.scoreSum / existing.total;
      } else {
        zoneMap.set(key, { axis, tag, total: 1, scoreSum: a.score, rate: a.score });
      }
    }
  }

  function dedup(zones: ZoneStats[]): ZoneStats[] {
    const coveredDomains = new Set<string>();
    const coveredRegions = new Set<string>();
    for (const z of zones) {
      if (z.axis === 'subdomain') { const d = subToDomain[z.tag];     if (d) coveredDomains.add(d); }
      if (z.axis === 'country')   { const r = countryToRegion[z.tag]; if (r) coveredRegions.add(r); }
    }
    return zones.filter(z =>
      !(z.axis === 'domain'      && coveredDomains.has(z.tag)) &&
      !(z.axis === 'macroRegion' && coveredRegions.has(z.tag)),
    );
  }

  const eligible = [...zoneMap.values()].filter(z => z.total >= ZONE_MIN_TOTAL);
  const byRate   = (a: ZoneStats, b: ZoneStats) => b.rate - a.rate || b.total - a.total;

  // Strong: balanced so geography cannot crowd out topics.
  // Guarantee ≥1 topic zone (if any strong topic exists), cap geo at STRONG_MAX_GEO.
  function selectStrongBalanced(zones: ZoneStats[]): ZoneStats[] {
    const sorted = [...zones].sort(byRate);
    const result: ZoneStats[] = [];
    let geoCount = 0;
    const pushable = (z: ZoneStats) =>
      !result.includes(z) &&
      !(ZONE_CATEGORY[z.axis] === 'geo' && geoCount >= STRONG_MAX_GEO);

    const firstTopic = sorted.find(z => ZONE_CATEGORY[z.axis] === 'topic');
    if (firstTopic) { result.push(firstTopic); }

    for (const z of sorted) {
      if (result.length >= ZONE_MAX) break;
      if (!pushable(z)) continue;
      result.push(z);
      if (ZONE_CATEGORY[z.axis] === 'geo') geoCount++;
    }
    return result.sort(byRate);
  }

  const strongZones = selectStrongBalanced(
    dedup(eligible.filter(z => z.rate >= STRONG_RATE_THRESHOLD)),
  );

  const mediumZones = dedup(
    eligible.filter(z => z.rate > WEAK_RATE_THRESHOLD && z.rate < STRONG_RATE_THRESHOLD).sort(byRate),
  ).slice(0, ZONE_MAX);

  const weakZones = dedup(
    eligible.filter(z => z.rate <= WEAK_RATE_THRESHOLD)
      .sort((a, b) => a.rate - b.rate || b.total - a.total),
  ).slice(0, ZONE_MAX);

  // Fallback pool: top eligible zones by rate regardless of the 0.7 threshold.
  // When strict strongZones is empty (common before a clear strength forms), the UI
  // shows these under a "most pronounced areas" title so the section is never empty.
  const topZones = dedup([...eligible].sort(byRate)).slice(0, ZONE_MAX);
  const strongIsFallback = strongZones.length === 0;

  // Top-section display list (presentation only — no score change):
  // strict strong first, then fill from highest-rated medium zones up to ZONE_MAX,
  // capping geography at STRONG_MAX_GEO so thematic zones are preferred. When there
  // are no strict strong zones, fall back to top-by-rate zones under a softer title.
  const displayStrongZones = (() => {
    const pool = dedup(strongZones.length ? [...strongZones, ...mediumZones] : [...topZones]);
    const out: ZoneStats[] = [];
    let geo = 0;
    for (const z of pool) {
      if (out.length >= ZONE_MAX) break;
      const isGeo = ZONE_CATEGORY[z.axis] === 'geo';
      if (isGeo && geo >= STRONG_MAX_GEO) continue;
      out.push(z);
      if (isGeo) geo++;
    }
    return out;
  })();

  return {
    answeredCount,
    knowCount,
    heardCount,
    dontKnowCount,
    scoreSum,
    scorePercent,
    universeTotal: UNIVERSE_TOTAL,
    calibrationEstimate,
    publicEstimate,
    rangeLow,
    rangeHigh,
    rangePercent,
    levelLabel,
    bucketStats,
    usedDefaultBuckets,
    strongZones,
    strongIsFallback,
    topZones,
    displayStrongZones,
    mediumZones,
    weakZones,
    isPreliminary,
  };
}
