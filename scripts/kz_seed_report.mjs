/**
 * Stage 5.14d — KZ seed sampling report over 300 region=kz sessions.
 * Mirrors createCalibrationBlock (kz: probe + 12-seed Phase 1 + difficulty fill).
 * Run: node scripts/kz_seed_report.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const pools = JSON.parse(readFileSync(join(ROOT,'public/data/play_pools.json'),'utf-8'));
const extra = JSON.parse(readFileSync(join(ROOT,'data/processed/kz_ca_extra_seed.json'),'utf-8'));
const NEW23 = new Set(extra.map(r=>r.wikidata_id));

// constants (mirror play-sampler.ts post-5.13)
const CALIB_SIZE=30, CALIB_KZ_EASY=10, CALIB_KZ_MEDIUM=7;
const CALIB_DOMAIN_MAX=5, CALIB_SUBDOMAIN_MAX=3, CALIB_ERA_MAX=8;
const CALIB_KZ_CA_TARGET=12, CALIB_KZ_CA_MAX=12;
const CALIB_EASY_RANK_MAX=1500, CALIB_MEDIUM_RANK_MAX=6000;
const COVERAGE_PROBES=[{subdomain:'football',difficulties:['easy','medium'],maxRank:CALIB_MEDIUM_RANK_MAX}];
const SENS=new Set(['PORNOGRAPHIC ACTOR']); const isSens=p=>SENS.has(p.occupation??'');
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

function calibBlock(safe, kzCaIds){
  const usedIds=new Set(), seen=new Set();
  const order=[safe.kz_ca_top,safe.top_30000,safe.ru_quota,safe.kz_quota,safe.hpi_quota];
  const all=[]; for(const src of order)for(const p of src)if(!seen.has(p.wikidata_id)&&!usedIds.has(p.wikidata_id)&&p.content_sensitivity==='normal'){seen.add(p.wikidata_id);all.push(p);}
  const sh=shuffle(all);
  const dc={},sc={},ec={},mc={},diff={easy:0,medium:0,hard:0,unknown:0};let kc=0;const block=[],bids=new Set();
  function con(p,{rE=false,rS=false,rD=false}={}){if(bids.has(p.wikidata_id))return true;const d=p.domain||'unknown',s=p.subdomain,e=p.era_bucket||'unknown';if(!rD&&(dc[d]??0)>=CALIB_DOMAIN_MAX)return true;if(!rS&&s&&(sc[s]??0)>=CALIB_SUBDOMAIN_MAX)return true;if(!rE&&(ec[e]??0)>=CALIB_ERA_MAX)return true;if(kzCaIds.has(p.wikidata_id)&&kc>=CALIB_KZ_CA_MAX)return true;return false;}
  function add(p){block.push(p);bids.add(p.wikidata_id);usedIds.add(p.wikidata_id);const d=p.domain||'unknown',s=p.subdomain,e=p.era_bucket||'unknown';dc[d]=(dc[d]??0)+1;ec[e]=(ec[e]??0)+1;if(s)sc[s]=(sc[s]??0)+1;diff[p.difficulty_bucket??'unknown']=(diff[p.difficulty_bucket??'unknown']??0)+1;if(kzCaIds.has(p.wikidata_id))kc++;}
  function relax(f){for(const p of sh){if(block.length>=CALIB_SIZE)break;if(!con(p,f))add(p);}}
  // probe phase 0
  for(const pr of COVERAGE_PROBES){if(block.length>=CALIB_SIZE)break;if((sc[pr.subdomain]??0)>0)continue;for(const p of sh){if(p.subdomain!==pr.subdomain)continue;if(!pr.difficulties.includes(p.difficulty_bucket??''))continue;if(p.global_rank>pr.maxRank)continue;if(con(p))continue;add(p);break;}}
  // phase 1 kz seed
  for(const p of sh){if(kc>=CALIB_KZ_CA_TARGET)break;if(kzCaIds.has(p.wikidata_id)&&!con(p))add(p);}
  const snap={...diff}; const p2=d=>(diff[d]??0)-(snap[d]??0);
  for(const [d,t,mr] of [['easy',CALIB_KZ_EASY,CALIB_EASY_RANK_MAX],['medium',CALIB_KZ_MEDIUM,CALIB_MEDIUM_RANK_MAX],['hard',0,13000]]){
    for(const p of sh){if(p2(d)>=t)break;if(p.difficulty_bucket===d&&p.global_rank<=mr&&(p.era_bucket??'unknown')!=='unknown'&&!con(p))add(p);}
    for(const p of sh){if(p2(d)>=t)break;if(p.difficulty_bucket===d&&p.global_rank<=mr&&!con(p))add(p);}
  }
  for(const p of sh){if(block.length>=CALIB_SIZE)break;if(!con(p))add(p);}
  relax({rE:true});relax({rE:true,rS:true});relax({rE:true,rS:true,rD:true});
  if(block.length<CALIB_SIZE)for(const p of sh){if(block.length>=CALIB_SIZE)break;if(!bids.has(p.wikidata_id))add(p);}
  return shuffle(block);
}

function buildSafe(kzCaArr){
  return {
    top_30000: pools.top_30000.filter(p=>!isSens(p)),
    ru_quota:  pools.ru_quota.filter(p=>!isSens(p)),
    kz_quota:  pools.kz_quota.filter(p=>!isSens(p)),
    hpi_quota: pools.hpi_quota.filter(p=>!isSens(p)),
    kz_ca_top: kzCaArr.filter(p=>!isSens(p)),
  };
}

const RUNS=300;
const kzCaIds=new Set(pools.kz_ca_top.map(p=>p.wikidata_id));
const safeAfter=buildSafe(pools.kz_ca_top);

// original 26 = kz_ca_top minus the 23 new
const orig26=pools.kz_ca_top.filter(p=>!NEW23.has(p.wikidata_id));
const safeBefore=buildSafe(orig26);
const kzCaIdsBefore=new Set(orig26.map(p=>p.wikidata_id));

// ── Run AFTER (49-pool) ─────────────────────────────────────────────────────
const seedFreq={}, new23Freq={}; let seedShownDiff={easy:0,medium:0,hard:0}; let seedShownDom={};
let dupSessions=0, len30ok=0, fbOk=0, seedCountSum=0;
const overlapAfter=[];
let prevSeeds=null;
for(let r=0;r<RUNS;r++){
  const block=calibBlock(safeAfter,kzCaIds);
  if(block.length===30)len30ok++;
  const ids=block.map(p=>p.wikidata_id);
  if(new Set(ids).size!==ids.length)dupSessions++;
  if(block.some(p=>p.subdomain==='football'))fbOk++;
  const seeds=block.filter(p=>kzCaIds.has(p.wikidata_id));
  seedCountSum+=seeds.length;
  for(const p of seeds){
    seedFreq[p.wikidata_id]=(seedFreq[p.wikidata_id]??0)+1;
    if(NEW23.has(p.wikidata_id))new23Freq[p.wikidata_id]=(new23Freq[p.wikidata_id]??0)+1;
    seedShownDiff[p.difficulty_bucket]=(seedShownDiff[p.difficulty_bucket]??0)+1;
    seedShownDom[p.domain]=(seedShownDom[p.domain]??0)+1;
  }
  const sset=new Set(seeds.map(p=>p.wikidata_id));
  if(prevSeeds){let o=0;for(const id of sset)if(prevSeeds.has(id))o++;overlapAfter.push(o);}
  prevSeeds=sset;
}

// ── Run BEFORE (26-pool) for overlap comparison ─────────────────────────────
const overlapBefore=[]; let prevB=null;
for(let r=0;r<RUNS;r++){
  const block=calibBlock(safeBefore,kzCaIdsBefore);
  const sset=new Set(block.filter(p=>kzCaIdsBefore.has(p.wikidata_id)).map(p=>p.wikidata_id));
  if(prevB){let o=0;for(const id of sset)if(prevB.has(id))o++;overlapBefore.push(o);}
  prevB=sset;
}
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;

// ── Report ───────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log(`KZ SEED SAMPLING REPORT — ${RUNS} region=kz sessions (post-merge)`);
console.log('═══════════════════════════════════════════════════════════════');
console.log(`first30 length = 30:        ${len30ok}/${RUNS}`);
console.log(`avg KZ seed count in first30: ${(seedCountSum/RUNS).toFixed(2)} (target 12)`);
console.log(`football probe in first30:   ${fbOk}/${RUNS} = ${(fbOk/RUNS*100).toFixed(1)}%`);
console.log(`sessions with duplicate QIDs: ${dupSessions}`);

const appeared=Object.keys(new23Freq).length;
console.log(`\n── Coverage of the 23 NEW candidates ──`);
console.log(`appeared ≥1 across ${RUNS} sessions: ${appeared}/23`);
const never=extra.filter(r=>!new23Freq[r.wikidata_id]);
console.log(`never appeared: ${never.length}`);
for(const r of never) console.log(`  ${r.wikidata_id.padEnd(12)}${r.difficulty_bucket.padEnd(7)}${r.domain.padEnd(18)}${r.display_name_ru||r.display_name_en||r.name}`);

console.log(`\n── Top 20 most frequent KZ seed figures ──`);
const nameOf=qid=>{const p=pools.kz_ca_top.find(x=>x.wikidata_id===qid);return (p?.display_name_ru||p?.display_name_en||p?.name||qid);};
const isNew=qid=>NEW23.has(qid)?' [NEW]':'';
Object.entries(seedFreq).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([q,c],i)=>{
  console.log(`  ${String(i+1).padStart(2)}. ${q.padEnd(12)}${(c/RUNS*100).toFixed(1).padStart(5)}%  ${nameOf(q)}${isNew(q)}`);
});

console.log(`\n── Shown KZ seed cards: domain distribution ──`);
const totDom=Object.values(seedShownDom).reduce((a,b)=>a+b,0);
for(const [d,n] of Object.entries(seedShownDom).sort((a,b)=>b[1]-a[1])) console.log(`  ${d.padEnd(22)}${(n/totDom*100).toFixed(1).padStart(5)}%  (${n})`);

console.log(`\n── Shown KZ seed cards: difficulty distribution ──`);
const totDiff=seedShownDiff.easy+seedShownDiff.medium+seedShownDiff.hard;
for(const d of ['easy','medium','hard']) console.log(`  ${d.padEnd(8)}${(seedShownDiff[d]/totDiff*100).toFixed(1).padStart(5)}%  (${seedShownDiff[d]})`);
console.log(`  HARD SHARE among shown KZ seed cards: ${(seedShownDiff.hard/totDiff*100).toFixed(1)}%`);

console.log(`\n── Session-to-session KZ seed overlap (of 12 shown) ──`);
console.log(`  BEFORE merge (pool=26): avg ${avg(overlapBefore).toFixed(2)} / 12`);
console.log(`  AFTER  merge (pool=49): avg ${avg(overlapAfter).toFixed(2)} / 12`);
console.log(`  reduction: ${(avg(overlapBefore)-avg(overlapAfter)).toFixed(2)} fewer repeated seeds per replay`);
console.log('\nDone.');
