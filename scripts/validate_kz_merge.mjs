/**
 * Stage 5.14d — PRE-MERGE VALIDATION of 46 KZ seed candidates.
 * 30 wikidata_new (kz_candidates_resolved.csv) + 16 wikidata_new_retry (retry CSV).
 * Independently re-validates each against Wikidata: P31, label sanity, dedup.
 * Builds validated full records → data/processed/kz_ca_extra_seed.json (only if all pass).
 * Does NOT modify play_pools.json. Run: node scripts/validate_kz_merge.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseCSV(t){const L=t.trim().split('\n');const H=L[0].split(',');return L.slice(1).map(line=>{const v=[];let c='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){c+='"';i++;}else q=!q;}else if(ch===','&&!q){v.push(c);c='';}else c+=ch;}v.push(c);const o={};H.forEach((h,i)=>o[h]=v[i]??'');return o;});}

// ── Load candidates ────────────────────────────────────────────────────────────
const r30 = parseCSV(readFileSync(join(ROOT,'data/processed/kz_candidates_resolved.csv'),'utf-8'))
  .filter(r => r.source_status === 'wikidata_new');
const r16 = parseCSV(readFileSync(join(ROOT,'data/processed/kz_verified_candidates_resolved_retry.csv'),'utf-8'))
  .filter(r => r.retry_status === 'wikidata_new_retry');

const FORBIDDEN = new Set(['Q131690','Q223600','Q241399','Q521023','Q1209360']);

// Normalize both sources into a common shape
const cands = [];
for (const r of r30) {
  cands.push({
    src:'30', qid:r.wikidata_id, name:r.name, name_ru:r.name_ru,
    occupation:r.occupation, bplace_country:r.bplace_country, birthyear:r.birthyear,
    domain:r.domain, subdomain:r.subdomain, difficulty:r.difficulty_bucket,
    // ru/kk labels may be embedded in note as " | ru:X" " | kk:Y"
    note:r.note,
  });
}
for (const r of r16) {
  cands.push({
    src:'16', qid:r.retry_wikidata_id, name:r.name, name_ru:r.name_ru,
    occupation:r.retry_occupation, bplace_country:r.retry_bplace_country, birthyear:r.retry_birthyear,
    deathyear:r.retry_deathyear, domain:r.retry_domain, subdomain:'', difficulty:r.retry_difficulty_bucket,
    label_en:r.retry_label_en, label_ru:r.retry_label_ru, label_kk:r.retry_label_kk,
  });
}
console.log(`Candidates: ${cands.length} (30 + 16)`);

// ── Pool dedup sets ────────────────────────────────────────────────────────────
const pools = JSON.parse(readFileSync(join(ROOT,'public/data/play_pools.json'),'utf-8'));
const poolQidArrays = {};
for (const [k,arr] of Object.entries(pools)) if (Array.isArray(arr)) poolQidArrays[k] = new Set(arr.map(p=>p.wikidata_id));
const allPoolQids = new Set();
for (const s of Object.values(poolQidArrays)) for (const q of s) allPoolQids.add(q);

// ── Ruler allow-list (P31 may ≠ Q5; label must still match) ────────────────────
const RULER_ALLOW = new Set(['Tole bi','Kultegin','Tonyukuk']);

// ── Matchers ───────────────────────────────────────────────────────────────────
function deKazakh(s){return s.replace(/қ/g,'к').replace(/ұ/g,'у').replace(/ү/g,'у').replace(/ә/g,'а').replace(/ө/g,'о').replace(/ң/g,'н').replace(/ғ/g,'г').replace(/і/g,'и').replace(/һ/g,'х').replace(/ё/g,'е');}
function norm(s){return deKazakh((s||'').toLowerCase()).replace(/[^a-zа-я0-9\s-]/gi,'').replace(/\s+/g,' ').trim();}
function lcs(a,b){if(!a||!b)return 0;const m=a.length,n=b.length;let p=new Array(n+1).fill(0),best=0;for(let i=1;i<=m;i++){const c=new Array(n+1).fill(0);for(let j=1;j<=n;j++){if(a[i-1]===b[j-1]){c[j]=p[j-1]+1;if(c[j]>best)best=c[j];}}p=c;}return best;}
function labelMatch(cand, labels){
  const ct = norm(`${cand.name_ru} ${cand.name}`);
  for (const lab of labels){ const nl=norm(lab); if(!nl)continue;
    if (lcs(ct,nl)>=5) return true;
    for (const tk of ct.split(' ')) if(tk.length>=4 && nl.includes(tk)) return true;
  }
  return false;
}

// ── Wikidata batch ─────────────────────────────────────────────────────────────
async function wdFetch(url){for(let a=0;a<5;a++){try{const ct=new AbortController();const t=setTimeout(()=>ct.abort(),15000);const r=await fetch(url,{signal:ct.signal,headers:{'User-Agent':'EruditeApp/1.0 (kz-validate)'}});clearTimeout(t);if(!r.ok){await sleep(700);continue;}return await r.json();}catch{await sleep(700);}}return null;}
async function wdEntities(ids){if(!ids.length)return{};const j=await wdFetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&format=json&props=labels|aliases|claims&languages=en|ru|kk`);return j?.entities??{};}
function qAll(e,p){return(e?.claims?.[p]??[]).map(s=>s?.mainsnak?.datavalue?.value?.id).filter(Boolean);}
function claim(e,p){return e?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value??null;}
function q1(e,p){return e?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value?.id??null;}

// Non-person P31 blocklist (animals, taxa, places, orgs, disambig, categories)
const NONPERSON_P31 = new Set([
  'Q16521','Q4167410','Q4167836','Q43229','Q15642541','Q2221906','Q15284','Q56061',
  'Q23038290','Q427626','Q7432','Q34740','Q16334295','Q5119','Q486972','Q13226383',
]);

const OCC_MAP={Q639669:'MUSICIAN',Q177220:'SINGER',Q753110:'COMPOSER',Q486748:'SINGER',Q36180:'WRITER',Q49757:'POET',Q214917:'PLAYWRIGHT',Q6625963:'NOVELIST',Q33999:'ACTOR',Q10800557:'ACTOR',Q3282637:'FILM DIRECTOR',Q2526255:'FILM DIRECTOR',Q11513337:'WEIGHTLIFTER',Q2066131:'ATHLETE',Q18939491:'ATHLETE',Q11338576:'BOXER',Q17379074:'MARTIAL ARTS',Q13218361:'TENNIS PLAYER',Q10833314:'TENNIS PLAYER',Q937857:'FOOTBALL PLAYER',Q628099:'SOLDIER',Q37547:'POLITICIAN',Q82955:'POLITICIAN',Q1583236:'MILITARY PERSONNEL',Q1614865:'MILITARY PERSONNEL',Q189290:'MILITARY OFFICER',Q11499147:'BUSINESSPERSON',Q43845:'BUSINESSPERSON',Q806798:'BANKER',Q1281618:'GEOLOGIST',Q901:'SCIENTIST',Q1028181:'PAINTER',Q3391743:'ARTIST',Q1622272:'PROFESSOR',Q170790:'MATHEMATICIAN',Q11063:'ASTRONOMER',Q11631:'ASTRONAUT',Q4220892:'FREESTYLE SKIER',Q11774891:'TRIPLE JUMPER',Q21947271:'COMEDIAN',Q578109:'TV PRESENTER',Q593644:'CHEMIST',Q205375:'INVENTOR',Q15212744:'CONDUCTOR',Q158852:'CONDUCTOR',Q36834:'COMPOSER',Q18617021:'FREESTYLE SKIER',Q19204627:'RAPPER',Q855091:'GUITARIST',Q482980:'AUTHOR',Q2252262:'RAPPER',Q12377274:'MARTIAL ARTS',Q2309784:'MIXED MARTIAL ARTIST',Q13141064:'WEIGHTLIFTER',Q11774156:'BOXER'};

// subdomain inference from occupation (for cap/anti-streak behavior)
const OCC_SUBDOMAIN={BOXER:'boxing','MARTIAL ARTS':'martial_arts','MIXED MARTIAL ARTIST':'martial_arts','TENNIS PLAYER':'tennis','FOOTBALL PLAYER':'football','FREESTYLE SKIER':'athletics',WEIGHTLIFTER:'athletics','TRIPLE JUMPER':'athletics',ATHLETE:'athletics',SINGER:'singer',MUSICIAN:'musician',COMPOSER:'musician',CONDUCTOR:'musician',RAPPER:'musician',GUITARIST:'musician',ACTOR:'actor','FILM DIRECTOR':'film_director',COMEDIAN:'comedian'};
const COUNTRY_MAP={Q232:'Kazakhstan',Q159:'Russia',Q145:'United Kingdom',Q142:'France',Q183:'Germany',Q265:'Uzbekistan',Q233:'Kyrgyzstan',Q172:'Mongolia',Q703:'Tajikistan',Q230:'Georgia',Q794:'Iran',Q15180:'Soviet Union',Q30:'United States',Q34:'Sweden'};
const ERA = y => { y=parseInt(y); if(isNaN(y))return null;
  if(y<0)return 'ancient_bc'; if(y<500)return 'classical_late_antiquity'; if(y<1400)return 'medieval';
  if(y<1800)return 'early_modern'; if(y<1900)return 'industrial_modern'; if(y<1946)return 'postwar_births';
  if(y<1970)return 'late_20c_births'; if(y<1990)return 'modern_media_births'; return 'digital_births'; };

// ── Batch-fetch all 46 ──────────────────────────────────────────────────────────
const allQids = [...new Set(cands.map(c=>c.qid))];
console.log(`Fetching ${allQids.length} entities from Wikidata...`);
const entities = {};
for (let i=0;i<allQids.length;i+=25){
  await sleep(400);
  const batch = await wdEntities(allQids.slice(i,i+25));
  Object.assign(entities, batch);
}

// ── Validate each ────────────────────────────────────────────────────────────────
const FAIL=[], OK=[];
for (const c of cands){
  const issues=[];
  if (FORBIDDEN.has(c.qid)) issues.push('FORBIDDEN Q-id');
  const e = entities[c.qid];
  if (!e || e.missing!==undefined){ issues.push('entity missing on Wikidata'); FAIL.push({c,issues}); continue; }

  const labels=[];
  for (const l of ['ru','kk','en']){ if(e.labels?.[l]?.value) labels.push(e.labels[l].value); }
  const descs=[];
  for (const l of ['en','ru']){ if(e.descriptions?.[l]?.value) descs.push(e.descriptions[l].value); }

  // label sanity
  if (!labelMatch(c, labels)) issues.push(`label mismatch: got [${labels.join(' / ')}]`);

  // P31 check
  const p31s = qAll(e,'P31');
  const isHuman = p31s.includes('Q5');
  const isRuler = RULER_ALLOW.has(c.name);
  const hitNonPerson = p31s.some(p=>NONPERSON_P31.has(p));
  if (hitNonPerson) issues.push(`non-person P31: ${p31s.join(',')}`);
  if (!isHuman && !isRuler) issues.push(`P31 not Q5 (${p31s.join(',')||'none'}) and not ruler-allow`);
  if (!isHuman && isRuler && hitNonPerson) {/* ruler but still non-person type → already flagged */}

  // dedup against pools
  const dupPools = Object.entries(poolQidArrays).filter(([,s])=>s.has(c.qid)).map(([k])=>k);
  if (dupPools.length) issues.push(`DUPLICATE in pools: ${dupPools.join(',')}`);

  // difficulty present
  if (!['easy','medium','hard'].includes(c.difficulty)) issues.push(`bad difficulty: ${c.difficulty}`);

  if (issues.length){ FAIL.push({c,issues,labels}); continue; }

  // Build validated record (kz_ca_top schema)
  const occQ = q1(e,'P106');
  let occName = c.occupation && !/^Q\d+$/.test(c.occupation) ? c.occupation : (occQ && OCC_MAP[occQ] ? OCC_MAP[occQ] : (c.occupation||null));
  // try all P106 values for a mapped occupation if first is unmapped/raw
  if (!occName || /^Q\d+$/.test(occName)) {
    for (const oq of qAll(e,'P106')) if (OCC_MAP[oq]) { occName = OCC_MAP[oq]; break; }
  }
  // subdomain: keep explicit if present, else infer from occupation
  let subdomain = (c.subdomain && c.subdomain !== '') ? c.subdomain : (occName && OCC_SUBDOMAIN[occName] ? OCC_SUBDOMAIN[occName] : null);
  const bv = claim(e,'P569'); const by = bv?.time ? parseInt(bv.time.replace(/^[+-]/,'').substring(0,4)) : (c.birthyear?parseInt(c.birthyear):null);
  const dv = claim(e,'P570'); const dy = dv?.time ? parseInt(dv.time.replace(/^[+-]/,'').substring(0,4)) : (c.deathyear?parseInt(c.deathyear):null);
  const cit = q1(e,'P27');
  const factualCountry = (cit && COUNTRY_MAP[cit]) ? COUNTRY_MAP[cit] : (c.bplace_country||'Kazakhstan');
  const lblRu = e.labels?.ru?.value ?? c.label_ru ?? null;
  const lblEn = e.labels?.en?.value ?? c.label_en ?? null;
  const lblKk = e.labels?.kk?.value ?? c.label_kk ?? null;
  const gender = q1(e,'P21');
  const genderStr = gender==='Q6581097'?'Male':gender==='Q6581072'?'Female':null;

  OK.push({
    c, e,
    record: {
      wikidata_id: c.qid,
      name: lblEn || c.name,
      occupation: occName,
      gender: genderStr,
      bplace_country: factualCountry,
      birthyear: Number.isFinite(by)?by:null,
      deathyear: Number.isFinite(dy)?dy:null,
      inclusion_source: 'kz_ca_seed',
      global_rank: null,
      global_score: null,
      ru_score: null,
      kz_score: null,
      hpi: null,
      display_name_en: lblEn,
      display_name_ru: lblRu,
      display_name_kk: lblKk,
      domain: c.domain,
      subdomain: subdomain,
      country_tag: factualCountry,   // factual
      macro_region: 'kz_ca',          // seed association
      era_bucket: ERA(by),
      difficulty_bucket: c.difficulty, // EXPLICIT, not from rank
      content_sensitivity: 'normal',
    },
  });
}

