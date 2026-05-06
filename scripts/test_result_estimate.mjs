/**
 * Deterministic tests for calculateResultEstimate.
 * No sampler, no play_pools.json, no random.
 * Run: node scripts/test_result_estimate.mjs
 */

// ── Inline implementation (mirrors src/lib/play/result-estimate.ts) ───────────

const BASE_BUCKET_TOTALS    = { easy: 1500, medium: 8500, hard: 20000 };
const DEFAULT_BUCKET_RATES  = { easy: 0.7,  medium: 0.4,  hard: 0.2  };
const BROADER_UNIVERSE_FACTOR = 2;
const ZONE_MIN_TOTAL          = 5;
const STRONG_RATE_THRESHOLD   = 0.7;
const WEAK_RATE_THRESHOLD     = 0.4;

function roundTo(value, nearest) { return Math.round(value / nearest) * nearest; }

function getRangePercent(totalAnswers) {
  if (totalAnswers >= 2000) return 7;
  if (totalAnswers >= 1000) return 10;
  if (totalAnswers >= 500)  return 12;
  if (totalAnswers >= 200)  return 15;
  return 20;
}

function getLevelLabel(publicEstimate) {
  if (publicEstimate >= 45000) return 'master';
  if (publicEstimate >= 28000) return 'erudite';
  if (publicEstimate >= 15000) return 'engaged';
  if (publicEstimate >= 6000)  return 'casual';
  return 'beginner';
}

function calculateResultEstimate(deck, answers, profile) {
  let knowCount = 0, heardCount = 0, dontKnowCount = 0, scoreSum = 0, answeredCount = 0;
  const bucketData = {};

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

  let rawCalib = 0;
  const usedDefaultBuckets = [];
  const bucketStats = {};
  for (const b of ['easy', 'medium', 'hard']) {
    const d           = bucketData[b];
    const usedDefault = !(d && d.count > 0);
    const scoreRate   = usedDefault ? DEFAULT_BUCKET_RATES[b] : d.sum / d.count;
    const count       = usedDefault ? 0 : d.count;
    bucketStats[b]    = { count, scoreRate, usedDefault };
    if (usedDefault) usedDefaultBuckets.push(b);
    rawCalib += BASE_BUCKET_TOTALS[b] * scoreRate;
  }
  const calibrationEstimate = roundTo(rawCalib, 100);
  const publicEstimate = Math.max(0, Math.min(60000,
    roundTo(calibrationEstimate * BROADER_UNIVERSE_FACTOR, 100)));

  const rangePercent = getRangePercent(profile.stats.totalAnswers);
  const rangeLow     = roundTo(publicEstimate * (1 - rangePercent / 100), 100);
  const rangeHigh    = roundTo(publicEstimate * (1 + rangePercent / 100), 100);
  const levelLabel   = getLevelLabel(publicEstimate);
  const isPreliminary = profile.stats.totalAnswers < 100;

  const axes = [
    { axis: 'subdomain',   getTag: p => p.subdomain },
    { axis: 'domain',      getTag: p => p.domain !== 'unknown' ? p.domain : null },
    { axis: 'country',     getTag: p => p.country_tag },
    { axis: 'macroRegion', getTag: p => p.macro_region !== 'unknown' ? p.macro_region : null },
    { axis: 'era',         getTag: p => p.era_bucket !== 'unknown' ? p.era_bucket : null },
  ];

  const zoneMap = new Map();
  for (const person of deck) {
    const ans = answers[person.wikidata_id];
    if (!ans) continue;
    const score = ans.answer === 'know' ? 1 : ans.answer === 'heard' ? 0.5 : 0;
    for (const { axis, getTag } of axes) {
      const tag = getTag(person);
      if (!tag) continue;
      const key = `${axis}:${tag}`;
      const e   = zoneMap.get(key);
      if (e) { e.total++; e.scoreSum += score; e.rate = e.scoreSum / e.total; }
      else   { zoneMap.set(key, { axis, tag, total: 1, scoreSum: score, rate: score }); }
    }
  }

  const subToDomain = {}, countryToRegion = {};
  for (const person of deck) {
    if (person.subdomain   && person.domain       !== 'unknown') subToDomain[person.subdomain]        = person.domain;
    if (person.country_tag && person.macro_region !== 'unknown') countryToRegion[person.country_tag]  = person.macro_region;
  }

  function dedup(zones) {
    const covDomains = new Set(), covRegions = new Set();
    for (const z of zones) {
      if (z.axis === 'subdomain') { const d = subToDomain[z.tag];     if (d) covDomains.add(d); }
      if (z.axis === 'country')   { const r = countryToRegion[z.tag]; if (r) covRegions.add(r); }
    }
    return zones.filter(z =>
      !(z.axis === 'domain'      && covDomains.has(z.tag)) &&
      !(z.axis === 'macroRegion' && covRegions.has(z.tag)));
  }

  const eligible = [...zoneMap.values()].filter(z => z.total >= ZONE_MIN_TOTAL);
  const strongZones = dedup(eligible.filter(z => z.rate >= STRONG_RATE_THRESHOLD)
    .sort((a, b) => b.rate - a.rate || b.total - a.total)).slice(0, 5);
  const weakZones   = dedup(eligible.filter(z => z.rate <= WEAK_RATE_THRESHOLD)
    .sort((a, b) => a.rate - b.rate || b.total - a.total)).slice(0, 5);

  return { answeredCount, knowCount, heardCount, dontKnowCount, scoreSum, scorePercent,
           calibrationEstimate, publicEstimate, rangeLow, rangeHigh, rangePercent,
           levelLabel, bucketStats, usedDefaultBuckets, strongZones, weakZones, isPreliminary };
}

