/**
 * Stage 6.5 — dynamic region-aware sampling tests (exercises the REAL sampler).
 * Run: node --loader ./scripts/ts-import-loader.mjs scripts/test_region_sampling.mjs
 * (the loader resolves the sampler's extensionless TS imports; node strips types).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createInitialSessionDeck,
  normalizeRegionParam,
  REGION_PARAMS,
  CALIB_SIZE,
} from '../src/lib/play/play-sampler.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pools = JSON.parse(readFileSync(join(__dirname, '../public/data/play_pools.json'), 'utf8'));

let PASS = 0, FAIL = 0;
const check = (name, cond, extra = '') => {
  if (cond) { PASS++; console.log(`  PASS  ${name}`); }
  else { FAIL++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

const RUNS = 25;
const MR = {
  russia_cis: ['ru_cis'], europe: ['western_europe'], north_america: ['usa_canada'],
  latin_america: ['latin_america'], east_asia: ['east_asia'], southeast_asia: ['east_asia'],
  south_asia: ['south_asia'], middle_east_north_africa: ['middle_east', 'north_africa'],
};
const EXCL = { europe: 'United Kingdom', north_america: 'United States' };

// collect first-30 decks over many runs
function decks(region, n = RUNS) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(createInitialSessionDeck(pools, region));
  return out;
}

// ── A: region param plumbing ────────────────────────────────────────────────
console.log('\n── A: region params / normalization ──');
const EXPECTED = ['global','kz','russia_cis','europe','north_america','latin_america','east_asia','southeast_asia','south_asia','middle_east_north_africa'];
check('A1: REGION_PARAMS = expected 10', EXPECTED.every(p => REGION_PARAMS.includes(p)) && REGION_PARAMS.length === 10);
check('A2: explicit region accepted', normalizeRegionParam('europe', 'global') === 'europe');
check('A3: unknown region → fallback', normalizeRegionParam('atlantis', 'global') === 'global');
check('A4: missing region → fallback (kk→kz)', normalizeRegionParam(undefined, 'kz') === 'kz');
check('A5: array param uses first', normalizeRegionParam(['russia_cis','x'], 'global') === 'russia_cis');
// RegionPicker id → param mapping (mirror of component map); all must be valid params
const PICKER = { kazakhstan_central_asia:'kz', other:'global', russia_cis:'russia_cis', europe:'europe',
  north_america:'north_america', latin_america:'latin_america', east_asia:'east_asia',
  southeast_asia:'southeast_asia', south_asia:'south_asia', middle_east_north_africa:'middle_east_north_africa' };
check('A6: every RegionPicker id maps to a valid region param',
  Object.values(PICKER).every(p => REGION_PARAMS.includes(p)) && Object.keys(PICKER).length === 10);

// ── B: every region deck is exactly CALIB_SIZE ──────────────────────────────
console.log('\n── B: deck size ──');
for (const r of EXPECTED) {
  const ok = decks(r, 5).every(d => d.length === CALIB_SIZE);
  check(`B: ${r} → ${CALIB_SIZE}-card calibration deck`, ok);
}

// ── C: no globally-HARD cards in first 30 for global + generic boost ────────
//     (kz is exempt: curated kz_ca seeds may be globally hard / isRegionalSeed)
console.log('\n── C: no hard cards in first-30 (global + generic boost) ──');
for (const r of ['global', ...Object.keys(MR)]) {
  let maxHard = 0;
  for (const d of decks(r)) maxHard = Math.max(maxHard, d.filter(p => p.difficulty_bucket === 'hard').length);
  check(`C: ${r} → 0 hard in first 30 (max over ${RUNS} runs)`, maxHard === 0, `maxHard=${maxHard}`);
}

// ── D: generic boost cards are NOT isRegionalSeed; kz seeds ARE ─────────────
console.log('\n── D: isRegionalSeed only for kz ──');
for (const r of ['global', ...Object.keys(MR)]) {
  const anySeed = decks(r).some(d => d.some(p => p.isRegionalSeed === true));
  check(`D: ${r} → no isRegionalSeed cards`, !anySeed);
}
{
  const kzSeedCounts = decks('kz').map(d => d.filter(p => p.isRegionalSeed === true).length);
  const maxSeed = Math.max(...kzSeedCounts), minSeed = Math.min(...kzSeedCounts);
  check('D: kz → isRegionalSeed present (curated seed)', minSeed > 0, `min=${minSeed}`);
  check('D: kz → isRegionalSeed ≤ 10 target (Stage 6.5)', maxSeed <= 10, `max=${maxSeed}`);
}

// ── E: per-region caps (excl USA/UK) ────────────────────────────────────────
console.log('\n── E: regional boost caps ──');
function regionalCount(deck, region) {
  const macros = MR[region];
  const excl = EXCL[region];
  return deck.filter(p => macros.includes(p.macro_region) && p.bplace_country !== excl).length;
}
// Europe: ≤8 western_europe (boost cap == diversity cap), and UK must NOT be boosted (≈0)
{
  let maxEu = 0, maxUk = 0;
  for (const d of decks('europe')) {
    maxEu = Math.max(maxEu, regionalCount(d, 'europe'));
    maxUk = Math.max(maxUk, d.filter(p => p.bplace_country === 'United Kingdom').length);
  }
  check('E: europe → western_europe (non-UK) ≤ 8', maxEu <= 8, `max=${maxEu}`);
  check('E: europe → UK not boosted (≤1 incidental)', maxUk <= 1, `maxUK=${maxUk}`);
}
// North America: Canada boost ≤ 4 (USA excluded from boost)
{
  let maxCa = 0;
  for (const d of decks('north_america')) maxCa = Math.max(maxCa, d.filter(p => p.bplace_country === 'Canada').length);
  check('E: north_america → Canada boost ≤ 4', maxCa <= 4, `maxCanada=${maxCa}`);
}
// generic cap 8 for the rest
for (const r of ['russia_cis','latin_america','east_asia','southeast_asia','south_asia','middle_east_north_africa']) {
  let mx = 0;
  for (const d of decks(r)) mx = Math.max(mx, regionalCount(d, r));
  check(`E: ${r} → regional ≤ 8`, mx <= 8, `max=${mx}`);
}

// ── F: boost actually shifts the mix (selected region appears more than baseline) ──
console.log('\n── F: boost is effective (regional presence rises vs global) ──');
function avgRegional(region, sampleRegionForCount) {
  const ds = decks(region);
  return ds.reduce((s, d) => s + regionalCount(d, sampleRegionForCount), 0) / ds.length;
}
for (const r of ['russia_cis','east_asia','south_asia','latin_america','middle_east_north_africa']) {
  const boosted = avgRegional(r, r);
  const baseline = avgRegional('global', r);
  check(`F: ${r} → avg regional in boost (${boosted.toFixed(1)}) > global baseline (${baseline.toFixed(1)})`, boosted > baseline + 1);
}

// ── G: KZ / global regression (frozen behavior intact) ──────────────────────
console.log('\n── G: kz/global regression ──');
{
  const g = decks('global', 10);
  check('G: global → 30 cards, 0 hard, 0 isRegionalSeed',
    g.every(d => d.length === 30 && d.every(p => p.difficulty_bucket !== 'hard') && d.every(p => !p.isRegionalSeed)));
  // global diversity: no macro_region exceeds 8 in first 30
  let maxAny = 0;
  for (const d of g) {
    const c = {}; for (const p of d) c[p.macro_region] = (c[p.macro_region]||0)+1;
    maxAny = Math.max(maxAny, ...Object.values(c));
  }
  check('G: global → every macro_region ≤ 8 (diversity cap)', maxAny <= 8, `max=${maxAny}`);
}

console.log(`\n${'─'.repeat(56)}\nTotal: ${PASS + FAIL}  PASS: ${PASS}  FAIL: ${FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
