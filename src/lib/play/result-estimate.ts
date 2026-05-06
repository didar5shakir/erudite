import type { Person, Answer } from './types';
import type { AdaptiveProfile } from './adaptive-profile';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ZoneAxis = 'subdomain' | 'domain' | 'country' | 'macroRegion' | 'era';
export type LevelLabel = 'beginner' | 'casual' | 'engaged' | 'erudite' | 'master';

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

  calibrationEstimate: number;
  publicEstimate:      number;

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
  weakZones:           ZoneStats[];

  isPreliminary:       boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const BASE_BUCKET_TOTALS: Record<string, number> = {
  easy:   1500,
  medium: 8500,
  hard:   20000,
};

export const DEFAULT_BUCKET_RATES: Record<string, number> = {
  easy:   0.7,
  medium: 0.4,
  hard:   0.2,
};

export const BROADER_UNIVERSE_FACTOR = 2;

const LEVEL_THRESHOLDS: Array<[number, LevelLabel]> = [
  [45000, 'master'],
  [28000, 'erudite'],
  [15000, 'engaged'],
  [6000,  'casual'],
];

const ZONE_MIN_TOTAL        = 5;
const ZONE_MAX              = 5;
const STRONG_RATE_THRESHOLD = 0.7;
const WEAK_RATE_THRESHOLD   = 0.4;

// ── Helpers ───────────────────────────────────────────────────────────────────

function roundTo(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
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

export function calculateResultEstimate(
  deck:    Person[],
  answers: Record<string, Answer>,
  profile: AdaptiveProfile,
): ResultEstimate {
  // ── Session answer counts ──
  let knowCount = 0, heardCount = 0, dontKnowCount = 0, scoreSum = 0, answeredCount = 0;
  const bucketData: Record<string, { sum: number; count: number }> = {};

  for (const person of deck) {
    const ans = answers[person.wikidata_id];
    if (!ans) continue;
    answeredCount++;
    const score = ans.answer === 'know' ? 1 : ans.answer === 'heard' ? 0.5 : 0;
    scoreSum += score;
    if (ans.answer === 'know')       knowCount++;
    else if (ans.answer === 'heard') heardCount++;
    else                             dontKnowCount++;

    const b = person.difficulty_bucket ?? 'unknown';
    if (!bucketData[b]) bucketData[b] = { sum: 0, count: 0 };
    bucketData[b].sum   += score;
    bucketData[b].count += 1;
  }

  const scorePercent = answeredCount > 0 ? (scoreSum / answeredCount) * 100 : 0;

  // ── Calibration estimate via difficulty-bucket extrapolation ──
  // unknown bucket excluded; missing buckets use DEFAULT_BUCKET_RATES
  let rawCalib = 0;
  const usedDefaultBuckets: string[] = [];
  const bucketStats = {} as ResultEstimate['bucketStats'];

  for (const b of ['easy', 'medium', 'hard'] as const) {
    const d           = bucketData[b];
    const usedDefault = !(d && d.count > 0);
    const scoreRate   = usedDefault ? DEFAULT_BUCKET_RATES[b] : d.sum / d.count;
    const count       = usedDefault ? 0 : d.count;
    bucketStats[b]    = { count, scoreRate, usedDefault };
    if (usedDefault) usedDefaultBuckets.push(b);
    rawCalib += BASE_BUCKET_TOTALS[b] * scoreRate;
  }
  const calibrationEstimate = roundTo(rawCalib, 100);
  const publicEstimate = Math.max(
    0,
    Math.min(60000, roundTo(calibrationEstimate * BROADER_UNIVERSE_FACTOR, 100)),
  );

  // ── Range (precision grows with cumulative answered count across sessions) ──
  const rangePercent = getRangePercent(profile.stats.totalAnswers);
  const rangeLow     = roundTo(publicEstimate * (1 - rangePercent / 100), 100);
  const rangeHigh    = roundTo(publicEstimate * (1 + rangePercent / 100), 100);

  // ── Level ──
  const levelLabel  = getLevelLabel(publicEstimate);
  const isPreliminary = profile.stats.totalAnswers < 100;

  // ── Zones (based on actual answers, not profile weights) ──
  const axes: Array<{ axis: ZoneAxis; getTag: (p: Person) => string | null }> = [
    { axis: 'subdomain',   getTag: p => p.subdomain },
    { axis: 'domain',      getTag: p => p.domain !== 'unknown' ? p.domain : null },
    { axis: 'country',     getTag: p => p.country_tag },
    { axis: 'macroRegion', getTag: p => p.macro_region !== 'unknown' ? p.macro_region : null },
    { axis: 'era',         getTag: p => p.era_bucket !== 'unknown' ? p.era_bucket : null },
  ];

  const zoneMap = new Map<string, ZoneStats>();
  for (const person of deck) {
    const ans = answers[person.wikidata_id];
    if (!ans) continue;
    const score = ans.answer === 'know' ? 1 : ans.answer === 'heard' ? 0.5 : 0;
    for (const { axis, getTag } of axes) {
      const tag = getTag(person);
      if (!tag) continue;
      const key      = `${axis}:${tag}`;
      const existing = zoneMap.get(key);
      if (existing) {
        existing.total++;
        existing.scoreSum += score;
        existing.rate = existing.scoreSum / existing.total;
      } else {
        zoneMap.set(key, { axis, tag, total: 1, scoreSum: score, rate: score });
      }
    }
  }

  // Build parent-lookup maps for dedup (subdomain→domain, country→macroRegion)
  const subToDomain:      Record<string, string> = {};
  const countryToRegion:  Record<string, string> = {};
  for (const person of deck) {
    if (person.subdomain && person.domain !== 'unknown')
      subToDomain[person.subdomain] = person.domain;
    if (person.country_tag && person.macro_region !== 'unknown')
      countryToRegion[person.country_tag] = person.macro_region;
  }

  function dedup(zones: ZoneStats[]): ZoneStats[] {
    const coveredDomains  = new Set<string>();
    const coveredRegions  = new Set<string>();
    for (const z of zones) {
      if (z.axis === 'subdomain') { const d = subToDomain[z.tag];      if (d) coveredDomains.add(d); }
      if (z.axis === 'country')   { const r = countryToRegion[z.tag];  if (r) coveredRegions.add(r); }
    }
    return zones.filter(z =>
      !(z.axis === 'domain'      && coveredDomains.has(z.tag)) &&
      !(z.axis === 'macroRegion' && coveredRegions.has(z.tag)),
    );
  }

  const eligible = [...zoneMap.values()].filter(z => z.total >= ZONE_MIN_TOTAL);

  const strongZones = dedup(
    eligible
      .filter(z => z.rate >= STRONG_RATE_THRESHOLD)
      .sort((a, b) => b.rate - a.rate || b.total - a.total),
  ).slice(0, ZONE_MAX);

  const weakZones = dedup(
    eligible
      .filter(z => z.rate <= WEAK_RATE_THRESHOLD)
      .sort((a, b) => a.rate - b.rate || b.total - a.total),
  ).slice(0, ZONE_MAX);

  return {
    answeredCount,
    knowCount,
    heardCount,
    dontKnowCount,
    scoreSum,
    scorePercent,
    calibrationEstimate,
    publicEstimate,
    rangeLow,
    rangeHigh,
    rangePercent,
    levelLabel,
    bucketStats,
    usedDefaultBuckets,
    strongZones,
    weakZones,
    isPreliminary,
  };
}