// ── Builders ──────────────────────────────────────────────────────────────────

function makeProfile(totalAnswers) {
  return { version: 1,
    weights: { domain:{}, occupation:{}, subdomain:{}, country:{}, macroRegion:{}, era:{} },
    stats: { totalAnswers, knowCount: 0, heardCount: 0, dontKnowCount: 0, scoreSum: 0 },
    answers: [] };
}

function makePerson(id, difficulty, opts = {}) {
  return {
    wikidata_id: id, name: id, occupation: opts.occupation ?? '', bplace_country: '',
    birthyear: null, deathyear: null, inclusion_source: 'global',
    global_rank: 1, global_score: 1, ru_score: 0, kz_score: 0, hpi: 0,
    domain:      opts.domain      ?? 'unknown',
    subdomain:   opts.subdomain   ?? null,
    country_tag: opts.country     ?? null,
    macro_region: opts.macroRegion ?? 'unknown',
    era_bucket:  opts.era         ?? 'unknown',
    difficulty_bucket: difficulty,
    content_sensitivity: 'normal',
  };
}

function makeAnswer(qid, answer) {
  return { qid, answer, answeredAt: '2026-01-01T00:00:00Z', responseMs: 1000 };
}

function makeAnswers(deck, answerFn) {
  const a = {};
  for (const p of deck) a[p.wikidata_id] = makeAnswer(p.wikidata_id, answerFn(p));
  return a;
}

