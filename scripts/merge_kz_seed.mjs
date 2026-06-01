/**
 * Stage 5.14d — MERGE 23 validated KZ seed additions into play_pools.json kz_ca_top.
 * Direct patch: only kz_ca_top is modified; the other 4 pools stay byte-for-byte.
 * Verifies pool integrity before writing. Run: node scripts/merge_kz_seed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PP_PATH = join(ROOT, 'public/data/play_pools.json');
const pools = JSON.parse(readFileSync(PP_PATH, 'utf-8'));
const extra = JSON.parse(readFileSync(join(ROOT, 'data/processed/kz_ca_extra_seed.json'), 'utf-8'));

// snapshot the 4 pools that must NOT change
const before = {
  top_30000: JSON.stringify(pools.top_30000),
  ru_quota:  JSON.stringify(pools.ru_quota),
  kz_quota:  JSON.stringify(pools.kz_quota),
  hpi_quota: JSON.stringify(pools.hpi_quota),
};
const kzCaBefore = pools.kz_ca_top.length;

// dedup guard: extra must not collide with ANY existing pool QID
const allExistingQids = new Set();
for (const arr of Object.values(pools)) if (Array.isArray(arr)) arr.forEach(p => allExistingQids.add(p.wikidata_id));

const toAdd = [];
const collisions = [];
const seenNew = new Set();
for (const rec of extra) {
  if (allExistingQids.has(rec.wikidata_id)) { collisions.push(rec.wikidata_id); continue; }
  if (seenNew.has(rec.wikidata_id)) { collisions.push(rec.wikidata_id+' (intra-dup)'); continue; }
  seenNew.add(rec.wikidata_id);
  toAdd.push(rec);
}

if (collisions.length) {
  console.log(`⛔ Collisions detected, aborting: ${collisions.join(', ')}`);
  process.exit(1);
}

// append to kz_ca_top
pools.kz_ca_top = [...pools.kz_ca_top, ...toAdd];

// verify the other 4 pools are untouched (semantic identity)
const after = {
  top_30000: JSON.stringify(pools.top_30000),
  ru_quota:  JSON.stringify(pools.ru_quota),
  kz_quota:  JSON.stringify(pools.kz_quota),
  hpi_quota: JSON.stringify(pools.hpi_quota),
};
for (const k of Object.keys(before)) {
  if (before[k] !== after[k]) { console.log(`⛔ Pool ${k} changed — aborting!`); process.exit(1); }
}

// global dup check across whole file
const finalQids = [];
for (const arr of Object.values(pools)) if (Array.isArray(arr)) arr.forEach(p => finalQids.push(p.wikidata_id));
const dupCheck = finalQids.length - new Set(finalQids).size;
// Note: cross-pool duplicates (e.g. a QID in both top_30000 and a quota) are allowed by design.
// We only require: no NEW duplicate introduced into kz_ca_top itself.
const kzCaQids = pools.kz_ca_top.map(p=>p.wikidata_id);
const kzCaDup = kzCaQids.length - new Set(kzCaQids).size;
if (kzCaDup > 0) { console.log(`⛔ kz_ca_top has ${kzCaDup} duplicate QIDs — aborting!`); process.exit(1); }

// write compact, unicode-preserved (matches Python json.dumps ensure_ascii=False separators=(",",":"))
writeFileSync(PP_PATH, JSON.stringify(pools), 'utf-8');

console.log('✅ MERGE COMPLETE');
console.log(`  kz_ca_top: ${kzCaBefore} → ${pools.kz_ca_top.length} (+${toAdd.length})`);
console.log(`  top_30000/ru_quota/kz_quota/hpi_quota: UNCHANGED (verified)`);
console.log(`  kz_ca_top duplicate QIDs: ${kzCaDup}`);
console.log(`  total records in file: ${finalQids.length}`);
