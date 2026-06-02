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
  hard:   0.2,
};

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
  for (const a of answers) {
    if (a.isRegionalSeed === true) continue;
    const b = a.difficultyBucket ?? 'unknown';
    if (!bucketData[b]) bucketData[b] = { sum: 0, count: 0 };
    bucketData[b].sum   += a.score;
    bucketData[b].count += 1;
  }

  // ── 30k-base extrapolation; missing buckets use DEFAULT_BUCKET_RATES ──
  let rawEstimate = 0;
  const usedDefaultBuckets: string[] = [];
  const bucketStats = {} as ResultEstimate['bucketStats'];

  for (const b of ['easy', 'medium', 'hard'] as const) {
    const d           = bucketData[b];
    const usedDefault = !(d && d.count > 0);
    const scoreRate   = usedDefault ? DEFAULT_BUCKET_RATES[b] : d.sum / d.count;
    const count       = usedDefault ? 0 : d.count;
    bucketStats[b]    = { count, scoreRate, usedDefault };
    if (usedDefault) usedDefaultBuckets.push(b);
    rawEstimate += BUCKET_UNIVERSE[b] * scoreRate;
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
    mediumZones,
    weakZones,
    isPreliminary,
  };
}
