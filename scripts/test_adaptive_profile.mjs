/**
 * Standalone tests for adaptive-profile logic.
 * Run: node scripts/test_adaptive_profile.mjs
 * No test framework required.
 */

// ── Inline copy of pure functions (mirrors adaptive-profile.ts) ──────────────

const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 5.0;

const ERA_ORDER = [
  'ancient_bc', 'classical_late_antiquity', 'medieval', 'early_modern',
  'industrial_modern', 'postwar_births', 'late_20c_births',
  'modern_media_births', 'digital_births',
];

function getAnswerScore(answer) {
  if (answer === 'know')  return 1;
  if (answer === 'heard') return 0.5;
  return 0;
}

function getDifficultyAnswerMultiplier(difficultyBucket, answer) {
  const d = difficultyBucket ?? 'unknown';
  if (answer === 'know') {
    if (d === 'easy')   return 1.1;
    if (d === 'medium') return 1.3;
    if (d === 'hard')   return 1.5;
    return 1.2;
  }
  if (answer === 'heard') {
    return 1.0; // heard does not move weights
  }
  if (d === 'easy')   return 0.5;
  if (d === 'medium') return 0.7;
  if (d === 'hard')   return 0.9;
  return 0.8;
}

function softenMultiplier(multiplier, strength) {
  return 1 + (multiplier - 1) * strength;
}

function getNeighborEraBuckets(eraBucket) {
  if (!eraBucket || eraBucket === 'unknown') return [];
  const idx = ERA_ORDER.indexOf(eraBucket);
  if (idx === -1) return [];
  const neighbors = [];
  if (idx > 0)                    neighbors.push(ERA_ORDER[idx - 1]);
  if (idx < ERA_ORDER.length - 1) neighbors.push(ERA_ORDER[idx + 1]);
  return neighbors;
}

function isValidTag(value) {
  return !!value && value !== 'unknown';
}

function clamp(value) {
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, value));
}

function applyMultiplier(weights, key, multiplier) {
  const current = weights[key] ?? 1.0;
  weights[key] = clamp(current * multiplier);
}

function createInitialAdaptiveProfile() {
  return {
    version: 1,
    weights: { domain: {}, occupation: {}, subdomain: {}, country: {}, macroRegion: {}, era: {} },
    stats: { totalAnswers: 0, knowCount: 0, heardCount: 0, dontKnowCount: 0, scoreSum: 0 },
    answers: [],
  };
}

