/**
 * Sanity checks for createMixedSessionDeck.
 * Run: node scripts/sanity_sampler.mjs
 * Reads public/data/play_pools.json directly.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const pools = JSON.parse(readFileSync(join(ROOT, 'public/data/play_pools.json'), 'utf-8'));

// ── Inline sampler (mirrors play-sampler.ts) ──────────────────────────────────

const SESSION_CARD_COUNT = 100;
const KZ_CA_TARGET = 30;

const TOP_BUCKETS = [
  { min: 1,    max: 100,  need: 20 },
  { min: 101,  max: 500,  need: 20 },
  { min: 501,  max: 1500, need: 20 },
  { min: 1501, max: 5000, need: 20 },
];

const KZ_BUCKETS = [
  { min: 1,    max: 100,  need: 12 },
  { min: 101,  max: 500,  need: 12 },
  { min: 501,  max: 1500, need: 12 },
  { min: 1501, max: 5000, need: 10 },
];

// Sensitive occupations (must match SENSITIVE_OCCUPATIONS in localized-labels.ts)
const SENSITIVE_OCCUPATIONS = new Set(['PORNOGRAPHIC ACTOR']);

function isSensitive(p) {
  return SENSITIVE_OCCUPATIONS.has(p.occupation ?? '');
}

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
  const shuffled = shuffle(candidates);
  const picked = shuffled.slice(0, count);
  picked.forEach(p => usedIds.add(p.wikidata_id));
  return picked;
}

function createDeck(region) {
  const safe = {
    top_30000: pools.top_30000.filter(p => !isSensitive(p)),
    ru_quota:  pools.ru_quota.filter(p  => !isSensitive(p)),
    kz_quota:  pools.kz_quota.filter(p  => !isSensitive(p)),
    hpi_quota: pools.hpi_quota.filter(p => !isSensitive(p)),
    kz_ca_top: (pools.kz_ca_top ?? []).filter(p => !isSensitive(p)),
  };

  const usedIds = new Set();
  const deck = [];

  if (region === 'kz') {
    for (const bucket of KZ_BUCKETS) {
      const pool = safe.top_30000.filter(p => p.global_rank >= bucket.min && p.global_rank <= bucket.max);
      let picked = sampleUnique(pool, bucket.need, usedIds);
      if (picked.length < bucket.need) picked = [...picked, ...sampleUnique(safe.top_30000, bucket.need - picked.length, usedIds)];
      deck.push(...picked);
    }
    {
      let picked = sampleUnique(safe.ru_quota, 18, usedIds);
      if (picked.length < 18) picked = [...picked, ...sampleUnique(safe.top_30000, 18 - picked.length, usedIds)];
      deck.push(...picked);
    }
    {
      let slot = sampleUnique(safe.kz_ca_top, KZ_CA_TARGET, usedIds);
      if (slot.length < KZ_CA_TARGET) slot = [...slot, ...sampleUnique(safe.kz_quota, KZ_CA_TARGET - slot.length, usedIds)];
      if (slot.length < KZ_CA_TARGET) slot = [...slot, ...sampleUnique(safe.top_30000, KZ_CA_TARGET - slot.length, usedIds)];
      deck.push(...slot);
    }
    {
      let picked = sampleUnique(safe.hpi_quota, 6, usedIds);
      if (picked.length < 6) picked = [...picked, ...sampleUnique(safe.top_30000, 6 - picked.length, usedIds)];
      deck.push(...picked);
    }
  } else {
    for (const bucket of TOP_BUCKETS) {
      const pool = safe.top_30000.filter(p => p.global_rank >= bucket.min && p.global_rank <= bucket.max);
      let picked = sampleUnique(pool, bucket.need, usedIds);
      if (picked.length < bucket.need) picked = [...picked, ...sampleUnique(safe.top_30000, bucket.need - picked.length, usedIds)];
      deck.push(...picked);
    }
    {
      let picked = sampleUnique(safe.ru_quota, 8, usedIds);
      if (picked.length < 8) picked = [...picked, ...sampleUnique(safe.top_30000, 8 - picked.length, usedIds)];
      deck.push(...picked);
    }
    {
      let picked = sampleUnique(safe.kz_quota, 8, usedIds);
      if (picked.length < 8) picked = [...picked, ...sampleUnique(safe.top_30000, 8 - picked.length, usedIds)];
      deck.push(...picked);
    }
    {
      let picked = sampleUnique(safe.hpi_quota, 4, usedIds);
      if (picked.length < 4) picked = [...picked, ...sampleUnique(safe.top_30000, 4 - picked.length, usedIds)];
      deck.push(...picked);
    }
  }

  return shuffle(deck);
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

const KZ_CA_QIDs = new Set((pools.kz_ca_top ?? []).map(p => p.wikidata_id));

// ── 100 runs: default ─────────────────────────────────────────────────────────
console.log('\n── Default mode (100 runs) ──');
{
  let allLength100 = true;
  let anyDuplicates = false;
  let anySensitive = false;

  for (let i = 0; i < 100; i++) {
    const deck = createDeck(undefined);
    if (deck.length !== SESSION_CARD_COUNT) { allLength100 = false; }
    const ids = deck.map(p => p.wikidata_id);
    if (new Set(ids).size !== ids.length) { anyDuplicates = true; }
    if (deck.some(p => isSensitive(p))) { anySensitive = true; }
  }

  check('all decks length = 100',     allLength100);
  check('no duplicate QIDs',          !anyDuplicates);
  check('no sensitive figures',       !anySensitive);
}

// ── 100 runs: region=kz ───────────────────────────────────────────────────────
console.log('\n── region=kz (100 runs) ──');
{
  let allLength100 = true;
  let anyDuplicates = false;
  let anySensitive = false;
  let minKzCa = Infinity;
  let maxKzCa = 0;

  for (let i = 0; i < 100; i++) {
    const deck = createDeck('kz');
    if (deck.length !== SESSION_CARD_COUNT) { allLength100 = false; }
    const ids = deck.map(p => p.wikidata_id);
    if (new Set(ids).size !== ids.length) { anyDuplicates = true; }
    if (deck.some(p => isSensitive(p))) { anySensitive = true; }
    const kzCaCount = deck.filter(p => KZ_CA_QIDs.has(p.wikidata_id)).length;
    if (kzCaCount < minKzCa) minKzCa = kzCaCount;
    if (kzCaCount > maxKzCa) maxKzCa = kzCaCount;
  }

  check('all decks length = 100',       allLength100);
  check('no duplicate QIDs',            !anyDuplicates);
  check('no sensitive figures',         !anySensitive);
  check(`kz_ca_top always ≥ 26 (all ${pools.kz_ca_top?.length ?? 0} available)`,
    minKzCa >= Math.min(26, KZ_CA_QIDs.size),
    `min=${minKzCa} max=${maxKzCa}`);
  check('kz_ca_top never exceeds pool size',
    maxKzCa <= KZ_CA_QIDs.size,
    `max=${maxKzCa} pool=${KZ_CA_QIDs.size}`);
}

// ── Pool stats ────────────────────────────────────────────────────────────────
console.log('\n── Pool sizes ──');
console.log(`  top_30000 : ${pools.top_30000.length.toLocaleString()}`);
console.log(`  ru_quota  : ${pools.ru_quota.length}`);
console.log(`  kz_quota  : ${pools.kz_quota.length}`);
console.log(`  hpi_quota : ${pools.hpi_quota.length}`);
console.log(`  kz_ca_top : ${(pools.kz_ca_top ?? []).length}`);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Total: ${passed + failed}  PASS: ${passed}  FAIL: ${failed}`);
if (failed > 0) process.exit(1);