// deck helpers: N cards of given difficulty, k know, rest dont_know
function mkDeck(prefix, diff, total, know, opts = {}) {
  const deck = Array.from({ length: total }, (_, i) => makePerson(`${prefix}${i}`, diff, opts));
  const answers = {};
  for (let i = 0; i < total; i++)
    answers[`${prefix}${i}`] = makeAnswer(`${prefix}${i}`, i < know ? 'know' : 'dont_know');
  return { deck, answers };
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function check(label, condition, detail = '') {
  if (condition) { console.log(`  PASS  ${label}`); passed++; }
  else           { console.log(`  FAIL  ${label}${detail ? '  →  ' + detail : ''}`); failed++; }
}

// ── A. Answer counts ──────────────────────────────────────────────────────────
console.log('\n── A. Answer counts ──');
{
  const deck = [
    makePerson('p1', 'easy'),   makePerson('p2', 'medium'),
    makePerson('p3', 'hard'),   makePerson('p4', 'easy'),
    makePerson('p5', 'medium'),
  ];
  const answers = {
    p1: makeAnswer('p1', 'know'),
    p2: makeAnswer('p2', 'heard'),
    p3: makeAnswer('p3', 'dont_know'),
    p4: makeAnswer('p4', 'know'),
    // p5 unanswered
  };
  const r = calculateResultEstimate(deck, answers, makeProfile(100));
  check('answeredCount = 4',         r.answeredCount === 4,                        `got ${r.answeredCount}`);
  check('knowCount = 2',             r.knowCount === 2,                            `got ${r.knowCount}`);
  check('heardCount = 1',            r.heardCount === 1,                           `got ${r.heardCount}`);
  check('dontKnowCount = 1',         r.dontKnowCount === 1,                        `got ${r.dontKnowCount}`);
  check('scoreSum = 2.5 (2×1+1×0.5)', Math.abs(r.scoreSum - 2.5) < 0.001,         `got ${r.scoreSum}`);
  check('isPreliminary = false (totalAnswers=100)', !r.isPreliminary);
}
{
  const deck = [makePerson('q1', 'easy')];
  const answers = { q1: makeAnswer('q1', 'know') };
  const r = calculateResultEstimate(deck, answers, makeProfile(50));
  check('isPreliminary = true (totalAnswers=50)', r.isPreliminary);
}

// ── B. Range percent ──────────────────────────────────────────────────────────
console.log('\n── B. Range percent ──');
{
  const deck = [makePerson('r1', 'easy')];
  const answers = { r1: makeAnswer('r1', 'know') };
  for (const [total, expected] of [[100,20],[200,15],[500,12],[1000,10],[2000,7]]) {
    const r = calculateResultEstimate(deck, answers, makeProfile(total));
    check(`totalAnswers=${total} → rangePercent=${expected}`,
      r.rangePercent === expected, `got ${r.rangePercent}`);
  }
}

// ── C. All-easy all-know: bucket extrapolation + bucketStats ─────────────────
console.log('\n── C. All-easy all-know: bucket extrapolation ──');
{
  // Missing medium/hard → defaults 0.4 / 0.2 apply.
  // calib = 1500×1.0 + 8500×0.4 + 20000×0.2 = 8900; pub = 17800
  const { deck, answers } = mkDeck('c', 'easy', 100, 100);
  const r = calculateResultEstimate(deck, answers, makeProfile(100));
  check('C: calibrationEstimate = 8900',   r.calibrationEstimate === 8900,  `got ${r.calibrationEstimate}`);
  check('C: publicEstimate = 17800',        r.publicEstimate === 17800,       `got ${r.publicEstimate}`);
  check('C: easy.usedDefault = false',      !r.bucketStats.easy.usedDefault,  `got ${r.bucketStats.easy.usedDefault}`);
  check('C: medium.usedDefault = true',     r.bucketStats.medium.usedDefault, `got ${r.bucketStats.medium.usedDefault}`);
  check('C: hard.usedDefault = true',       r.bucketStats.hard.usedDefault,   `got ${r.bucketStats.hard.usedDefault}`);
  check('C: usedDefaultBuckets = [medium, hard]',
    r.usedDefaultBuckets.length === 2 &&
    r.usedDefaultBuckets.includes('medium') &&
    r.usedDefaultBuckets.includes('hard'),
    `got [${r.usedDefaultBuckets}]`);
  check('C: pubEst < naive 30000', r.publicEstimate < 30000, `pubEst=${r.publicEstimate}`);
  console.log(`  INFO  all-easy all-know: calibEst=${r.calibrationEstimate}  pubEst=${r.publicEstimate}  level=${r.levelLabel}`);
}
{
  // All buckets covered → usedDefaultBuckets = []
  const e = mkDeck('cv_e', 'easy',   34, 20);
  const m = mkDeck('cv_m', 'medium', 33, 15);
  const h = mkDeck('cv_h', 'hard',   33,  8);
  const deck = [...e.deck,...m.deck,...h.deck];
  const answers = {...e.answers,...m.answers,...h.answers};
  const r = calculateResultEstimate(deck, answers, makeProfile(100));
  check('C2: all buckets covered → usedDefaultBuckets = []',
    r.usedDefaultBuckets.length === 0,
    `got [${r.usedDefaultBuckets}]`);
  check('C2: no bucket usedDefault',
    !r.bucketStats.easy.usedDefault && !r.bucketStats.medium.usedDefault && !r.bucketStats.hard.usedDefault);
}

// ── D. Mixed rates: easy 90%, medium 50%, hard 27% ───────────────────────────
console.log('\n── D. Mixed rates ──');
{
  // 10 easy: 9 know (rate=0.9)
  // 10 medium: 5 know (rate=0.5)
  // 100 hard: 27 know (rate=0.27)
  const eD = mkDeck('de', 'easy',    10,  9);
  const mD = mkDeck('dm', 'medium',  10,  5);
  const hD = mkDeck('dh', 'hard',   100, 27);
  const deck    = [...eD.deck,    ...mD.deck,    ...hD.deck];
  const answers = { ...eD.answers, ...mD.answers, ...hD.answers };

  const rawExpected    = 1500*0.9 + 8500*0.5 + 20000*0.27; // = 1350+4250+5400 = 11000
  const calibExpected  = roundTo(rawExpected, 100);          // = 11000
  const pubExpected    = roundTo(calibExpected * 2, 100);    // = 22000

  const r = calculateResultEstimate(deck, answers, makeProfile(120));
  check(`D: calibEst = ${calibExpected}`,
    Math.abs(r.calibrationEstimate - calibExpected) <= 100,
    `got ${r.calibrationEstimate}`);
  check(`D: pubEst = ${pubExpected}`,
    Math.abs(r.publicEstimate - pubExpected) <= 200,
    `got ${r.publicEstimate}`);
  check('D: pubEst = calibEst × 2',
    Math.abs(r.publicEstimate - r.calibrationEstimate * 2) <= 200);
}

// ── E. Missing hard bucket → default 0.2 applied ────────────────────────────
console.log('\n── E. Missing hard bucket ──');
{
  // Deck has only easy (10/10 know) + medium (5/10 know). No hard.
  const eD = mkDeck('ee', 'easy',   10, 10);
  const mD = mkDeck('em', 'medium', 10,  5);
  const deck    = [...eD.deck,    ...mD.deck];
  const answers = { ...eD.answers, ...mD.answers };

  const rawExpected   = 1500*1.0 + 8500*0.5 + 20000*0.2; // = 1500+4250+4000 = 9750
  const calibExpected = roundTo(rawExpected, 100);         // = 9800

  const r = calculateResultEstimate(deck, answers, makeProfile(100));
  check(`E: calibEst = ${calibExpected} (hard default 0.2 applied)`,
    Math.abs(r.calibrationEstimate - calibExpected) <= 100,
    `got ${r.calibrationEstimate}`);
}

// ── F. Rounding ───────────────────────────────────────────────────────────────
console.log('\n── F. Rounding ──');
{
  const { deck, answers } = mkDeck('f', 'medium', 20, 7);
  const r = calculateResultEstimate(deck, answers, makeProfile(100));
  check('F: calibEst % 100 = 0',  r.calibrationEstimate % 100 === 0, `got ${r.calibrationEstimate}`);
  check('F: pubEst    % 100 = 0', r.publicEstimate      % 100 === 0, `got ${r.publicEstimate}`);
  check('F: rangeLow  % 100 = 0', r.rangeLow            % 100 === 0, `got ${r.rangeLow}`);
  check('F: rangeHigh % 100 = 0', r.rangeHigh           % 100 === 0, `got ${r.rangeHigh}`);
}

// ── G. Level labels ───────────────────────────────────────────────────────────
console.log('\n── G. Level labels ──');
{
  function threeDecks(know30, total30 = 30) {
    // Returns deck+answers with equal-size easy/medium/hard pools
    const e = mkDeck('ge', 'easy',   total30, know30);
    const m = mkDeck('gm', 'medium', total30, know30);
    const h = mkDeck('gh', 'hard',   total30, know30);
    return { deck: [...e.deck,...m.deck,...h.deck], answers: {...e.answers,...m.answers,...h.answers} };
  }

  // beginner: all dont_know → pub = 0 < 6000
  {
    const { deck, answers } = threeDecks(0);
    const r = calculateResultEstimate(deck, answers, makeProfile(100));
    check(`G: beginner (pub=${r.publicEstimate})`, r.levelLabel === 'beginner', `got ${r.levelLabel}`);
  }
  // casual: 1/10 each → calib = 3000, pub = 6000 (≥ 6000)
  {
    const e = mkDeck('ca_e', 'easy',   10, 1);
    const m = mkDeck('ca_m', 'medium', 10, 1);
    const h = mkDeck('ca_h', 'hard',   10, 1);
    const deck = [...e.deck,...m.deck,...h.deck];
    const answers = {...e.answers,...m.answers,...h.answers};
    const r = calculateResultEstimate(deck, answers, makeProfile(100));
    check(`G: casual (pub=${r.publicEstimate})`, r.levelLabel === 'casual', `got ${r.levelLabel}`);
  }
  // engaged: 8/30 each → calib = 8000, pub = 16000 (15000–28000)
  {
    const { deck, answers } = threeDecks(8);
    const r = calculateResultEstimate(deck, answers, makeProfile(100));
    check(`G: engaged (pub=${r.publicEstimate})`, r.levelLabel === 'engaged', `got ${r.levelLabel}`);
  }
  // erudite: 16/30 each → calib = 16000, pub = 32000 (28000–45000)
  {
    const { deck, answers } = threeDecks(16);
    const r = calculateResultEstimate(deck, answers, makeProfile(100));
    check(`G: erudite (pub=${r.publicEstimate})`, r.levelLabel === 'erudite', `got ${r.levelLabel}`);
  }
  // master: 25/30 each → calib = 25000, pub = 50000 (≥ 45000)
  {
    const { deck, answers } = threeDecks(25);
    const r = calculateResultEstimate(deck, answers, makeProfile(100));
    check(`G: master (pub=${r.publicEstimate})`, r.levelLabel === 'master', `got ${r.levelLabel}`);
  }
}

// ── H. Strong zones + football dedup ─────────────────────────────────────────
console.log('\n── H. Strong zones (football/sports dedup) ──');
{
  const deck = [];
  const answers = {};
  // 8 football cards (subdomain=football, domain=sports), 7 know (rate=7/8=0.875)
  for (let i = 0; i < 8; i++) {
    const id = `fb${i}`;
    deck.push(makePerson(id, 'easy', { subdomain: 'football', domain: 'sports' }));
    answers[id] = makeAnswer(id, i < 7 ? 'know' : 'dont_know');
  }
  // 4 other sports (no subdomain), all know → domain:sports total=12, sum=11, rate≈0.917
  for (let i = 0; i < 4; i++) {
    const id = `sp${i}`;
    deck.push(makePerson(id, 'easy', { domain: 'sports' }));
    answers[id] = makeAnswer(id, 'know');
  }
  // 10 politics (domain=politics), all know → strongZone but unrelated
  for (let i = 0; i < 10; i++) {
    const id = `po${i}`;
    deck.push(makePerson(id, 'easy', { domain: 'politics' }));
    answers[id] = makeAnswer(id, 'know');
  }
  const r = calculateResultEstimate(deck, answers, makeProfile(100));
  const hasFootball = r.strongZones.some(z => z.axis === 'subdomain' && z.tag === 'football');
  const hasSports   = r.strongZones.some(z => z.axis === 'domain'    && z.tag === 'sports');
  check('H: subdomain:football in strongZones (rate=0.875)',   hasFootball,
    JSON.stringify(r.strongZones.map(z => `${z.axis}:${z.tag}`)));
  check('H: domain:sports deduped (covered by football)',       !hasSports,
    JSON.stringify(r.strongZones.map(z => `${z.axis}:${z.tag}`)));
}

// ── I. Weak zones ─────────────────────────────────────────────────────────────
console.log('\n── I. Weak zones ──');
{
  const deck = [];
  const answers = {};
  // 6 science cards, 1 know (rate=1/6≈0.167) → weakZone
  for (let i = 0; i < 6; i++) {
    const id = `sc${i}`;
    deck.push(makePerson(id, 'medium', { domain: 'science' }));
    answers[id] = makeAnswer(id, i === 0 ? 'know' : 'dont_know');
  }
  // 10 politics all know → strong, not weak
  for (let i = 0; i < 10; i++) {
    const id = `pw${i}`;
    deck.push(makePerson(id, 'easy', { domain: 'politics' }));
    answers[id] = makeAnswer(id, 'know');
  }
  const r = calculateResultEstimate(deck, answers, makeProfile(100));
  const hasScience  = r.weakZones.some(z => z.axis === 'domain' && z.tag === 'science');
  const hasPolitics = r.weakZones.some(z => z.axis === 'domain' && z.tag === 'politics');
  check('I: domain:science in weakZones (rate≈0.167)',    hasScience,
    JSON.stringify(r.weakZones.map(z => `${z.axis}:${z.tag}`)));
  check('I: domain:politics NOT in weakZones (rate=1.0)', !hasPolitics);
}

// ── J. Country/macroRegion dedup ─────────────────────────────────────────────
console.log('\n── J. Country/macroRegion dedup ──');
{
  const deck = [];
  const answers = {};
  // 8 KAZ country (macroRegion=kz_ca), all know → rate=1.0 → strong
  for (let i = 0; i < 8; i++) {
    const id = `kz${i}`;
    deck.push(makePerson(id, 'easy', { country: 'KAZ', macroRegion: 'kz_ca' }));
    answers[id] = makeAnswer(id, 'know');
  }
  // 3 more kz_ca (no country_tag set), all know → macroRegion total=11, rate=1.0 → also strong candidate
  for (let i = 0; i < 3; i++) {
    const id = `kzx${i}`;
    deck.push(makePerson(id, 'easy', { macroRegion: 'kz_ca' }));
    answers[id] = makeAnswer(id, 'know');
  }
  const r = calculateResultEstimate(deck, answers, makeProfile(100));
  const hasKAZ   = r.strongZones.some(z => z.axis === 'country'     && z.tag === 'KAZ');
  const hasKzCa  = r.strongZones.some(z => z.axis === 'macroRegion' && z.tag === 'kz_ca');
  check('J: country:KAZ in strongZones',                  hasKAZ,
    JSON.stringify(r.strongZones.map(z => `${z.axis}:${z.tag}`)));
  check('J: macroRegion:kz_ca deduped (covered by KAZ)', !hasKzCa,
    JSON.stringify(r.strongZones.map(z => `${z.axis}:${z.tag}`)));
}

// ── K. scorePercent ───────────────────────────────────────────────────────────
console.log('\n── K. scorePercent ──');
{
  // 4 know (score=1), 4 heard (score=0.5), 2 dont_know (score=0): sum=4+2=6, pct=6/10*100=60
  const deck = Array.from({length: 10}, (_, i) => makePerson(`kp${i}`, 'easy'));
  const answers = {};
  for (let i = 0; i < 10; i++) {
    const a = i < 4 ? 'know' : i < 8 ? 'heard' : 'dont_know';
    answers[`kp${i}`] = makeAnswer(`kp${i}`, a);
  }
  const r = calculateResultEstimate(deck, answers, makeProfile(100));
  check('K: scorePercent = 60 (4know+4heard+2dont_know)',
    Math.abs(r.scorePercent - 60) < 0.001, `got ${r.scorePercent}`);
}

// ── Examples (informational) ──────────────────────────────────────────────────
console.log('\n── Examples ──');
{
  function exampleResult(label, know30, total30 = 30, totalAnswers = 100) {
    const e = mkDeck(`ex_e_${label}`, 'easy',   total30, know30);
    const m = mkDeck(`ex_m_${label}`, 'medium', total30, know30);
    const h = mkDeck(`ex_h_${label}`, 'hard',   total30, know30);
    const deck = [...e.deck,...m.deck,...h.deck];
    const answers = {...e.answers,...m.answers,...h.answers};
    const r = calculateResultEstimate(deck, answers, makeProfile(totalAnswers));
    const defaults = r.usedDefaultBuckets.length ? ` [default: ${r.usedDefaultBuckets}]` : '';
    console.log(`  ${label.padEnd(11)} know=${know30}/${total30}  calib=${r.calibrationEstimate}  pub=${r.publicEstimate}  range=${r.rangeLow}–${r.rangeHigh}  level=${r.levelLabel}${defaults}`);
  }
  exampleResult('weak',        3);   //  10% → pub ≈  6000 → casual
  exampleResult('average',     9);   //  30% → pub ≈ 18000 → engaged
  exampleResult('strong',     19);   // ≈63% → pub ≈ 38000 → erudite
  exampleResult('exceptional', 25);  // ≈83% → pub ≈ 50000 → master
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Total: ${passed + failed}  PASS: ${passed}  FAIL: ${failed}`);
if (failed > 0) process.exit(1);