function updateAdaptiveProfile(profile, person, answer, options) {
  const weights = {
    domain:      { ...profile.weights.domain },
    occupation:  { ...profile.weights.occupation },
    subdomain:   { ...profile.weights.subdomain },
    country:     { ...profile.weights.country },
    macroRegion: { ...profile.weights.macroRegion },
    era:         { ...profile.weights.era },
  };

  const base    = getDifficultyAnswerMultiplier(person.difficulty_bucket, answer);
  const soft05  = softenMultiplier(base, 0.5);
  const soft04  = softenMultiplier(base, 0.4);
  const soft02  = softenMultiplier(base, 0.2);

  if (isValidTag(person.occupation))   applyMultiplier(weights.occupation,  person.occupation,   base);
  if (isValidTag(person.subdomain))    applyMultiplier(weights.subdomain,   person.subdomain,    base);
  if (isValidTag(person.country_tag))  applyMultiplier(weights.country,     person.country_tag,  base);
  if (isValidTag(person.domain))       applyMultiplier(weights.domain,      person.domain,       soft05);
  if (isValidTag(person.macro_region)) applyMultiplier(weights.macroRegion, person.macro_region, soft05);
  if (isValidTag(person.era_bucket)) {
    applyMultiplier(weights.era, person.era_bucket, soft04);
    for (const neighbor of getNeighborEraBuckets(person.era_bucket)) {
      applyMultiplier(weights.era, neighbor, soft02);
    }
  }

  const score = getAnswerScore(answer);
  const record = {
    qid: person.wikidata_id,
    answer,
    score,
    difficultyBucket: isValidTag(person.difficulty_bucket) ? person.difficulty_bucket : null,
    domain:      isValidTag(person.domain)       ? person.domain       : null,
    occupation:  isValidTag(person.occupation)   ? person.occupation   : null,
    subdomain:   isValidTag(person.subdomain)    ? person.subdomain    : null,
    country:     isValidTag(person.country_tag)  ? person.country_tag  : null,
    macroRegion: isValidTag(person.macro_region) ? person.macro_region : null,
    era:         isValidTag(person.era_bucket)   ? person.era_bucket   : null,
    timestamp:   options.timestamp,
  };

  return {
    version: 1,
    weights,
    stats: {
      totalAnswers:  profile.stats.totalAnswers + 1,
      knowCount:     profile.stats.knowCount     + (answer === 'know'      ? 1 : 0),
      heardCount:    profile.stats.heardCount    + (answer === 'heard'     ? 1 : 0),
      dontKnowCount: profile.stats.dontKnowCount + (answer === 'dont_know' ? 1 : 0),
      scoreSum:      profile.stats.scoreSum + score,
    },
    answers: [...profile.answers, record],
  };
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? '  →  ' + detail : ''}`);
    failed++;
  }
}

function approx(value, label) {
  return `${label}=${value?.toFixed(4)}`;
}

// ── Scenario A: Messi — easy, know ───────────────────────────────────────────
console.log('\n── A: Messi (easy, know) ──');
{
  const messi = {
    wikidata_id: 'Q615',
    occupation: 'SOCCER PLAYER',
    domain: 'sports',
    subdomain: 'football',
    country_tag: 'Argentina',
    macro_region: 'latin_america',
    era_bucket: 'modern_media_births',
    difficulty_bucket: 'easy',
  };
  const p = updateAdaptiveProfile(createInitialAdaptiveProfile(), messi, 'know', { timestamp: 1 });

  // base=1.1, soft05=1.05, soft04=1.04, soft02=1.02
  const base   = 1.1;
  const soft05 = softenMultiplier(base, 0.5); // 1.05
  const soft04 = softenMultiplier(base, 0.4); // 1.04
  const soft02 = softenMultiplier(base, 0.2); // 1.02

  check('occupation SOCCER PLAYER ≈ base',
    Math.abs(p.weights.occupation['SOCCER PLAYER'] - base) < 0.0001,
    approx(p.weights.occupation['SOCCER PLAYER'], 'occ'));
  check('subdomain football ≈ base',
    Math.abs(p.weights.subdomain['football'] - base) < 0.0001,
    approx(p.weights.subdomain['football'], 'sub'));
  check('country Argentina ≈ base',
    Math.abs(p.weights.country['Argentina'] - base) < 0.0001,
    approx(p.weights.country['Argentina'], 'country'));
  check('domain sports ≈ soft05',
    Math.abs(p.weights.domain['sports'] - soft05) < 0.0001,
    approx(p.weights.domain['sports'], 'domain'));
  check('macroRegion latin_america ≈ soft05',
    Math.abs(p.weights.macroRegion['latin_america'] - soft05) < 0.0001,
    approx(p.weights.macroRegion['latin_america'], 'macro'));
  check('era modern_media_births ≈ soft04',
    Math.abs(p.weights.era['modern_media_births'] - soft04) < 0.0001,
    approx(p.weights.era['modern_media_births'], 'era'));
  check('era neighbor late_20c_births ≈ soft02',
    Math.abs(p.weights.era['late_20c_births'] - soft02) < 0.0001,
    approx(p.weights.era['late_20c_births'], 'neighbor-prev'));
  check('era neighbor digital_births ≈ soft02',
    Math.abs(p.weights.era['digital_births'] - soft02) < 0.0001,
    approx(p.weights.era['digital_births'], 'neighbor-next'));
}

// ── Scenario B: Hard unknown footballer, know ─────────────────────────────────
console.log('\n── B: Hard footballer (hard, know) ──');
{
  const person = {
    wikidata_id: 'Qtest',
    occupation: 'SOCCER PLAYER',
    domain: 'sports',
    subdomain: 'football',
    country_tag: 'Brazil',
    macro_region: 'latin_america',
    era_bucket: 'digital_births',
    difficulty_bucket: 'hard',
  };
  const p = updateAdaptiveProfile(createInitialAdaptiveProfile(), person, 'know', { timestamp: 2 });

  const base   = 1.5;
  const soft05 = softenMultiplier(base, 0.5); // 1.25
  const soft04 = softenMultiplier(base, 0.4); // 1.2

  check('occupation ≈ 1.5',
    Math.abs(p.weights.occupation['SOCCER PLAYER'] - base) < 0.0001,
    approx(p.weights.occupation['SOCCER PLAYER'], 'occ'));
  check('subdomain football ≈ 1.5',
    Math.abs(p.weights.subdomain['football'] - base) < 0.0001,
    approx(p.weights.subdomain['football'], 'sub'));
  check('country Brazil ≈ 1.5',
    Math.abs(p.weights.country['Brazil'] - base) < 0.0001,
    approx(p.weights.country['Brazil'], 'country'));
  check('domain sports ≈ 1.25',
    Math.abs(p.weights.domain['sports'] - soft05) < 0.0001,
    approx(p.weights.domain['sports'], 'domain'));
  check('macroRegion ≈ 1.25',
    Math.abs(p.weights.macroRegion['latin_america'] - soft05) < 0.0001,
    approx(p.weights.macroRegion['latin_america'], 'macro'));
  check('era ≈ 1.2',
    Math.abs(p.weights.era['digital_births'] - soft04) < 0.0001,
    approx(p.weights.era['digital_births'], 'era'));
  // digital_births has only one neighbor: modern_media_births
  check('era neighbor modern_media_births exists',
    p.weights.era['modern_media_births'] !== undefined);
  check('era ancient_bc NOT touched (not a neighbor)',
    p.weights.era['ancient_bc'] === undefined);
}

// ── Scenario C: Easy person, dont_know ───────────────────────────────────────
console.log('\n── C: Easy person (easy, dont_know) ──');
{
  const person = {
    wikidata_id: 'Qtest2',
    occupation: 'ACTOR',
    domain: 'entertainment',
    subdomain: 'actor',
    country_tag: 'United States',
    macro_region: 'usa_canada',
    era_bucket: 'postwar_births',
    difficulty_bucket: 'easy',
  };
  const p = updateAdaptiveProfile(createInitialAdaptiveProfile(), person, 'dont_know', { timestamp: 3 });

  // base=0.5
  const base   = 0.5;
  const soft05 = softenMultiplier(base, 0.5); // 0.75
  const soft04 = softenMultiplier(base, 0.4); // 0.8
  const soft02 = softenMultiplier(base, 0.2); // 0.9

  check('occupation falls to 0.5',
    Math.abs(p.weights.occupation['ACTOR'] - base) < 0.0001,
    approx(p.weights.occupation['ACTOR'], 'occ'));
  check('domain falls softer (0.75)',
    Math.abs(p.weights.domain['entertainment'] - soft05) < 0.0001,
    approx(p.weights.domain['entertainment'], 'domain'));
  check('era falls carefully (0.8)',
    Math.abs(p.weights.era['postwar_births'] - soft04) < 0.0001,
    approx(p.weights.era['postwar_births'], 'era'));
  check('era neighbor falls very gently (0.9)',
    p.weights.era['late_20c_births'] !== undefined &&
    Math.abs(p.weights.era['late_20c_births'] - soft02) < 0.0001,
    approx(p.weights.era['late_20c_births'], 'neighbor'));
  check('occupation < domain (precise < soft)',
    p.weights.occupation['ACTOR'] < p.weights.domain['entertainment']);
  check('domain < era neighbor (soft < very soft)',
    p.weights.domain['entertainment'] < p.weights.era['late_20c_births']);
}

// ── Scenario D: heard does NOT move weights ───────────────────────────────────
console.log('\n── D: heard does not move weights ──');
{
  const mkPerson = (qid, diff) => ({
    wikidata_id: qid,
    occupation: 'MUSICIAN',
    domain: 'entertainment',
    subdomain: 'musician',
    country_tag: 'Germany',
    macro_region: 'western_europe',
    era_bucket: 'industrial_modern',
    difficulty_bucket: diff,
  });

  // medium + heard
  const pm = updateAdaptiveProfile(createInitialAdaptiveProfile(), mkPerson('Qm', 'medium'), 'heard', { timestamp: 4 });
  check('medium+heard: occupation weight unchanged (multiplier=1.0)',
    pm.weights.occupation['MUSICIAN'] === undefined || Math.abs(pm.weights.occupation['MUSICIAN'] - 1.0) < 0.0001,
    approx(pm.weights.occupation['MUSICIAN'], 'occ'));
  check('medium+heard: domain weight unchanged',
    pm.weights.domain['entertainment'] === undefined || Math.abs(pm.weights.domain['entertainment'] - 1.0) < 0.0001,
    approx(pm.weights.domain['entertainment'], 'domain'));
  check('medium+heard: era weight unchanged',
    pm.weights.era['industrial_modern'] === undefined || Math.abs(pm.weights.era['industrial_modern'] - 1.0) < 0.0001,
    approx(pm.weights.era['industrial_modern'], 'era'));

  // hard + heard
  const ph = updateAdaptiveProfile(createInitialAdaptiveProfile(), mkPerson('Qh', 'hard'), 'heard', { timestamp: 5 });
  check('hard+heard: occupation weight unchanged',
    ph.weights.occupation['MUSICIAN'] === undefined || Math.abs(ph.weights.occupation['MUSICIAN'] - 1.0) < 0.0001,
    approx(ph.weights.occupation['MUSICIAN'], 'occ'));

  // heard still updates stats correctly
  check('medium+heard: scoreSum = 0.5',
    Math.abs(pm.stats.scoreSum - 0.5) < 0.0001, `scoreSum=${pm.stats.scoreSum}`);
  check('medium+heard: heardCount = 1',
    pm.stats.heardCount === 1);
  check('medium+heard: totalAnswers = 1',
    pm.stats.totalAnswers === 1);
}

// ── Scenario E: 10 hard footballers → MAX_WEIGHT clamp ───────────────────────
console.log('\n── E: 10 hard know footballers → clamp at 5.0 ──');
{
  const mkPerson = (qid) => ({
    wikidata_id: qid,
    occupation: 'SOCCER PLAYER',
    domain: 'sports',
    subdomain: 'football',
    country_tag: 'Spain',
    macro_region: 'western_europe',
    era_bucket: 'digital_births',
    difficulty_bucket: 'hard',
  });

  let p = createInitialAdaptiveProfile();
  for (let i = 0; i < 10; i++) {
    p = updateAdaptiveProfile(p, mkPerson(`Q${i}`), 'know', { timestamp: i });
  }

  check('subdomain football ≤ MAX_WEIGHT (5.0)',
    p.weights.subdomain['football'] <= MAX_WEIGHT,
    approx(p.weights.subdomain['football'], 'sub'));
  check('occupation SOCCER PLAYER ≤ 5.0',
    p.weights.occupation['SOCCER PLAYER'] <= MAX_WEIGHT,
    approx(p.weights.occupation['SOCCER PLAYER'], 'occ'));
  check('football has grown significantly (> 3.0)',
    p.weights.subdomain['football'] > 3.0,
    approx(p.weights.subdomain['football'], 'sub'));
  check('totalAnswers = 10',
    p.stats.totalAnswers === 10);
}

// ── Scenario F: Stats tracking ────────────────────────────────────────────────
console.log('\n── F: Stats tracking ──');
{
  const mkPerson = (qid) => ({
    wikidata_id: qid,
    occupation: 'WRITER',
    domain: 'literature_thought',
    subdomain: null,
    country_tag: 'France',
    macro_region: 'western_europe',
    era_bucket: 'early_modern',
    difficulty_bucket: 'medium',
  });

  let p = createInitialAdaptiveProfile();
  p = updateAdaptiveProfile(p, mkPerson('Q1'), 'know',      { timestamp: 1 });
  p = updateAdaptiveProfile(p, mkPerson('Q2'), 'heard',     { timestamp: 2 });
  p = updateAdaptiveProfile(p, mkPerson('Q3'), 'dont_know', { timestamp: 3 });
  p = updateAdaptiveProfile(p, mkPerson('Q4'), 'know',      { timestamp: 4 });

  check('totalAnswers = 4',    p.stats.totalAnswers  === 4);
  check('knowCount = 2',       p.stats.knowCount     === 2);
  check('heardCount = 1',      p.stats.heardCount    === 1);
  check('dontKnowCount = 1',   p.stats.dontKnowCount === 1);
  check('scoreSum = 2.5',      Math.abs(p.stats.scoreSum - 2.5) < 0.0001,
    `scoreSum=${p.stats.scoreSum}`);
  check('answers.length = 4',  p.answers.length === 4);
  check('subdomain null → not in weights.subdomain',
    !('WRITER' in p.weights.subdomain) && Object.keys(p.weights.subdomain).length === 0);
}

// ── Scenario G: null / unknown tags not written ───────────────────────────────
console.log('\n── G: null/unknown tags not written ──');
{
  const person = {
    wikidata_id: 'Qtest4',
    occupation: null,
    domain: 'unknown',
    subdomain: null,
    country_tag: null,
    macro_region: 'unknown',
    era_bucket: null,
    difficulty_bucket: 'easy',
  };
  const p = updateAdaptiveProfile(createInitialAdaptiveProfile(), person, 'know', { timestamp: 9 });

  check('weights.occupation empty',   Object.keys(p.weights.occupation).length === 0);
  check('weights.subdomain empty',    Object.keys(p.weights.subdomain).length === 0);
  check('weights.country empty',      Object.keys(p.weights.country).length === 0);
  check('weights.domain empty',       Object.keys(p.weights.domain).length === 0);
  check('weights.macroRegion empty',  Object.keys(p.weights.macroRegion).length === 0);
  check('weights.era empty',          Object.keys(p.weights.era).length === 0);
  check('AnswerRecord fields null',
    p.answers[0].occupation === null &&
    p.answers[0].domain     === null &&
    p.answers[0].country    === null &&
    p.answers[0].era        === null);
}

// ── Scenario H: Immutability ──────────────────────────────────────────────────
console.log('\n── H: Pure function / immutability ──');
{
  const before = createInitialAdaptiveProfile();
  const person = {
    wikidata_id: 'Qtest5',
    occupation: 'BOXER',
    domain: 'sports',
    subdomain: 'boxing',
    country_tag: 'Mexico',
    macro_region: 'latin_america',
    era_bucket: 'postwar_births',
    difficulty_bucket: 'medium',
  };
  const after = updateAdaptiveProfile(before, person, 'know', { timestamp: 99 });

  check('original profile unchanged (weights.occupation)',
    Object.keys(before.weights.occupation).length === 0);
  check('original stats unchanged',
    before.stats.totalAnswers === 0);
  check('original answers unchanged',
    before.answers.length === 0);
  check('new profile has updates',
    after.weights.occupation['BOXER'] !== undefined);
}

// ── getNeighborEraBuckets edge cases ─────────────────────────────────────────
console.log('\n── I: getNeighborEraBuckets edge cases ──');
{
  const n_ancient  = getNeighborEraBuckets('ancient_bc');
  const n_digital  = getNeighborEraBuckets('digital_births');
  const n_medieval = getNeighborEraBuckets('medieval');
  const n_unknown  = getNeighborEraBuckets('unknown');
  const n_null     = getNeighborEraBuckets(null);

  check('ancient_bc → only one neighbor', n_ancient.length === 1 && n_ancient[0] === 'classical_late_antiquity');
  check('digital_births → only one neighbor', n_digital.length === 1 && n_digital[0] === 'modern_media_births');
  check('medieval → 2 neighbors', n_medieval.length === 2);
  check('unknown → []', n_unknown.length === 0);
  check('null → []', n_null.length === 0);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Total: ${passed + failed}  PASS: ${passed}  FAIL: ${failed}`);
if (failed > 0) process.exit(1);
