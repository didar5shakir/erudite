/**
 * Sanity checks for Stage 5.11b lazy adaptive card generation.
 * Simulates full sessions (30 calib + 70 lazy adaptive) and checks invariants.
 * Run: node scripts/sanity_live_adaptive.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const pools = JSON.parse(readFileSync(join(ROOT, 'public/data/play_pools.json'), 'utf-8'));

// ── Constants (mirrors play-sampler.ts) ───────────────────────────────────────

const SESSION_CARD_COUNT      = 100;
const CALIB_SIZE              = 30;
const CALIB_EASY              = 18;
const CALIB_MEDIUM            = 12;
const CALIB_HARD              = 0;
const CALIB_KZ_EASY           = 10;
const CALIB_KZ_MEDIUM         = 7;
const CALIB_KZ_HARD           = 0;
const CALIB_DOMAIN_MAX        = 5;
const CALIB_SUBDOMAIN_MAX     = 3;
const CALIB_ERA_MAX           = 8;
const CALIB_REGION_MAX        = 8;
const CALIB_KZ_CA_TARGET      = 12;
const CALIB_KZ_CA_MAX         = 12;
const CALIB_EASY_RANK_MAX     = 1500;
const CALIB_MEDIUM_RANK_MAX   = 6000;
const CALIB_HARD_RANK_MAX     = 13000;
const ADAPTIVE_DOMAIN_MAX     = 30;
const ADAPTIVE_SUBDOMAIN_MAX  = 20;
const ADAPTIVE_COUNTRY_MAX    = 20;
const UNKNOWN_COUNTRY_MAX     = 8;
const ADAPTIVE_SOFT_MAX       = 2;
const TOP_K                   = 200;
const ANTISTREAK_COUNTRY_MAX  = 2;
const ANTISTREAK_SUBDOMAIN_MAX = 2;
const ANTISTREAK_DOMAIN_MAX   = 3;
const EXPLORATION_RATIO_EARLY = 0.20;
const EXPLORATION_RATIO_LATE  = 0.10;
const SUITE_RUNS              = 100;

const SENSITIVE_OCCUPATIONS = new Set(['PORNOGRAPHIC ACTOR']);
function isSensitive(p) { return SENSITIVE_OCCUPATIONS.has(p.occupation ?? ''); }
function effectiveCountryKey(p) {
  const ct = p.country_tag;
  if (!ct || ct === 'unknown') return '_unknown_country';
  return ct;
}

// ── Core shuffle / sample ─────────────────────────────────────────────────────

function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Calibration block (mirrors createCalibrationBlock) ────────────────────────

function createCalibrationBlock(safe, kzCaIds, region, usedIds) {
  const seenQids = new Set();
  const poolOrder = region === 'kz'
    ? [safe.kz_ca_top, safe.top_30000, safe.ru_quota, safe.kz_quota, safe.hpi_quota]
    : [safe.top_30000, safe.ru_quota, safe.kz_quota, safe.hpi_quota];

  const allCandidates = [];
  for (const src of poolOrder) {
    for (const p of src) {
      if (!seenQids.has(p.wikidata_id) && !usedIds.has(p.wikidata_id) &&
          p.content_sensitivity === 'normal') {
        seenQids.add(p.wikidata_id);
        allCandidates.push(p);
      }
    }
  }
  const shuffled = shuffle(allCandidates);
  const domainCount = {}, subdomainCount = {}, eraCount = {}, macroRegionCount = {};
  const diffCount = { easy: 0, medium: 0, hard: 0, unknown: 0 };
  let kzCaCount = 0;
  const block = [], blockIds = new Set();

  function isConstrained(p, { relaxEra = false, relaxSub = false, relaxDomain = false } = {}) {
    if (blockIds.has(p.wikidata_id)) return true;
    const d = p.domain || 'unknown', sub = p.subdomain;
    const era = p.era_bucket || 'unknown', reg = p.macro_region || 'unknown';
    if (!relaxDomain && (domainCount[d]   ?? 0) >= CALIB_DOMAIN_MAX)   return true;
    if (!relaxSub    && sub && (subdomainCount[sub] ?? 0) >= CALIB_SUBDOMAIN_MAX) return true;
    if (!relaxEra    && (eraCount[era]    ?? 0) >= CALIB_ERA_MAX)       return true;
    if (region === 'global' && (macroRegionCount[reg] ?? 0) >= CALIB_REGION_MAX) return true;
    if (kzCaIds.has(p.wikidata_id) && kzCaCount >= CALIB_KZ_CA_MAX)   return true;
    return false;
  }
  function addCard(p) {
    block.push(p); blockIds.add(p.wikidata_id); usedIds.add(p.wikidata_id);
    const d = p.domain || 'unknown', sub = p.subdomain;
    domainCount[d] = (domainCount[d] ?? 0) + 1;
    eraCount[p.era_bucket || 'unknown'] = (eraCount[p.era_bucket || 'unknown'] ?? 0) + 1;
    macroRegionCount[p.macro_region || 'unknown'] = (macroRegionCount[p.macro_region || 'unknown'] ?? 0) + 1;
    if (sub) subdomainCount[sub] = (subdomainCount[sub] ?? 0) + 1;
    diffCount[p.difficulty_bucket ?? 'unknown'] = (diffCount[p.difficulty_bucket ?? 'unknown'] ?? 0) + 1;
    if (kzCaIds.has(p.wikidata_id)) kzCaCount++;
  }
  function fillRelaxed(flags) {
    for (const p of shuffled) {
      if (block.length >= CALIB_SIZE) break;
      if (!isConstrained(p, flags)) addCard(p);
    }
  }

  // Probe Phase 0: guarantee coverage for configured subdomains before regional seeds
  for (const probe of COVERAGE_PROBES) {
    if (block.length >= CALIB_SIZE) break;
    if ((subdomainCount[probe.subdomain] ?? 0) > 0) continue;
    for (const p of shuffled) {
      if (p.subdomain !== probe.subdomain) continue;
      if (!probe.difficulties.includes(p.difficulty_bucket ?? '')) continue;
      if (p.global_rank > probe.maxRank) continue;
      if (isConstrained(p)) continue;
      addCard(p);
      break;
    }
  }

  if (region === 'kz') {
    for (const p of shuffled) {
      if (kzCaCount >= CALIB_KZ_CA_TARGET) break;
      if (kzCaIds.has(p.wikidata_id) && !isConstrained(p)) addCard({ ...p, isRegionalSeed: true });
    }
  }
  const phase1Snap = region === 'kz' ? { ...diffCount } : {};
  const p2Count = diff => (diffCount[diff] ?? 0) - (phase1Snap[diff] ?? 0);
  for (const [diff, target, maxRank] of [
    ['easy',   region === 'kz' ? CALIB_KZ_EASY   : CALIB_EASY,   CALIB_EASY_RANK_MAX],
    ['medium', region === 'kz' ? CALIB_KZ_MEDIUM : CALIB_MEDIUM, CALIB_MEDIUM_RANK_MAX],
    ['hard',   region === 'kz' ? CALIB_KZ_HARD   : CALIB_HARD,   CALIB_HARD_RANK_MAX],
  ]) {
    for (const p of shuffled) {
      if (p2Count(diff) >= target) break;
      if (p.difficulty_bucket === diff && p.global_rank <= maxRank &&
          (p.era_bucket ?? 'unknown') !== 'unknown' && !isConstrained(p)) addCard(p);
    }
    for (const p of shuffled) {
      if (p2Count(diff) >= target) break;
      if (p.difficulty_bucket === diff && p.global_rank <= maxRank && !isConstrained(p)) addCard(p);
    }
  }
  for (const p of shuffled) { if (block.length >= CALIB_SIZE) break; if (!isConstrained(p)) addCard(p); }
  fillRelaxed({ relaxEra: true });
  fillRelaxed({ relaxEra: true, relaxSub: true });
  fillRelaxed({ relaxEra: true, relaxSub: true, relaxDomain: true });
  if (block.length < CALIB_SIZE) {
    for (const p of shuffled) { if (block.length >= CALIB_SIZE) break; if (!blockIds.has(p.wikidata_id)) addCard(p); }
  }
  return shuffle(block);
}

// ── Adaptive profile helpers (mirrors adaptive-profile.ts) ───────────────────

const ERA_ORDER = [
  'ancient_bc','classical_late_antiquity','medieval','early_modern',
  'industrial_modern','postwar_births','late_20c_births','modern_media_births','digital_births',
];
const MIN_WEIGHT = 0.1, MAX_WEIGHT = 3.0;
const HARD_UNLOCK_THRESHOLD   = 2.0;
const MEDIUM_UNLOCK_THRESHOLD = 1.1;

const COVERAGE_PROBES = [
  { subdomain: 'football', difficulties: ['easy', 'medium'], maxRank: CALIB_MEDIUM_RANK_MAX },
];
const clamp = v => Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, v));
function soften(base, s) { return 1 + (base - 1) * s; }
function getDiffMult(bucket, answer) {
  if (answer === 'know') {
    if (bucket === 'easy') return 1.1; if (bucket === 'medium') return 1.3;
    if (bucket === 'hard') return 1.5; return 1.2;
  }
  if (answer === 'heard') return 1.0;
  if (bucket === 'easy') return 0.5; if (bucket === 'medium') return 0.7;
  if (bucket === 'hard') return 0.9; return 0.8;
}

function getRegionalSeedMult(bucket, answer) {
  if (answer === 'know') {
    if (bucket === 'easy') return 1.05; if (bucket === 'medium') return 1.15;
    if (bucket === 'hard') return 1.25; return 1.10;
  }
  if (answer === 'heard') return 1.0;
  if (bucket === 'easy') return 0.60; if (bucket === 'medium') return 0.75;
  if (bucket === 'hard') return 0.90; return 0.75;
}
function isValidTag(v) { return !!v && v !== 'unknown'; }

function emptyProfile() {
  return {
    version: 1,
    weights: { domain:{}, occupation:{}, subdomain:{}, country:{}, macroRegion:{}, era:{} },
    stats: { totalAnswers:0, knowCount:0, heardCount:0, dontKnowCount:0, scoreSum:0 },
    answers: [],
  };
}

function updateProfile(profile, person, answer) {
  const w = {
    domain:      { ...profile.weights.domain },
    occupation:  { ...profile.weights.occupation },
    subdomain:   { ...profile.weights.subdomain },
    country:     { ...profile.weights.country },
    macroRegion: { ...profile.weights.macroRegion },
    era:         { ...profile.weights.era },
  };
  const apply = (key, tag, mult) => {
    if (!isValidTag(tag)) return;
    w[key][tag] = clamp((w[key][tag] ?? 1.0) * mult);
  };
  const base = person.isRegionalSeed
    ? getRegionalSeedMult(person.difficulty_bucket, answer)
    : getDiffMult(person.difficulty_bucket, answer);
  apply('occupation',  person.occupation,  base);
  apply('subdomain',   person.subdomain,   base);
  apply('country',     person.country_tag, base);
  apply('domain',      person.domain,      soften(base, 0.5));
  apply('macroRegion', person.macro_region,soften(base, 0.5));
  apply('era',         person.era_bucket,  soften(base, 0.4));
  const idx = ERA_ORDER.indexOf(person.era_bucket);
  if (idx > 0) apply('era', ERA_ORDER[idx - 1], soften(base, 0.2));
  if (idx >= 0 && idx < ERA_ORDER.length - 1) apply('era', ERA_ORDER[idx + 1], soften(base, 0.2));
  return { ...profile, weights: w };
}

function getCardFitScore(person, profile) {
  let wSum = 0, score = 0;
  function add(w, key, tag) {
    if (!isValidTag(tag)) return;
    wSum += w; score += w * (profile.weights[key][tag] ?? 1.0);
  }
  add(0.25, 'occupation',  person.occupation);
  add(0.25, 'subdomain',   person.subdomain);
  add(0.20, 'country',     person.country_tag);
  add(0.10, 'domain',      person.domain);
  add(0.10, 'macroRegion', person.macro_region);
  add(0.10, 'era',         person.era_bucket);
  return wSum === 0 ? 1.0 : score / wSum;
}

function getThematicConfidence(person, profile) {
  let best = 0;
  if (isValidTag(person.occupation)) {
    const w = profile.weights.occupation[person.occupation] ?? 1.0;
    if (w > best) best = w;
  }
  if (isValidTag(person.subdomain)) {
    const w = profile.weights.subdomain[person.subdomain] ?? 1.0;
    if (w > best) best = w;
  }
  if (isValidTag(person.domain)) {
    const w = profile.weights.domain[person.domain] ?? 1.0;
    if (w > best) best = w;
  }
  return best;
}

// ── pickNextAdaptiveCard (mirrors play-sampler.ts) ────────────────────────────

function isSoftSensitiveCard(p) {
  return p.content_sensitivity === 'crime_sensitive' || p.content_sensitivity === 'scandal_sensitive';
}

function runLengthAtEnd(cards, getTag) {
  if (cards.length === 0) return null;
  const tag = getTag(cards[cards.length - 1]);
  if (!tag || tag === 'unknown') return null;
  let length = 0;
  for (let i = cards.length - 1; i >= 0; i--) {
    if (getTag(cards[i]) === tag) length++; else break;
  }
  return { tag, length };
}

function buildEligiblePool(candidates, usedIds, counts,
  blockedCountry, blockedSubdomain, blockedDomain, relaxStreak, relaxCaps, profile, relaxMedium) {
  return candidates.filter(p => {
    if (usedIds.has(p.wikidata_id)) return false;
    if (p.content_sensitivity === 'adult_excluded') return false;
    if (isSoftSensitiveCard(p) && counts.softSensitiveCount >= ADAPTIVE_SOFT_MAX) return false;
    const d = (p.domain && p.domain !== 'unknown') ? p.domain : 'unknown';
    const sub = p.subdomain ?? null;
    const ct  = effectiveCountryKey(p);
    if (!relaxCaps.domain    && (counts.domainCount[d]             ?? 0) >= ADAPTIVE_DOMAIN_MAX)    return false;
    if (!relaxCaps.subdomain && sub && (counts.subdomainCount[sub] ?? 0) >= ADAPTIVE_SUBDOMAIN_MAX) return false;
    const countryMax = ct === '_unknown_country' ? UNKNOWN_COUNTRY_MAX : ADAPTIVE_COUNTRY_MAX;
    if (!relaxCaps.country && (counts.countryCount[ct] ?? 0) >= countryMax) return false;
    if (!relaxStreak.country   && blockedCountry   && ct  === blockedCountry)   return false;
    if (!relaxStreak.subdomain && blockedSubdomain && sub === blockedSubdomain) return false;
    if (!relaxStreak.domain    && blockedDomain    && d   === blockedDomain)    return false;
    if (p.difficulty_bucket === 'hard' && !p.isRegionalSeed &&
        getThematicConfidence(p, profile) < HARD_UNLOCK_THRESHOLD) return false;
    if (!relaxMedium && p.difficulty_bucket === 'medium' &&
        getThematicConfidence(p, profile) < MEDIUM_UNLOCK_THRESHOLD) return false;
    return true;
  });
}

function weightedRandomPick(scored, rng) {
  let total = 0;
  for (const s of scored) total += Math.max(s.score, 0.001);
  let r = rng() * total;
  for (const s of scored) {
    r -= Math.max(s.score, 0.001);
    if (r <= 0) return s.person;
  }
  return scored[scored.length - 1].person;
}

function pickNextAdaptiveCard({ candidates, profile, usedIds, counts, recentCards, rng, mode }) {
  const ctRun  = runLengthAtEnd(recentCards, p => effectiveCountryKey(p));
  const subRun = runLengthAtEnd(recentCards, p => p.subdomain   ?? null);
  const domRun = runLengthAtEnd(recentCards, p => (p.domain && p.domain !== 'unknown') ? p.domain : null);
  const blockedCountry   = ctRun  && ctRun.length  >= ANTISTREAK_COUNTRY_MAX   ? ctRun.tag  : null;
  const blockedSubdomain = subRun && subRun.length >= ANTISTREAK_SUBDOMAIN_MAX ? subRun.tag : null;
  const blockedDomain    = domRun && domRun.length >= ANTISTREAK_DOMAIN_MAX    ? domRun.tag : null;

  const relaxLevels = [
    { relaxStreak: {},                                                   relaxCaps: {},                                               relaxMedium: false },
    { relaxStreak: { country: true },                                    relaxCaps: {},                                               relaxMedium: false },
    { relaxStreak: { country: true, subdomain: true },                   relaxCaps: {},                                               relaxMedium: false },
    { relaxStreak: { country: true, subdomain: true, domain: true },     relaxCaps: {},                                               relaxMedium: false },
    { relaxStreak: { country: true, subdomain: true, domain: true },     relaxCaps: {},                                               relaxMedium: true  },
    { relaxStreak: { country: true, subdomain: true, domain: true },     relaxCaps: { country: true },                                relaxMedium: true  },
    { relaxStreak: { country: true, subdomain: true, domain: true },     relaxCaps: { country: true, subdomain: true },               relaxMedium: true  },
    { relaxStreak: { country: true, subdomain: true, domain: true },     relaxCaps: { country: true, subdomain: true, domain: true }, relaxMedium: true  },
  ];
  for (const { relaxStreak, relaxCaps, relaxMedium } of relaxLevels) {
    const eligible = buildEligiblePool(candidates, usedIds, counts,
      blockedCountry, blockedSubdomain, blockedDomain, relaxStreak, relaxCaps, profile, relaxMedium);
    if (eligible.length === 0) continue;
    if (mode === 'explore') return eligible[Math.floor(rng() * eligible.length)];
    const scored = eligible
      .map(p => ({ person: p, score: getCardFitScore(p, profile) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);
    return weightedRandomPick(scored, rng);
  }
  return null;
}

// ── buildAdaptiveCandidates (mirrors play-sampler.ts) ─────────────────────────

function buildAdaptiveCandidates(poolsArg, region, usedIds) {
  const safe = {
    top_30000: poolsArg.top_30000.filter(p => !isSensitive(p)),
    ru_quota:  poolsArg.ru_quota.filter(p  => !isSensitive(p)),
    kz_quota:  poolsArg.kz_quota.filter(p  => !isSensitive(p)),
    hpi_quota: poolsArg.hpi_quota.filter(p => !isSensitive(p)),
    kz_ca_top: (poolsArg.kz_ca_top ?? []).filter(p => !isSensitive(p)),
  };
  const srcOrder = region === 'kz'
    ? [safe.kz_ca_top, safe.top_30000, safe.ru_quota, safe.kz_quota, safe.hpi_quota]
    : [safe.top_30000, safe.ru_quota, safe.kz_quota, safe.hpi_quota];

  const seenQids = new Set();
  const candidates = [];
  for (const src of srcOrder) {
    for (const p of src) {
      if (!seenQids.has(p.wikidata_id) && !usedIds.has(p.wikidata_id)) {
        seenQids.add(p.wikidata_id);
        candidates.push(p);
      }
    }
  }
  return candidates;
}

// ── getInitialSessionCounts ───────────────────────────────────────────────────

function getInitialSessionCounts(deck) {
  const domainCount = {}, subdomainCount = {}, countryCount = {};
  let softSensitiveCount = 0;
  for (const p of deck) {
    const d = p.domain || 'unknown';
    domainCount[d] = (domainCount[d] ?? 0) + 1;
    if (p.subdomain) subdomainCount[p.subdomain] = (subdomainCount[p.subdomain] ?? 0) + 1;
    const ck = effectiveCountryKey(p);
    countryCount[ck] = (countryCount[ck] ?? 0) + 1;
    if (isSoftSensitiveCard(p)) softSensitiveCount++;
  }
  return { softSensitiveCount, domainCount, subdomainCount, countryCount };
}

// ── Session simulator ─────────────────────────────────────────────────────────

function simulateSession(region, answerFn, rng) {
  const safe = {
    top_30000: pools.top_30000.filter(p => !isSensitive(p)),
    ru_quota:  pools.ru_quota.filter(p  => !isSensitive(p)),
    kz_quota:  pools.kz_quota.filter(p  => !isSensitive(p)),
    hpi_quota: pools.hpi_quota.filter(p => !isSensitive(p)),
    kz_ca_top: (pools.kz_ca_top ?? []).filter(p => !isSensitive(p)),
  };
  const kzCaIds = new Set(safe.kz_ca_top.map(p => p.wikidata_id));
  const usedIds = new Set();
  const calib = createCalibrationBlock(safe, kzCaIds, region ?? 'global', usedIds);

  let deck = calib;
  let profile = emptyProfile();

  for (let i = 0; i < SESSION_CARD_COUNT; i++) {
    const person = deck[i];
    const answer = answerFn(person, i, profile);
    profile = updateProfile(profile, person, answer);

    const nextIndex = i + 1;
    if (nextIndex >= CALIB_SIZE && deck.length < SESSION_CARD_COUNT) {
      const candidates = buildAdaptiveCandidates(pools, region, new Set(deck.map(p => p.wikidata_id)));
      const counts = getInitialSessionCounts(deck);
      const recentCards = deck.slice(-10);
      const exploreRatio = nextIndex < 50 ? EXPLORATION_RATIO_EARLY : EXPLORATION_RATIO_LATE;
      const mode = rng() < exploreRatio ? 'explore' : 'exploit';
      const nextCard = pickNextAdaptiveCard({ candidates, profile, usedIds: new Set(deck.map(p => p.wikidata_id)), counts, recentCards, rng, mode });
      if (nextCard) {
        deck = [...deck, nextCard];
        usedIds.add(nextCard.wikidata_id);
      }
    }
  }
  return { deck, profile };
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function check(label, condition, detail = '') {
  if (condition) { console.log(`  PASS  ${label}`); passed++; }
  else           { console.log(`  FAIL  ${label}${detail ? '  →  ' + detail : ''}`); failed++; }
}

// ── Suite: basic invariants over SUITE_RUNS sessions ─────────────────────────
console.log(`\n── Suite: invariants over ${SUITE_RUNS} sessions (global) ──`);
{
  let allPassed100 = true, allUnique = true, noAdult = true;
  let softExceeded = 0, streakCtViolations = 0, streakSubViolations = 0, streakDomViolations = 0;

  for (let run = 0; run < SUITE_RUNS; run++) {
    const rng = () => Math.random();
    const { deck } = simulateSession(undefined, (p) => 'heard', rng);

    if (deck.length !== SESSION_CARD_COUNT) { allPassed100 = false; }

    const qids = new Set(deck.map(p => p.wikidata_id));
    if (qids.size !== deck.length) allUnique = false;

    if (deck.some(p => p.content_sensitivity === 'adult_excluded')) noAdult = false;

    const softCount = deck.filter(p => isSoftSensitiveCard(p)).length;
    if (softCount > ADAPTIVE_SOFT_MAX) softExceeded++;

    // Check anti-streak in adaptive phase (cards 31–100, indices 30–99)
    const adaptiveDeck = deck.slice(CALIB_SIZE);
    for (let i = ANTISTREAK_COUNTRY_MAX; i < adaptiveDeck.length; i++) {
      const run3 = adaptiveDeck.slice(i - ANTISTREAK_COUNTRY_MAX, i + 1);
      const tags = run3.map(p => effectiveCountryKey(p));
      if (new Set(tags).size === 1) streakCtViolations++;
    }
    for (let i = ANTISTREAK_SUBDOMAIN_MAX; i < adaptiveDeck.length; i++) {
      const run3 = adaptiveDeck.slice(i - ANTISTREAK_SUBDOMAIN_MAX, i + 1);
      const tags = run3.map(p => p.subdomain).filter(Boolean);
      if (tags.length === ANTISTREAK_SUBDOMAIN_MAX + 1 && new Set(tags).size === 1) streakSubViolations++;
    }
    for (let i = ANTISTREAK_DOMAIN_MAX; i < adaptiveDeck.length; i++) {
      const run4 = adaptiveDeck.slice(i - ANTISTREAK_DOMAIN_MAX, i + 1);
      const tags = run4.map(p => p.domain !== 'unknown' ? p.domain : null).filter(Boolean);
      if (tags.length === ANTISTREAK_DOMAIN_MAX + 1 && new Set(tags).size === 1) streakDomViolations++;
    }
  }

  check('all sessions produce exactly 100 cards', allPassed100);
  check('all QIDs unique within session', allUnique);
  check('no adult_excluded cards in any session', noAdult);
  check(`soft-sensitive count ≤ ${ADAPTIVE_SOFT_MAX} in all sessions`, softExceeded === 0,
    `${softExceeded}/${SUITE_RUNS} exceeded`);
  check('no country streak > 2 in adaptive phase (all runs)', streakCtViolations === 0,
    `${streakCtViolations} violations`);
  check('no subdomain streak > 2 in adaptive phase (all runs)', streakSubViolations === 0,
    `${streakSubViolations} violations`);
  check('no domain streak > 3 in adaptive phase (all runs)', streakDomViolations === 0,
    `${streakDomViolations} violations`);
}

// ── Suite: kz region invariants ───────────────────────────────────────────────
console.log('\n── Suite: invariants over 30 sessions (kz) ──');
{
  let allPassed100 = true, allUnique = true, noAdult = true;
  for (let run = 0; run < 30; run++) {
    const { deck } = simulateSession('kz', (p) => 'heard', () => Math.random());
    if (deck.length !== SESSION_CARD_COUNT) allPassed100 = false;
    if (new Set(deck.map(p => p.wikidata_id)).size !== deck.length) allUnique = false;
    if (deck.some(p => p.content_sensitivity === 'adult_excluded')) noAdult = false;
  }
  check('kz sessions produce exactly 100 cards', allPassed100);
  check('kz QIDs unique within session', allUnique);
  check('no adult_excluded cards in kz sessions', noAdult);
}

// ── F: India/religion regression ─────────────────────────────────────────────
console.log('\n── F: India/religion regression ──');
{
  // Simulate profile after answering don't_know to 8 India/religion figures
  const indiaReligion = pools.top_30000.filter(
    p => p.country_tag === 'India' && p.domain === 'religion' && !isSensitive(p),
  ).slice(0, 8);

  let profile = emptyProfile();
  for (const p of indiaReligion) profile = updateProfile(profile, p, 'dont_know');

  // Build a calibration block with ~3 India/religion cards to simulate real state
  const safe = {
    top_30000: pools.top_30000.filter(p => !isSensitive(p)),
    ru_quota:  pools.ru_quota.filter(p  => !isSensitive(p)),
    kz_quota:  pools.kz_quota.filter(p  => !isSensitive(p)),
    hpi_quota: pools.hpi_quota.filter(p => !isSensitive(p)),
    kz_ca_top: (pools.kz_ca_top ?? []).filter(p => !isSensitive(p)),
  };
  const usedIds = new Set([...indiaReligion.map(p => p.wikidata_id)]);
  const candidates = buildAdaptiveCandidates(pools, undefined, usedIds);
  const counts = getInitialSessionCounts([...indiaReligion]);

  // Pick 20 cards — count how many are India/religion
  let indiaReligionCount = 0;
  const recentCards = [...indiaReligion];
  const localUsedIds = new Set(usedIds);
  let localCounts = { ...counts };
  for (let i = 0; i < 20; i++) {
    const p = pickNextAdaptiveCard({
      candidates,
      profile,
      usedIds: localUsedIds,
      counts: localCounts,
      recentCards: recentCards.slice(-10),
      rng: Math.random,
      mode: 'exploit',
    });
    if (!p) break;
    if (p.country_tag === 'India' && p.domain === 'religion') indiaReligionCount++;
    localUsedIds.add(p.wikidata_id);
    localCounts = {
      ...localCounts,
      domainCount:    { ...localCounts.domainCount,    [p.domain || 'unknown']: (localCounts.domainCount[p.domain || 'unknown'] ?? 0) + 1 },
      subdomainCount: { ...localCounts.subdomainCount, ...(p.subdomain ? { [p.subdomain]: (localCounts.subdomainCount[p.subdomain] ?? 0) + 1 } : {}) },
      countryCount:   { ...localCounts.countryCount,   [effectiveCountryKey(p)]: (localCounts.countryCount[effectiveCountryKey(p)] ?? 0) + 1 },
    };
    recentCards.push(p);
  }
  check('India/religion dont_know: ≤4/20 next picks are India/religion', indiaReligionCount <= 4,
    `got ${indiaReligionCount}`);
}

// ── G: Football-heavy profile ─────────────────────────────────────────────────
console.log('\n── G: Football-heavy profile ──');
{
  const footballers = pools.top_30000.filter(
    p => p.subdomain === 'football' && !isSensitive(p),
  ).slice(0, 12);

  let profile = emptyProfile();
  for (const p of footballers) profile = updateProfile(profile, p, 'know');

  const usedIds = new Set(footballers.map(p => p.wikidata_id));
  const candidates = buildAdaptiveCandidates(pools, undefined, usedIds);
  const counts = getInitialSessionCounts([...footballers]);

  let sportsCount = 0;
  const localUsedIds = new Set(usedIds);
  let localCounts = { ...counts };
  let recentCards = [...footballers];
  for (let i = 0; i < 20; i++) {
    const p = pickNextAdaptiveCard({
      candidates,
      profile,
      usedIds: localUsedIds,
      counts: localCounts,
      recentCards: recentCards.slice(-10),
      rng: Math.random,
      mode: 'exploit',
    });
    if (!p) break;
    if (p.domain === 'sports') sportsCount++;
    localUsedIds.add(p.wikidata_id);
    localCounts = {
      ...localCounts,
      domainCount:    { ...localCounts.domainCount,    [p.domain || 'unknown']: (localCounts.domainCount[p.domain || 'unknown'] ?? 0) + 1 },
      subdomainCount: { ...localCounts.subdomainCount, ...(p.subdomain ? { [p.subdomain]: (localCounts.subdomainCount[p.subdomain] ?? 0) + 1 } : {}) },
      countryCount:   { ...localCounts.countryCount,   [effectiveCountryKey(p)]: (localCounts.countryCount[effectiveCountryKey(p)] ?? 0) + 1 },
    };
    recentCards.push(p);
  }
  check('football know: ≥10/20 next picks are sports', sportsCount >= 10,
    `got ${sportsCount}`);
}

// ── H: Adaptive cards skip calibration cards ─────────────────────────────────
console.log('\n── H: Adaptive cards skip calibration cards ──');
{
  const rng = () => Math.random();
  let noOverlap = true;
  for (let run = 0; run < 20; run++) {
    const { deck } = simulateSession(undefined, () => 'heard', rng);
    const calibIds = new Set(deck.slice(0, CALIB_SIZE).map(p => p.wikidata_id));
    const adaptiveIds = deck.slice(CALIB_SIZE).map(p => p.wikidata_id);
    if (adaptiveIds.some(id => calibIds.has(id))) noOverlap = false;
  }
  check('adaptive cards never duplicate calibration cards', noOverlap);
}

// ── I: Null-country stress test ───────────────────────────────────────────────
console.log('\n── I: Null-country cap (UNKNOWN_COUNTRY_MAX=8) ──');
{
  // Run 20 sessions with neutral profile; count null-country cards in adaptive phase.
  // Each session must have ≤ UNKNOWN_COUNTRY_MAX null-country cards in adaptive tail.
  let capViolations = 0;
  let maxConsecutiveNullViolations = 0;

  for (let run = 0; run < 20; run++) {
    const { deck } = simulateSession(undefined, () => 'heard', () => Math.random());
    const adaptiveDeck = deck.slice(CALIB_SIZE);

    // Count total null-country cards in adaptive phase
    const nullCount = adaptiveDeck.filter(p => !p.country_tag || p.country_tag === 'unknown').length;
    if (nullCount > UNKNOWN_COUNTRY_MAX) capViolations++;

    // Check no consecutive null-country streak > 2
    for (let i = ANTISTREAK_COUNTRY_MAX; i < adaptiveDeck.length; i++) {
      const run3 = adaptiveDeck.slice(i - ANTISTREAK_COUNTRY_MAX, i + 1);
      const tags = run3.map(p => effectiveCountryKey(p));
      if (new Set(tags).size === 1 && tags[0] === '_unknown_country') maxConsecutiveNullViolations++;
    }
  }

  check(`I1: null-country adaptive cards ≤ ${UNKNOWN_COUNTRY_MAX} per session (20 runs)`,
    capViolations === 0, `${capViolations}/20 exceeded cap`);
  check('I2: no consecutive null-country streak > 2 (20 runs)',
    maxConsecutiveNullViolations === 0, `${maxConsecutiveNullViolations} violations`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