// ── Report ─────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PRE-MERGE VALIDATION RESULT');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Validated OK: ${OK.length} / ${cands.length}`);
console.log(`Failed:       ${FAIL.length}`);

if (FAIL.length){
  console.log('\n── FAILURES (merge blocked) ──────────────────────────────────');
  for (const f of FAIL){
    console.log(`  [src=${f.c.src}] ${f.c.qid.padEnd(13)}${f.c.name.padEnd(26)} :: ${f.issues.join(' | ')}`);
  }
  const failBySrc = { '30':0, '16':0 };
  for (const f of FAIL) failBySrc[f.c.src]++;
  console.log(`\n  Failures by source: from-30=${failBySrc['30']}, from-16-retry=${failBySrc['16']}`);
}

console.log('\n── VALIDATED OK ──────────────────────────────────────────────');
const okBySrc = { '30':0, '16':0 };
for (const o of OK){ okBySrc[o.c.src]++; }
for (const o of OK){
  console.log(`  [src=${o.c.src}] ${o.c.qid.padEnd(13)}${o.record.difficulty_bucket.padEnd(7)}${o.record.domain.padEnd(20)}${(o.record.display_name_ru||o.record.display_name_en||o.record.name).padEnd(26)} ${o.record.occupation||'?'}`);
}
console.log(`\n  OK by source: from-30=${okBySrc['30']}, from-16-retry=${okBySrc['16']}`);

// null-rank/score finding
const nullRank = OK.filter(o=>o.record.global_rank===null).length;
console.log(`\nNull-rank candidates: ${nullRank}/${OK.length} (expected — these are off-Pantheon KZ figures)`);

// Write the VALIDATED-CLEAN subset (user confirmed merging the clean subset).
const records = OK.map(o=>o.record);
writeFileSync(join(ROOT,'data/processed/kz_ca_extra_seed.json'),
  JSON.stringify(records, null, 2), 'utf-8');
console.log(`\n✅ Wrote ${records.length} VALIDATED-CLEAN records to data/processed/kz_ca_extra_seed.json`);
if (FAIL.length) console.log(`   (${FAIL.length} failed candidates EXCLUDED — deferred for re-resolution)`);
const byDom={}, byDiff={easy:0,medium:0,hard:0};
for (const r of records){ byDom[r.domain]=(byDom[r.domain]||0)+1; byDiff[r.difficulty_bucket]++; }
console.log('\nDomain:', JSON.stringify(byDom));
console.log('Difficulty:', JSON.stringify(byDiff));
console.log('\nSubdomains:', JSON.stringify(records.reduce((a,r)=>{const s=r.subdomain||'(none)';a[s]=(a[s]||0)+1;return a;},{})));
