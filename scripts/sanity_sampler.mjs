/**
 * Sanity checks for createMixedSessionDeck with calibration block.
 * Run: node scripts/sanity_sampler.mjs
 * Reads public/data/play_pools.json directly.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const pools = JSON.parse(readFileSync(join(ROOT, 'public/data/play_pools.json'), 'utf-8'));

// ── Constants (mirrors play-sampler.ts) ───────────────────────────────────────

const SESSION_CARD_COUNT  = 100;
const CALIB_SIZE          = 30;
const CALIB_EASY          = 10;
const CALIB_MEDIUM        = 12;
const CALIB_HARD          = 8;
const CALIB_DOMAIN_MAX    = 5;
const CALIB_SUBDOMAIN_MAX = 3;
const CALIB_ERA_MAX       = 8;
const CALIB_REGION_MAX    = 8;
const CALIB_KZ_CA_TARGET  = 6;
const CALIB_KZ_CA_MAX     = 8;
const KZ_CA_REMAINING     = 24;

const TOP_BUCKETS_70 = [
  { min: 1,    max: 100,  need: 14 },
  { min: 101,  max: 500,  need: 14 },
  { min: 501,  max: 1500, need: 14 },
  { min: 1501, max: 5000, need: 14 },
];
const KZ_BUCKETS_70 = [
  { min: 1,    max: 100,  need: 8 },
  { min: 101,  max: 500,  need: 8 },
  { min: 501,  max: 1500, need: 8 },
  { min: 1501, max: 5000, need: 8 },
];

const SENSITIVE_OCCUPATIONS = new Set(['PORNOGRAPHIC ACTOR']);
function isSensitive(p) { return SENSITIVE_OCCUPATIONS.has(p.occupation ?? ''); }

// ── Core helpers ──────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sampleUnique(items, count, usedIds) {
  const candidates = items.filter(p => !usedIds.has(p.wikidata_id));
  const picked = shuffle(candidates).slice(0, count);
  picked.forEach(p => usedIds.add(p.wikidata_id));
  return picked;
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
  const relaxLog = { mode: region, relaxedEra: 0, relaxedSub: 0, relaxedDomain: 0, relaxedDifficulty: 0 };

  function isConstrained(p, { relaxEra = false, relaxSub = false, relaxDomain = false, relaxRegion = false } = {}) {
    if (blockIds.has(p.wikidata_id)) return true;
    const d   = p.domain       || 'unknown';
    const sub = p.subdomain;
    const era = p.era_bucket   || 'unknown';
    const reg = p.macro_region || 'unknown';
    if (!relaxDomain && (domainCount[d]   ?? 0) >= CALIB_DOMAIN_MAX) return true;
    if (!relaxSub    && sub && (subdomainCount[sub] ?? 0) >= CALIB_SUBDOMAIN_MAX) return true;
    if (!relaxEra    && (eraCount[era]    ?? 0) >= CALIB_ERA_MAX) return true;
    if (!relaxRegion && region === 'global' && (macroRegionCount[reg] ?? 0) >= CALIB_REGION_MAX) return true;
    if (kzCaIds.has(p.wikidata_id) && kzCaCount >= CALIB_KZ_CA_MAX) return true;
    return false;
  }

  function addCard(p) {
    block.push(p); blockIds.add(p.wikidata_id); usedIds.add(p.wikidata_id);
    const d   = p.domain       || 'unknown';
    const sub = p.subdomain;
    const era = p.era_bucket   || 'unknown';
    const reg = p.macro_region || 'unknown';
    domainCount[d]        = (domainCount[d]        ?? 0) + 1;
    eraCount[era]         = (eraCount[era]          ?? 0) + 1;
    macroRegionCount[reg] = (macroRegionCount[reg]  ?? 0) + 1;
    if (sub) subdomainCount[sub] = (subdomainCount[sub] ?? 0) + 1;
    const dk = p.difficulty_bucket ?? 'unknown';
    diffCount[dk] = (diffCount[dk] ?? 0) + 1;
    if (kzCaIds.has(p.wikidata_id)) kzCaCount++;
  }

  function fillRelaxed(flags, logKey) {
    if (block.length >= CALIB_SIZE) return;
    const before = block.length;
    for (const p of shuffled) {
      if (block.length >= CALIB_SIZE) break;
      if (!isConstrained(p, flags)) addCard(p);
    }
    relaxLog[logKey] += block.length - before;
  }

  // Phase 1 (kz): seed with kz_ca
  if (region === 'kz') {
    for (const p of shuffled) {
      if (kzCaCount >= CALIB_KZ_CA_TARGET) break;
      if (kzCaIds.has(p.wikidata_id) && !isConstrained(p)) addCard(p);
    }
  }

  // Phase 2: fill by difficulty targets, prefer non-unknown era
  for (const [diff, target] of [['easy', CALIB_EASY], ['medium', CALIB_MEDIUM], ['hard', CALIB_HARD]]) {
    for (const p of shuffled) {
      if ((diffCount[diff] ?? 0) >= target) break;
      if (p.difficulty_bucket === diff && (p.era_bucket ?? 'unknown') !== 'unknown' && !isConstrained(p)) addCard(p);
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

  // Relaxation phases (era → subdomain → domain → last resort)
  // Content sensitivity (hard/soft) is NEVER relaxed.
  fillRelaxed({ relaxEra: true },                                          'relaxedEra');
  fillRelaxed({ relaxEra: true, relaxSub: true },                         'relaxedSub');
  fillRelaxed({ relaxEra: true, relaxSub: true, relaxDomain: true },      'relaxedDomain');

  if (block.length < CALIB_SIZE) {
    const before = block.length;
    for (const p of shuffled) {
      if (block.length >= CALIB_SIZE) break;
      if (!blockIds.has(p.wikidata_id)) addCard(p);
    }
    relaxLog.relaxedDifficulty += block.length - before;
  }

  return { block: shuffle(block), relaxLog };
}

// ── Full deck builder (mirrors createMixedSessionDeck) ────────────────────────

function createDeck(region) {
  const safe = {
    top_30000: pools.top_30000.filter(p => !isSensitive(p)),
    ru_quota:  pools.ru_quota.filter(p  => !isSensitive(p)),
    kz_quota:  pools.kz_quota.filter(p  => !isSensitive(p)),
    hpi_quota: pools.hpi_quota.filter(p => !isSensitive(p)),
    kz_ca_top: (pools.kz_ca_top ?? []).filter(p => !isSensitive(p)),
  };
  const kzCaIds = new Set(safe.kz_ca_top.map(p => p.wikidata_id));
  const usedIds = new Set();

  const { block: calib, relaxLog } = createCalibrationBlock(safe, kzCaIds, region ?? 'global', usedIds);
  const remaining = [];

  function pick(pool, n) {
    let picked = sampleUnique(pool, n, usedIds);
    if (picked.length < n) picked = [...picked, ...sampleUnique(safe.top_30000, n - picked.length, usedIds)];
    remaining.push(...picked);
  }
  function pickBuckets(buckets) {
    for (const b of buckets) {
      pick(safe.top_30000.filter(p => p.global_rank >= b.min && p.global_rank <= b.max), b.need);
    }
  }

  if (region === 'kz') {
    pickBuckets(KZ_BUCKETS_70);
    pick(safe.ru_quota, 12);
    {
      let slot = sampleUnique(safe.kz_ca_top, KZ_CA_REMAINING, usedIds);
      if (slot.length < KZ_CA_REMAINING) slot = [...slot, ...sampleUnique(safe.kz_quota, KZ_CA_REMAINING - slot.length, usedIds)];
      if (slot.length < KZ_CA_REMAINING) slot = [...slot, ...sampleUnique(safe.top_30000, KZ_CA_REMAINING - slot.length, usedIds)];
      remaining.push(...slot);
    }
    pick(safe.hpi_quota, 2);
  } else {
    pickBuckets(TOP_BUCKETS_70);
    pick(safe.ru_quota, 6);
    pick(safe.kz_quota, 5);
    pick(safe.hpi_quota, 3);
  }

  return { deck: [...calib, ...shuffle(remaining)], relaxLog };
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function check(label, condition, detail = '') {
  if (condition) { console.log(`  PASS  ${label}`); passed++; }
  else           { console.log(`  FAIL  ${label}${detail ? '  →  ' + detail : ''}`); failed++; }
}

function maxCount(arr, key) {
  const counts = {};
  for (const p of arr) {
    const v = p[key] || 'unknown';
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return Math.max(0, ...Object.values(counts));
}

// Subdomain-specific: skip null/empty (they carry no subdomain constraint)
function maxNamedSubdomainCount(arr) {
  const counts = {};
  for (const p of arr) {
    const sub = p.subdomain;
    if (!sub) continue;
    counts[sub] = (counts[sub] ?? 0) + 1;
  }
  return Object.keys(counts).length === 0 ? 0 : Math.max(...Object.values(counts));
}

const KZ_CA_QIDs = new Set((pools.kz_ca_top ?? []).map(p => p.wikidata_id));

// ── Run 100 iterations, collect stats ─────────────────────────────────────────

function runSuite(label, region) {
  console.log(`\n── ${label} (100 runs) ──`);

  let allLength100        = true;
  let anyDuplicates       = false;
  let anySensitive        = false;
  let anyFirst30Wrong     = false;
  let anyFirst30Sensitive = false;
  let domainMaxViolation  = false;
  let subdomainViolation  = false;
  let eraViolation        = false;
  let regionViolation     = false;
  let minKzCa30 = Infinity, maxKzCa30 = 0;
  let minKzCaTotal = Infinity;
  let diffStats = { easy: 0, medium: 0, hard: 0 };
  let sampleFirst30 = null;
  const totalRelax = { relaxedEra: 0, relaxedSub: 0, relaxedDomain: 0, relaxedDifficulty: 0 };

  for (let i = 0; i < 100; i++) {
    const { deck, relaxLog } = createDeck(region);
    const first = deck.slice(0, CALIB_SIZE);
    totalRelax.relaxedEra        += relaxLog.relaxedEra;
    totalRelax.relaxedSub        += relaxLog.relaxedSub;
    totalRelax.relaxedDomain     += relaxLog.relaxedDomain;
    totalRelax.relaxedDifficulty += relaxLog.relaxedDifficulty;
    const ids   = deck.map(p => p.wikidata_id);

    if (deck.length !== SESSION_CARD_COUNT)          allLength100 = false;
    if (new Set(ids).size !== ids.length)            anyDuplicates = true;
    if (deck.some(p => isSensitive(p)))              anySensitive = true;
    if (first.length !== CALIB_SIZE)                 anyFirst30Wrong = true;
    if (first.some(p => p.content_sensitivity !== 'normal')) anyFirst30Sensitive = true;
    if (maxCount(first, 'domain')       > CALIB_DOMAIN_MAX)    domainMaxViolation  = true;
    if (maxNamedSubdomainCount(first)    > CALIB_SUBDOMAIN_MAX) subdomainViolation  = true;
    if (maxCount(first, 'era_bucket')   > CALIB_ERA_MAX)       eraViolation        = true;
    if (region !== 'kz' && maxCount(first, 'macro_region') > CALIB_REGION_MAX) regionViolation = true;

    const kzCa30 = first.filter(p => KZ_CA_QIDs.has(p.wikidata_id)).length;
    if (kzCa30 < minKzCa30) minKzCa30 = kzCa30;
    if (kzCa30 > maxKzCa30) maxKzCa30 = kzCa30;

    const kzCaTotal = deck.filter(p => KZ_CA_QIDs.has(p.wikidata_id)).length;
    if (kzCaTotal < minKzCaTotal) minKzCaTotal = kzCaTotal;

    for (const p of first) {
      const d = p.difficulty_bucket ?? 'unknown';
      if (d in diffStats) diffStats[d] += 1 / 100;
    }

    if (i === 0) sampleFirst30 = first;
  }

  // Core checks
  check('all decks length = 100',     allLength100);
  check('unique QIDs = 100',          !anyDuplicates);
  check('no hard-sensitive in deck',  !anySensitive);
  check('first 30 length = 30',       !anyFirst30Wrong);
  check('first 30 no soft-sensitive', !anyFirst30Sensitive);
  check(`first 30 domain max ≤ ${CALIB_DOMAIN_MAX}`,    !domainMaxViolation);
  check(`first 30 subdomain max ≤ ${CALIB_SUBDOMAIN_MAX}`, !subdomainViolation);
  check(`first 30 era max ≤ ${CALIB_ERA_MAX}`,          !eraViolation);

  if (region !== 'kz') {
    check(`first 30 macro_region max ≤ ${CALIB_REGION_MAX}`, !regionViolation);
  } else {
    check(`kz_ca in first 30 always 5–8 (min=${minKzCa30} max=${maxKzCa30})`,
      minKzCa30 >= 5 && maxKzCa30 <= 8, `min=${minKzCa30} max=${maxKzCa30}`);
    check(`kz_ca total in deck always ≥ 20 (min=${minKzCaTotal})`,
      minKzCaTotal >= 20, `min=${minKzCaTotal}`);
  }

  // Difficulty distribution in first 30 (informational)
  console.log(`  INFO  avg first-30 difficulty: easy=${diffStats.easy.toFixed(1)} medium=${diffStats.medium.toFixed(1)} hard=${diffStats.hard.toFixed(1)}`);
  // Relaxation log across 100 runs
  const anyRelaxed = Object.values(totalRelax).some(v => v > 0);
  if (anyRelaxed) {
    console.log(`  WARN  constraints relaxed across 100 runs: era=${totalRelax.relaxedEra} subdomain=${totalRelax.relaxedSub} domain=${totalRelax.relaxedDomain} lastResort=${totalRelax.relaxedDifficulty}`);
  } else {
    console.log(`  INFO  no constraints relaxed in 100 runs`);
  }

  // Sample first 30 domain distribution (informational, run 0)
  if (sampleFirst30) {
    const domainCounts = {};
    for (const p of sampleFirst30) {
      const d = p.domain || 'unknown';
      domainCounts[d] = (domainCounts[d] ?? 0) + 1;
    }
    const domainStr = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([d, n]) => `${d}:${n}`)
      .join(' ');
    console.log(`  INFO  sample first-30 domains: ${domainStr}`);
  }
}

runSuite('Default mode', undefined);
runSuite('region=kz',    'kz');

// ── Pool stats ────────────────────────────────────────────────────────────────
console.log('\n── Pool sizes ──');
console.log(`  top_30000 : ${pools.top_30000.length.toLocaleString()}`);
console.log(`  ru_quota  : ${pools.ru_quota.length}`);
console.log(`  kz_quota  : ${pools.kz_quota.length}`);
console.log(`  hpi_quota : ${pools.hpi_quota.length}`);
console.log(`  kz_ca_top : ${(pools.kz_ca_top ?? []).length}`);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Total: ${passed + failed}  PASS: ${passed}  FAIL: ${failed}`);
if (failed > 0) process.exit(1);
