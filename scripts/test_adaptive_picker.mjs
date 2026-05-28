/**
 * Deterministic tests for pickNextAdaptiveCard.
 * Run: node scripts/test_adaptive_picker.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const pools = JSON.parse(readFileSync(join(ROOT, 'public/data/play_pools.json'), 'utf-8'));

// ── Seeded RNG (LCG) ──────────────────────────────────────────────────────────

function makeLCG(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223 >>> 0;
    return s / 4294967296;
  };
}

// ── Inlined constants (mirrors play-sampler.ts) ───────────────────────────────

const ADAPTIVE_DOMAIN_MAX     = 30;
const ADAPTIVE_SUBDOMAIN_MAX  = 20;
const ADAPTIVE_COUNTRY_MAX    = 20;
const UNKNOWN_COUNTRY_MAX     = 8;
const ADAPTIVE_SOFT_MAX       = 2;
const TOP_K                   = 200;
const ANTISTREAK_COUNTRY_MAX  = 2;
const ANTISTREAK_SUBDOMAIN_MAX = 2;
const ANTISTREAK_DOMAIN_MAX   = 3;

// ── Inlined getCardFitScore (mirrors adaptive-profile.ts) ─────────────────────

function isValidTag(v) { return !!v && v !== 'unknown'; }

function getCardFitScore(person, profile) {
  let wSum = 0, score = 0;
  function add(w, key, tag) {
    if (!isValidTag(tag)) return;
    wSum += w;
    score += w * (profile.weights[key][tag] ?? 1.0);
  }
  add(0.25, 'occupation',  person.occupation);
  add(0.25, 'subdomain',   person.subdomain);
  add(0.20, 'country',     person.country_tag);
  add(0.10, 'domain',      person.domain);
  add(0.10, 'macroRegion', person.macro_region);
  add(0.10, 'era',         person.era_bucket);
  return wSum === 0 ? 1.0 : score / wSum;
}

// ── Inlined updateAdaptiveProfile (simplified, for weight simulation) ─────────

const ERA_ORDER = [
  'ancient_bc','classical_late_antiquity','medieval','early_modern',
  'industrial_modern','postwar_births','late_20c_births','modern_media_births','digital_births',
];
const MIN_WEIGHT = 0.1, MAX_WEIGHT = 3.0;
const HARD_UNLOCK_THRESHOLD = 2.0;
const clamp = v => Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, v));

function soften(base, strength) { return 1 + (base - 1) * strength; }

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
  const base   = person.isRegionalSeed
    ? getRegionalSeedMult(person.difficulty_bucket, answer)
    : getDiffMult(person.difficulty_bucket, answer);
  const s05    = soften(base, 0.5);
  const s04    = soften(base, 0.4);
  const s02    = soften(base, 0.2);
  apply('occupation',  person.occupation,  base);
  apply('subdomain',   person.subdomain,   base);
  apply('country',     person.country_tag, base);
  apply('domain',      person.domain,      s05);
  apply('macroRegion', person.macro_region,s05);
  apply('era',         person.era_bucket,  s04);
  const idx = ERA_ORDER.indexOf(person.era_bucket);
  if (idx > 0)                    apply('era', ERA_ORDER[idx - 1], s02);
  if (idx >= 0 && idx < ERA_ORDER.length - 1) apply('era', ERA_ORDER[idx + 1], s02);
  return { ...profile, weights: w };
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

function emptyProfile() {
  return {
    version: 1,
    weights: { domain:{}, occupation:{}, subdomain:{}, country:{}, macroRegion:{}, era:{} },
    stats: { totalAnswers:0, knowCount:0, heardCount:0, dontKnowCount:0, scoreSum:0 },
    answers: [],
  };
}

function effectiveCountryKey(p) {
  const ct = p.country_tag;
  if (!ct || ct === 'unknown') return '_unknown_country';
  return ct;
}

// ── Inlined pickNextAdaptiveCard ──────────────────────────────────────────────

function runLengthAtEnd(cards, getTag) {
  if (cards.length === 0) return null;
  const tag = getTag(cards[cards.length - 1]);
  if (!tag || tag === 'unknown') return null;
  let length = 0;
  for (let i = cards.length - 1; i >= 0; i--) {
    if (getTag(cards[i]) === tag) length++;
    else break;
  }
  return { tag, length };
}

function isSoftSensitiveCard(p) {
  return p.content_sensitivity === 'crime_sensitive' ||
         p.content_sensitivity === 'scandal_sensitive';
}

function buildEligiblePool(candidates, usedIds, counts,
  blockedCountry, blockedSubdomain, blockedDomain,
  relaxStreak, relaxCaps, profile) {
  return candidates.filter(p => {
    if (usedIds.has(p.wikidata_id))                                        return false;
    if (p.content_sensitivity === 'adult_excluded')                        return false;
    if (isSoftSensitiveCard(p) && counts.softSensitiveCount >= ADAPTIVE_SOFT_MAX) return false;

    const d   = (p.domain && p.domain !== 'unknown') ? p.domain : 'unknown';
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
    { relaxStreak: {},                                                   relaxCaps: {} },
    { relaxStreak: { country: true },                                    relaxCaps: {} },
    { relaxStreak: { country: true, subdomain: true },                   relaxCaps: {} },
    { relaxStreak: { country: true, subdomain: true, domain: true },     relaxCaps: {} },
    { relaxStreak: { country: true, subdomain: true, domain: true }, relaxCaps: { country: true } },
    { relaxStreak: { country: true, subdomain: true, domain: true }, relaxCaps: { country: true, subdomain: true } },
    { relaxStreak: { country: true, subdomain: true, domain: true }, relaxCaps: { country: true, subdomain: true, domain: true } },
  ];

  for (const { relaxStreak, relaxCaps } of relaxLevels) {
    const eligible = buildEligiblePool(
      candidates, usedIds, counts, blockedCountry, blockedSubdomain, blockedDomain,
      relaxStreak, relaxCaps, profile,
    );
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

// ── Synthetic person factory ──────────────────────────────────────────────────

let _uid = 0;
function makePerson(overrides) {
  return {
    wikidata_id:         `Q${++_uid}`,
    name:                `Person ${_uid}`,
    occupation:          'UNKNOWN',
    domain:              'unknown',
    subdomain:           null,
    country_tag:         null,
    macro_region:        'unknown',
    era_bucket:          'unknown',
    difficulty_bucket:   'medium',
    content_sensitivity: 'normal',
    global_rank:         _uid,
    ...overrides,
  };
}

function emptyCounts() {
  return { softSensitiveCount: 0, domainCount: {}, subdomainCount: {}, countryCount: {} };
}

function consumeCounts(counts, p) {
  const c = {
    softSensitiveCount: counts.softSensitiveCount + (isSoftSensitiveCard(p) ? 1 : 0),
    domainCount:    { ...counts.domainCount },
    subdomainCount: { ...counts.subdomainCount },
    countryCount:   { ...counts.countryCount },
  };
  const d = (p.domain && p.domain !== 'unknown') ? p.domain : 'unknown';
  c.domainCount[d] = (c.domainCount[d] ?? 0) + 1;
  if (p.subdomain) c.subdomainCount[p.subdomain] = (c.subdomainCount[p.subdomain] ?? 0) + 1;
  const ck = effectiveCountryKey(p);
  c.countryCount[ck] = (c.countryCount[ck] ?? 0) + 1;
  return c;
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function check(label, condition, detail = '') {
  if (condition) { console.log(`  PASS  ${label}`); passed++; }
  else           { console.log(`  FAIL  ${label}${detail ? '  →  ' + detail : ''}`); failed++; }
}

// ── A: No greedy block ────────────────────────────────────────────────────────
console.log('\n── A: Anti-streak — no greedy block ──');
{
  // 30 India/philosophy candidates + 20 Brazil/football to allow fallback
  const indiaCards = Array.from({ length: 30 }, () =>
    makePerson({ country_tag: 'India', subdomain: 'philosophy', domain: 'religion' }),
  );
  const otherCards = Array.from({ length: 20 }, () =>
    makePerson({ country_tag: 'Brazil', subdomain: 'football', domain: 'sports' }),
  );
  const candidates = [...indiaCards, ...otherCards];

  // Profile heavily biased toward India
  const profile = emptyProfile();
  profile.weights.country['India'] = 4.0;
  profile.weights.subdomain['philosophy'] = 3.0;
  profile.weights.domain['religion'] = 2.0;

  const rng = makeLCG(42);
  const usedIds = new Set();
  let counts = emptyCounts();
  let recentCards = [];
  const picked = [];

  for (let i = 0; i < 25; i++) {
    const p = pickNextAdaptiveCard({ candidates, profile, usedIds, counts, recentCards, rng, mode: 'exploit' });
    if (!p) break;
    usedIds.add(p.wikidata_id);
    counts = consumeCounts(counts, p);
    recentCards = [...recentCards, p].slice(-10);
    picked.push(p);
  }

  // Check streaks
  let maxCountryRun = 0, maxSubRun = 0, maxDomainRun = 0;
  for (let i = 0; i < picked.length; i++) {
    let cRun = 1, sRun = 1, dRun = 1;
    for (let j = i - 1; j >= 0; j--) {
      if (picked[j].country_tag === picked[i].country_tag && picked[i].country_tag) cRun++;
      else break;
    }
    for (let j = i - 1; j >= 0; j--) {
      if (picked[j].subdomain === picked[i].subdomain && picked[i].subdomain) sRun++;
      else break;
    }
    for (let j = i - 1; j >= 0; j--) {
      if (picked[j].domain === picked[i].domain && picked[i].domain !== 'unknown') dRun++;
      else break;
    }
    if (cRun > maxCountryRun)  maxCountryRun  = cRun;
    if (sRun > maxSubRun)      maxSubRun      = sRun;
    if (dRun > maxDomainRun)   maxDomainRun   = dRun;
  }

  check(`A1: country streak ≤ 2 (max=${maxCountryRun})`,  maxCountryRun  <= ANTISTREAK_COUNTRY_MAX,   `max=${maxCountryRun}`);
  check(`A2: subdomain streak ≤ 2 (max=${maxSubRun})`,    maxSubRun      <= ANTISTREAK_SUBDOMAIN_MAX, `max=${maxSubRun}`);
  check(`A3: domain streak ≤ 3 (max=${maxDomainRun})`,    maxDomainRun   <= ANTISTREAK_DOMAIN_MAX,    `max=${maxDomainRun}`);
  check(`A4: picked 25 cards`,                            picked.length  === 25);

  // Verify India still dominates (caps haven't killed it) but streak is broken
  const indiaCount = picked.filter(p => p.country_tag === 'India').length;
  check(`A5: India appears (weighted, not killed by caps) India=${indiaCount}/25`, indiaCount > 10, `India=${indiaCount}`);
}

// ── B: Football-heavy profile on real candidates ──────────────────────────────
console.log('\n── B: Football-heavy profile (real top_30000) ──');
{
  const candidates = pools.top_30000.filter(p => p.content_sensitivity !== 'adult_excluded');
  const profileFootball = emptyProfile();
  profileFootball.weights.subdomain['football'] = 5.0;
  profileFootball.weights.occupation['SOCCER PLAYER'] = 5.0;
  profileFootball.weights.domain['sports'] = 3.0;

  const profileNeutral = emptyProfile();

  function pickN(profile, n, seed) {
    const rng = makeLCG(seed);
    const usedIds = new Set();
    let counts = emptyCounts();
    let recentCards = [];
    const result = [];
    for (let i = 0; i < n; i++) {
      const p = pickNextAdaptiveCard({ candidates, profile, usedIds, counts, recentCards, rng, mode: 'exploit' });
      if (!p) break;
      usedIds.add(p.wikidata_id);
      counts = consumeCounts(counts, p);
      recentCards = [...recentCards, p].slice(-10);
      result.push(p);
    }
    return result;
  }

  const footballPicked  = pickN(profileFootball, 30, 7);
  const neutralPicked   = pickN(profileNeutral,  30, 7);

  const fbFootball = footballPicked.filter(p => p.domain === 'sports').length;
  const fbNeutral  = neutralPicked.filter(p => p.domain === 'sports').length;
  check(`B1: football profile → more sports than neutral (${fbFootball} vs ${fbNeutral})`, fbFootball > fbNeutral, `${fbFootball} vs ${fbNeutral}`);

  // Verify streak caps on football picks
  let maxC = 0, maxS = 0, maxD = 0;
  for (let i = 0; i < footballPicked.length; i++) {
    let c = 1, s = 1, d = 1;
    for (let j = i-1; j>=0; j--) { if (footballPicked[j].country_tag === footballPicked[i].country_tag && footballPicked[i].country_tag) c++; else break; }
    for (let j = i-1; j>=0; j--) { if (footballPicked[j].subdomain   === footballPicked[i].subdomain   && footballPicked[i].subdomain)   s++; else break; }
    for (let j = i-1; j>=0; j--) { if (footballPicked[j].domain      === footballPicked[i].domain      && footballPicked[i].domain !== 'unknown') d++; else break; }
    if (c > maxC) maxC = c; if (s > maxS) maxS = s; if (d > maxD) maxD = d;
  }
  check(`B2: football picks country streak ≤ 2 (max=${maxC})`, maxC <= ANTISTREAK_COUNTRY_MAX);
  check(`B3: football picks subdomain streak ≤ 2 (max=${maxS})`, maxS <= ANTISTREAK_SUBDOMAIN_MAX);
  check(`B4: football picks domain streak ≤ 3 (max=${maxD})`, maxD <= ANTISTREAK_DOMAIN_MAX);
  check(`B5: picked 30 cards`, footballPicked.length === 30);
}

// ── C: India/religion scenario ────────────────────────────────────────────────
console.log('\n── C: India/religion — dont_know reduces frequency ──');
{
  const candidates = pools.top_30000.filter(p =>
    p.content_sensitivity !== 'adult_excluded',
  );

  // Simulate know-Buddha profile
  const buddhaCard = {
    wikidata_id: 'Q_buddha', name: 'Buddha',
    occupation: 'RELIGIOUS FIGURE', domain: 'religion', subdomain: 'buddhism',
    country_tag: 'India', macro_region: 'south_asia', era_bucket: 'ancient_bc',
    difficulty_bucket: 'hard', content_sensitivity: 'normal',
  };

  let profile = emptyProfile();
  profile = updateProfile(profile, buddhaCard, 'know');

  // Pick 10 cards with elevated India profile
  const rng = makeLCG(99);
  const usedIds = new Set();
  let counts = emptyCounts();
  let recentCards = [];
  const pickedBefore = [];

  for (let i = 0; i < 10; i++) {
    const p = pickNextAdaptiveCard({ candidates, profile, usedIds, counts, recentCards, rng, mode: 'exploit' });
    if (!p) break;
    usedIds.add(p.wikidata_id);
    counts = consumeCounts(counts, p);
    recentCards = [...recentCards, p].slice(-10);
    pickedBefore.push(p);
  }

  // Check no streak violation even with elevated India profile
  let maxCountryRun = 0;
  for (let i = 0; i < pickedBefore.length; i++) {
    let run = 1;
    for (let j = i-1; j>=0; j--) { if (pickedBefore[j].country_tag === pickedBefore[i].country_tag && pickedBefore[i].country_tag) run++; else break; }
    if (run > maxCountryRun) maxCountryRun = run;
  }
  check(`C1: after know-Buddha, country streak ≤ 2 (max=${maxCountryRun})`, maxCountryRun <= ANTISTREAK_COUNTRY_MAX);

  const indiaBefore = pickedBefore.filter(p => p.country_tag === 'India').length;

  // Now apply 4 dont_know on India/religion/hard cards, then pick 10 more
  const indiaPhil = {
    wikidata_id: 'Q_phil', name: 'Indian Philosopher',
    occupation: 'PHILOSOPHER', domain: 'religion', subdomain: 'philosophy',
    country_tag: 'India', macro_region: 'south_asia', era_bucket: 'ancient_bc',
    difficulty_bucket: 'hard', content_sensitivity: 'normal',
  };
  for (let i = 0; i < 4; i++) {
    profile = updateProfile(profile, indiaPhil, 'dont_know');
  }

  const pickedAfter = [];
  recentCards = []; // reset streak state
  for (let i = 0; i < 10; i++) {
    const p = pickNextAdaptiveCard({ candidates, profile, usedIds, counts, recentCards, rng, mode: 'exploit' });
    if (!p) break;
    usedIds.add(p.wikidata_id);
    counts = consumeCounts(counts, p);
    recentCards = [...recentCards, p].slice(-10);
    pickedAfter.push(p);
  }

  const indiaAfter = pickedAfter.filter(p => p.country_tag === 'India').length;

  // After 4 dont_knows, India score drops below 1.0 — count should be ≤ before or at least not 10/10
  check(`C2: after 4 dont_know, India count didn't increase (before=${indiaBefore}, after=${indiaAfter})`,
    indiaAfter <= indiaBefore + 1,  // allow +1 for randomness
    `before=${indiaBefore} after=${indiaAfter}`,
  );
  check(`C3: no 10/10 India streak after dont_know (${indiaAfter}/10)`, indiaAfter < 10, `${indiaAfter}/10`);
}

// ── D: Session caps ───────────────────────────────────────────────────────────
console.log('\n── D: Session caps ──');
{
  const indiaCards = Array.from({ length: 5 }, () =>
    makePerson({ country_tag: 'India', domain: 'religion', subdomain: 'philosophy' }),
  );
  const otherCards = Array.from({ length: 5 }, () =>
    makePerson({ country_tag: 'Brazil', domain: 'sports', subdomain: 'football' }),
  );
  const candidates = [...indiaCards, ...otherCards];
  const profile = emptyProfile();
  const rng = makeLCG(1);

  // D1: country cap hit for India
  const countsIndiaFull = { ...emptyCounts(), countryCount: { India: ADAPTIVE_COUNTRY_MAX } };
  const usedIds1 = new Set();
  const p1 = pickNextAdaptiveCard({ candidates, profile, usedIds: usedIds1, counts: countsIndiaFull,
    recentCards: [], rng: makeLCG(1), mode: 'exploit' });
  check('D1: India cap=20 → pick Brazil not India', p1?.country_tag !== 'India', `got ${p1?.country_tag}`);

  // D2: subdomain cap
  const countsSubFull = { ...emptyCounts(), subdomainCount: { football: ADAPTIVE_SUBDOMAIN_MAX } };
  const p2 = pickNextAdaptiveCard({ candidates, profile, usedIds: new Set(), counts: countsSubFull,
    recentCards: [], rng: makeLCG(2), mode: 'exploit' });
  check('D2: football subdomain cap=20 → pick philosophy not football', p2?.subdomain !== 'football', `got ${p2?.subdomain}`);

  // D3: domain cap
  const countsDomFull = { ...emptyCounts(), domainCount: { religion: ADAPTIVE_DOMAIN_MAX } };
  const p3 = pickNextAdaptiveCard({ candidates, profile, usedIds: new Set(), counts: countsDomFull,
    recentCards: [], rng: makeLCG(3), mode: 'exploit' });
  check('D3: religion domain cap=30 → pick sports not religion', p3?.domain !== 'religion', `got ${p3?.domain}`);
}

// ── E: Sensitivity ────────────────────────────────────────────────────────────
console.log('\n── E: Sensitivity ──');
{
  const adultCard  = makePerson({ content_sensitivity: 'adult_excluded' });
  const crimeCard  = makePerson({ content_sensitivity: 'crime_sensitive' });
  const normalCard = makePerson({ content_sensitivity: 'normal' });
  const profile = emptyProfile();
  const rng = makeLCG(5);

  // E1: adult_excluded never returned (even as only candidate)
  const p1 = pickNextAdaptiveCard({ candidates: [adultCard], profile, usedIds: new Set(),
    counts: emptyCounts(), recentCards: [], rng, mode: 'exploit' });
  check('E1: adult_excluded returns null when only candidate', p1 === null);

  // E2: crime_sensitive blocked when softSensitiveCount >= 2
  const countsSoft2 = { ...emptyCounts(), softSensitiveCount: 2 };
  const p2 = pickNextAdaptiveCard({ candidates: [crimeCard, normalCard], profile, usedIds: new Set(),
    counts: countsSoft2, recentCards: [], rng: makeLCG(6), mode: 'exploit' });
  check('E2: crime_sensitive blocked when soft count ≥ 2 → pick normal', p2?.wikidata_id === normalCard.wikidata_id,
    `got ${p2?.content_sensitivity}`);

  // E3: crime_sensitive OK when softSensitiveCount < 2
  const countsSoft1 = { ...emptyCounts(), softSensitiveCount: 1 };
  let gotCrime = false;
  const rng3 = makeLCG(7);
  for (let i = 0; i < 20; i++) {
    const p = pickNextAdaptiveCard({ candidates: [crimeCard], profile, usedIds: new Set(),
      counts: countsSoft1, recentCards: [], rng: rng3, mode: 'exploit' });
    if (p?.content_sensitivity === 'crime_sensitive') gotCrime = true;
  }
  check('E3: crime_sensitive allowed when soft count < 2', gotCrime);
}

// ── F: Duplicates ─────────────────────────────────────────────────────────────
console.log('\n── F: usedIds respected ──');
{
  const cards = Array.from({ length: 3 }, () => makePerson({ country_tag: 'France', domain: 'arts' }));
  const profile = emptyProfile();
  const usedIds = new Set([cards[0].wikidata_id, cards[1].wikidata_id]);
  const p = pickNextAdaptiveCard({ candidates: cards, profile, usedIds, counts: emptyCounts(),
    recentCards: [], rng: makeLCG(8), mode: 'exploit' });
  check('F1: used cards excluded', p?.wikidata_id === cards[2].wikidata_id, `got ${p?.wikidata_id}`);

  const allUsed = new Set(cards.map(c => c.wikidata_id));
  const pNull = pickNextAdaptiveCard({ candidates: cards, profile, usedIds: allUsed, counts: emptyCounts(),
    recentCards: [], rng: makeLCG(9), mode: 'exploit' });
  check('F2: returns null when all used', pNull === null);
}

// ── G: Null/unknown tags ──────────────────────────────────────────────────────
console.log('\n── G: Null/unknown tags ──');
{
  const p1 = makePerson({ country_tag: null,      subdomain: null,   domain: 'unknown' });
  const p2 = makePerson({ country_tag: 'Germany', subdomain: null,   domain: 'sports' });
  const p3 = makePerson({ country_tag: null,      subdomain: 'jazz', domain: 'entertainment' });
  const candidates = [p1, p2, p3];
  const profile = emptyProfile();
  const rng = makeLCG(10);

  // Two null-country cards in recentCards → blockedCountry = '_unknown_country'.
  // p3 (null-country) is blocked by streak, p2 (Germany) is eligible.
  const recentNull = [p1, p1];
  const next = pickNextAdaptiveCard({ candidates, profile, usedIds: new Set([p1.wikidata_id]),
    counts: emptyCounts(), recentCards: recentNull, rng, mode: 'exploit' });
  check('G1: null-country streak blocks further null-country; non-null country still picked', next?.country_tag === 'Germany', `got ${next?.country_tag}`);
  check('G2: null-tag cards are valid candidates', next?.wikidata_id !== undefined);

  // Picking a card with null domain doesn't crash and returns a valid card
  const onlyNullDomain = [p1];
  const p = pickNextAdaptiveCard({ candidates: onlyNullDomain, profile, usedIds: new Set(),
    counts: emptyCounts(), recentCards: [], rng: makeLCG(11), mode: 'exploit' });
  check('G3: card with null/unknown tags does not crash picker', p !== null);

  // UNKNOWN_COUNTRY_MAX cap: if countryCount._unknown_country >= UNKNOWN_COUNTRY_MAX, p1/p3 blocked
  const nullCountryCapped = { ...emptyCounts(), countryCount: { '_unknown_country': UNKNOWN_COUNTRY_MAX } };
  const p4 = pickNextAdaptiveCard({ candidates: [p1, p2, p3], profile, usedIds: new Set(),
    counts: nullCountryCapped, recentCards: [], rng: makeLCG(12), mode: 'exploit' });
  check('G4: _unknown_country cap blocks null-country cards → Germany picked', p4?.country_tag === 'Germany', `got ${p4?.country_tag}`);
}

// ── H: Explore mode ───────────────────────────────────────────────────────────
console.log('\n── H: Explore mode — uniform random ──');
{
  // France=entertainment/cinema, Germany=science/physics — distinct domains
  // so domain anti-streak never forces a relax that bypasses country anti-streak
  const cards = Array.from({ length: 30 }, (_, i) =>
    makePerson({
      country_tag: i < 15 ? 'France'         : 'Germany',
      domain:      i < 15 ? 'entertainment'  : 'science',
      subdomain:   i < 15 ? 'cinema'         : 'physics',
    }),
  );
  const profile = emptyProfile();
  profile.weights.country['France'] = 5.0;

  const rng = makeLCG(20);
  const usedIds = new Set();
  let counts = emptyCounts();
  let recentCards = [];
  let maxCRun = 0;
  for (let i = 0; i < 20; i++) {
    const p = pickNextAdaptiveCard({ candidates: cards, profile, usedIds, counts, recentCards, rng, mode: 'explore' });
    if (!p) break;
    usedIds.add(p.wikidata_id);
    counts = consumeCounts(counts, p);
    recentCards = [...recentCards, p].slice(-10);
    let run = 1;
    for (let j = recentCards.length-2; j>=0; j--) { if (recentCards[j].country_tag === p.country_tag && p.country_tag) run++; else break; }
    if (run > maxCRun) maxCRun = run;
  }
  check(`H1: explore mode respects country streak ≤ 2 (max=${maxCRun})`, maxCRun <= ANTISTREAK_COUNTRY_MAX);
}

// ── I: Determinism with same seed ─────────────────────────────────────────────
console.log('\n── I: Determinism ──');
{
  const candidates = pools.top_30000.slice(0, 500).filter(p => p.content_sensitivity !== 'adult_excluded');
  const profile = emptyProfile();
  profile.weights.subdomain['football'] = 3.0;

  function runPick(seed) {
    const rng = makeLCG(seed);
    const p = pickNextAdaptiveCard({ candidates, profile, usedIds: new Set(), counts: emptyCounts(),
      recentCards: [], rng, mode: 'exploit' });
    return p?.wikidata_id;
  }

  const r1 = runPick(42);
  const r2 = runPick(42);
  const r3 = runPick(99); // different seed → likely different
  check('I1: same seed → same result', r1 === r2, `${r1} vs ${r2}`);
  check('I2: different seeds → different results (probabilistic)', r1 !== r3 || r3 === undefined,
    '(both null unlikely)');
}

// ── J: Regional seed soft multipliers ────────────────────────────────────────
console.log('\n── J: Regional seed soft multipliers ──');
{
  // Helper: one updateProfile call → return country weight for given tag
  function weightAfter(isRegionalSeed, difficulty, answer, countryTag = 'Kazakhstan') {
    let profile = emptyProfile();
    const card = makePerson({ country_tag: countryTag, difficulty_bucket: difficulty, isRegionalSeed });
    profile = updateProfile(profile, card, answer);
    return profile.weights.country[countryTag] ?? 1.0;
  }

  const eps = 0.001;

  // J1: regional seed hard know → 1.25, NOT normal hard 1.5
  const j1 = weightAfter(true, 'hard', 'know');
  check('J1: regional seed hard know → weight 1.25', Math.abs(j1 - 1.25) < eps, `got ${j1}`);

  // J2: regional seed easy dont_know → 0.60, NOT normal easy 0.5
  const j2 = weightAfter(true, 'easy', 'dont_know');
  check('J2: regional seed easy dont_know → weight 0.60', Math.abs(j2 - 0.60) < eps, `got ${j2}`);

  // J3: regional seed easy know → 1.05, NOT normal easy 1.1
  const j3 = weightAfter(true, 'easy', 'know');
  check('J3: regional seed easy know → weight 1.05', Math.abs(j3 - 1.05) < eps, `got ${j3}`);

  // J4: non-seed hard know → normal 1.5 unchanged
  const j4 = weightAfter(false, 'hard', 'know');
  check('J4: non-seed hard know → weight 1.5 (normal unchanged)', Math.abs(j4 - 1.5) < eps, `got ${j4}`);

  // J5: macro_region=kz_ca but isRegionalSeed=false → normal multiplier, NOT soft
  let profile = emptyProfile();
  const nonSeedKzCard = makePerson({
    country_tag: 'Kazakhstan', macro_region: 'kz_ca',
    difficulty_bucket: 'hard', isRegionalSeed: false,
  });
  profile = updateProfile(profile, nonSeedKzCard, 'know');
  const j5 = profile.weights.country['Kazakhstan'] ?? 1.0;
  check('J5: kz_ca card without isRegionalSeed flag → normal hard multiplier 1.5',
    Math.abs(j5 - 1.5) < eps, `got ${j5}`);
}

// ── L: Hard gate by thematic confidence ─────────────────────────────────────
console.log('\n── L: Hard gate by thematic confidence ──');
{
  // L1: hard politician — country/kz_ca high, but domain.politics=1.4 / POLITICIAN=0.9 → blocked
  {
    const card = makePerson({
      occupation: 'POLITICIAN', domain: 'politics', subdomain: null,
      country_tag: 'Kazakhstan', macro_region: 'kz_ca',
      difficulty_bucket: 'hard',
    });
    const profile = emptyProfile();
    profile.weights.country['Kazakhstan'] = 3.0;
    profile.weights.macroRegion['kz_ca']  = 3.0;
    profile.weights.domain['politics']    = 1.4;
    profile.weights.occupation['POLITICIAN'] = 0.9;
    const result = pickNextAdaptiveCard({
      candidates: [card], profile, usedIds: new Set(),
      counts: emptyCounts(), recentCards: [], rng: makeLCG(100), mode: 'exploit',
    });
    check('L1: hard politician with KZ/kz_ca=3 but politics=1.4/POLITICIAN=0.9 → blocked',
      result === null, `got ${result?.name}`);
  }

  // L2: hard boxer — subdomain.boxing=2.2 → allowed
  {
    const card = makePerson({
      occupation: 'BOXER', domain: 'sports', subdomain: 'boxing',
      difficulty_bucket: 'hard',
    });
    const profile = emptyProfile();
    profile.weights.subdomain['boxing'] = 2.2;
    const result = pickNextAdaptiveCard({
      candidates: [card], profile, usedIds: new Set(),
      counts: emptyCounts(), recentCards: [], rng: makeLCG(101), mode: 'exploit',
    });
    check('L2: hard boxer with boxing=2.2 → allowed',
      result !== null, `got null`);
  }

  // L3: easy/medium cards not blocked regardless of thematic confidence
  {
    const profile = emptyProfile(); // all weights neutral 1.0
    const medCard  = makePerson({ occupation: 'POLITICIAN', domain: 'politics', difficulty_bucket: 'medium' });
    const easyCard = makePerson({ occupation: 'POLITICIAN', domain: 'politics', difficulty_bucket: 'easy' });
    const hardCard = makePerson({ occupation: 'POLITICIAN', domain: 'politics', difficulty_bucket: 'hard' });
    const rBase    = { profile, usedIds: new Set(), counts: emptyCounts(), recentCards: [] };
    const rMed  = pickNextAdaptiveCard({ candidates: [medCard],  ...rBase, rng: makeLCG(102), mode: 'exploit' });
    const rEasy = pickNextAdaptiveCard({ candidates: [easyCard], ...rBase, rng: makeLCG(103), mode: 'exploit' });
    const rHard = pickNextAdaptiveCard({ candidates: [hardCard], ...rBase, rng: makeLCG(104), mode: 'exploit' });
    check('L3a: medium card with neutral profile → not blocked', rMed  !== null);
    check('L3b: easy card with neutral profile → not blocked',   rEasy !== null);
    check('L3c: hard card with neutral profile → blocked',       rHard === null);
  }

  // L4: isRegionalSeed hard card bypasses gate even with neutral profile
  {
    const rsCard = makePerson({
      occupation: 'POLITICIAN', domain: 'politics',
      difficulty_bucket: 'hard', isRegionalSeed: true,
    });
    const profile = emptyProfile();
    const result = pickNextAdaptiveCard({
      candidates: [rsCard], profile, usedIds: new Set(),
      counts: emptyCounts(), recentCards: [], rng: makeLCG(105), mode: 'exploit',
    });
    check('L4: isRegionalSeed hard card with neutral profile → not blocked', result !== null);
  }

  // L5: country=3 / kz_ca=3 / era=3 alone do NOT unlock hard (occupation/subdomain/domain neutral)
  {
    const card = makePerson({
      occupation: 'POLITICIAN', domain: 'politics', subdomain: null,
      country_tag: 'Kazakhstan', macro_region: 'kz_ca', era_bucket: 'medieval',
      difficulty_bucket: 'hard',
    });
    const profile = emptyProfile();
    profile.weights.country['Kazakhstan'] = 3.0;
    profile.weights.macroRegion['kz_ca']  = 3.0;
    profile.weights.era['medieval']       = 3.0;
    // domain.politics / occupation.POLITICIAN not set → default 1.0
    const result = pickNextAdaptiveCard({
      candidates: [card], profile, usedIds: new Set(),
      counts: emptyCounts(), recentCards: [], rng: makeLCG(106), mode: 'exploit',
    });
    check('L5: country=3/kz_ca=3/era=3 alone → hard card still blocked', result === null);
  }
}

// ── K: MAX_WEIGHT = 3 clamping ────────────────────────────────────────────────
console.log('\n── K: MAX_WEIGHT = 3 clamping ──');
{
  const eps = 0.001;

  // K1: 3× non-seed hard know on same card → caps at 3.0, not 3.375 or 5.0
  {
    let profile = emptyProfile();
    const card = makePerson({ country_tag: 'Germany', difficulty_bucket: 'hard' });
    profile = updateProfile(profile, card, 'know'); // ×1.5 → 1.5
    profile = updateProfile(profile, card, 'know'); // ×1.5 → 2.25
    profile = updateProfile(profile, card, 'know'); // ×1.5 → 3.375 → clamped 3.0
    const w = profile.weights.country['Germany'] ?? 1.0;
    check('K1: 3× non-seed hard know → country caps at 3.0 (not 3.375)',
      Math.abs(w - 3.0) < eps, `got ${w.toFixed(4)}`);
  }

  // K2: weight at cap (3.0) drops below cap on hard dont_know (3.0 × 0.9 = 2.7)
  {
    let profile = emptyProfile();
    const card = makePerson({ country_tag: 'Germany', difficulty_bucket: 'hard' });
    profile = updateProfile(profile, card, 'know');
    profile = updateProfile(profile, card, 'know');
    profile = updateProfile(profile, card, 'know'); // capped at 3.0
    profile = updateProfile(profile, card, 'dont_know'); // 3.0 × 0.9 = 2.7
    const w = profile.weights.country['Germany'] ?? 1.0;
    check('K2: capped weight (3.0) + hard dont_know → 2.7 (breakable downward)',
      Math.abs(w - 2.7) < eps, `got ${w.toFixed(4)}`);
  }

  // K3: regional seed reaches cap later — 4× hard know stays below 3.0 (1.25^4 = 2.441)
  {
    let profile = emptyProfile();
    const rsCard = makePerson({ country_tag: 'Kazakhstan', difficulty_bucket: 'hard', isRegionalSeed: true });
    for (let i = 0; i < 4; i++) profile = updateProfile(profile, rsCard, 'know');
    const w = profile.weights.country['Kazakhstan'] ?? 1.0;
    check('K3: regional seed 4× hard know → 2.44, still below 3.0',
      w < 3.0 - eps, `got ${w.toFixed(4)}`);
  }

  // K4: regional seed 5× hard know → caps at 3.0 (1.25^5 = 3.052 → clamped)
  {
    let profile = emptyProfile();
    const rsCard = makePerson({ country_tag: 'Kazakhstan', difficulty_bucket: 'hard', isRegionalSeed: true });
    for (let i = 0; i < 5; i++) profile = updateProfile(profile, rsCard, 'know');
    const w = profile.weights.country['Kazakhstan'] ?? 1.0;
    check('K4: regional seed 5× hard know → caps at 3.0 (not 3.052)',
      Math.abs(w - 3.0) < eps, `got ${w.toFixed(4)}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Total: ${passed + failed}  PASS: ${passed}  FAIL: ${failed}`);
if (failed > 0) process.exit(1);
