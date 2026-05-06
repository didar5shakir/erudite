import type { Person } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnswerValue = 'know' | 'heard' | 'dont_know';

export interface AdaptiveWeights {
  domain:      Record<string, number>;
  occupation:  Record<string, number>;
  subdomain:   Record<string, number>;
  country:     Record<string, number>;
  macroRegion: Record<string, number>;
  era:         Record<string, number>;
}

export interface AdaptiveStats {
  totalAnswers:   number;
  knowCount:      number;
  heardCount:     number;
  dontKnowCount:  number;
  scoreSum:       number;
}

export interface AnswerRecord {
  qid:             string;
  answer:          AnswerValue;
  score:           1 | 0.5 | 0;
  difficultyBucket: string | null;
  domain:          string | null;
  occupation:      string | null;
  subdomain:       string | null;
  country:         string | null;
  macroRegion:     string | null;
  era:             string | null;
  timestamp:       number;
}

export interface AdaptiveProfile {
  version: 1;
  weights: AdaptiveWeights;
  stats:   AdaptiveStats;
  answers: AnswerRecord[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 5.0;

export const ERA_ORDER = [
  'ancient_bc',
  'classical_late_antiquity',
  'medieval',
  'early_modern',
  'industrial_modern',
  'postwar_births',
  'late_20c_births',
  'modern_media_births',
  'digital_births',
] as const;

// ── Helper functions ──────────────────────────────────────────────────────────

export function getAnswerScore(answer: AnswerValue): 1 | 0.5 | 0 {
  if (answer === 'know')      return 1;
  if (answer === 'heard')     return 0.5;
  return 0;
}

export function getDifficultyAnswerMultiplier(
  difficultyBucket: string | null | undefined,
  answer: AnswerValue,
): number {
  const d = difficultyBucket ?? 'unknown';
  if (answer === 'know') {
    if (d === 'easy')    return 1.1;
    if (d === 'medium')  return 1.3;
    if (d === 'hard')    return 1.5;
    return 1.2; // unknown
  }
  if (answer === 'heard') {
    return 1.0; // heard doesn't move weights — score 0.5 is tracked but profile unchanged
  }
  // dont_know
  if (d === 'easy')    return 0.5;
  if (d === 'medium')  return 0.7;
  if (d === 'hard')    return 0.9;
  return 0.8; // unknown
}

export function softenMultiplier(multiplier: number, strength: number): number {
  return 1 + (multiplier - 1) * strength;
}

export function getNeighborEraBuckets(eraBucket: string | null | undefined): string[] {
  if (!eraBucket || eraBucket === 'unknown') return [];
  const idx = ERA_ORDER.indexOf(eraBucket as typeof ERA_ORDER[number]);
  if (idx === -1) return [];
  const neighbors: string[] = [];
  if (idx > 0)                    neighbors.push(ERA_ORDER[idx - 1]);
  if (idx < ERA_ORDER.length - 1) neighbors.push(ERA_ORDER[idx + 1]);
  return neighbors;
}

function isValidTag(value: string | null | undefined): value is string {
  return !!value && value !== 'unknown';
}

function clamp(value: number): number {
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, value));
}

function applyMultiplier(
  weights: Record<string, number>,
  key: string,
  multiplier: number,
): void {
  const current = weights[key] ?? 1.0;
  weights[key] = clamp(current * multiplier);
}

// ── Profile factory ───────────────────────────────────────────────────────────

export function createInitialAdaptiveProfile(): AdaptiveProfile {
  return {
    version: 1,
    weights: {
      domain:      {},
      occupation:  {},
      subdomain:   {},
      country:     {},
      macroRegion: {},
      era:         {},
    },
    stats: {
      totalAnswers:  0,
      knowCount:     0,
      heardCount:    0,
      dontKnowCount: 0,
      scoreSum:      0,
    },
    answers: [],
  };
}

// ── Core update function ──────────────────────────────────────────────────────

export function updateAdaptiveProfile(
  profile: AdaptiveProfile,
  person: Pick<Person,
    | 'wikidata_id'
    | 'occupation'
    | 'domain'
    | 'subdomain'
    | 'country_tag'
    | 'macro_region'
    | 'era_bucket'
    | 'difficulty_bucket'
  >,
  answer: AnswerValue,
  options: { timestamp: number },
): AdaptiveProfile {
  const weights = {
    domain:      { ...profile.weights.domain },
    occupation:  { ...profile.weights.occupation },
    subdomain:   { ...profile.weights.subdomain },
    country:     { ...profile.weights.country },
    macroRegion: { ...profile.weights.macroRegion },
    era:         { ...profile.weights.era },
  };

  const base = getDifficultyAnswerMultiplier(person.difficulty_bucket, answer);
  const soft05 = softenMultiplier(base, 0.5);
  const soft04 = softenMultiplier(base, 0.4);
  const soft02 = softenMultiplier(base, 0.2);

  // Strong signal: occupation, subdomain, country
  if (isValidTag(person.occupation))   applyMultiplier(weights.occupation,  person.occupation,   base);
  if (isValidTag(person.subdomain))    applyMultiplier(weights.subdomain,   person.subdomain,    base);
  if (isValidTag(person.country_tag))  applyMultiplier(weights.country,     person.country_tag,  base);

  // Weak signal: domain, macro_region
  if (isValidTag(person.domain))       applyMultiplier(weights.domain,      person.domain,       soft05);
  if (isValidTag(person.macro_region)) applyMultiplier(weights.macroRegion, person.macro_region, soft05);

  // Careful signal: era_bucket
  if (isValidTag(person.era_bucket)) {
    applyMultiplier(weights.era, person.era_bucket, soft04);
    for (const neighbor of getNeighborEraBuckets(person.era_bucket)) {
      applyMultiplier(weights.era, neighbor, soft02);
    }
  }

  const score = getAnswerScore(answer);

  const record: AnswerRecord = {
    qid:             person.wikidata_id,
    answer,
    score,
    difficultyBucket: isValidTag(person.difficulty_bucket) ? person.difficulty_bucket : null,
    domain:          isValidTag(person.domain)       ? person.domain       : null,
    occupation:      isValidTag(person.occupation)   ? person.occupation   : null,
    subdomain:       isValidTag(person.subdomain)    ? person.subdomain    : null,
    country:         isValidTag(person.country_tag)  ? person.country_tag  : null,
    macroRegion:     isValidTag(person.macro_region) ? person.macro_region : null,
    era:             isValidTag(person.era_bucket)   ? person.era_bucket   : null,
    timestamp:       options.timestamp,
  };

  const stats: AdaptiveStats = {
    totalAnswers:  profile.stats.totalAnswers + 1,
    knowCount:     profile.stats.knowCount     + (answer === 'know'      ? 1 : 0),
    heardCount:    profile.stats.heardCount    + (answer === 'heard'     ? 1 : 0),
    dontKnowCount: profile.stats.dontKnowCount + (answer === 'dont_know' ? 1 : 0),
    scoreSum:      profile.stats.scoreSum + score,
  };

  return {
    version: 1,
    weights,
    stats,
    answers: [...profile.answers, record],
  };
}
