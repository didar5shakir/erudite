/**
 * Deterministic tests for calculateResultEstimate (Stage 6.1a — cumulative, 30k cap).
 * Mirrors src/lib/play/result-estimate.ts. Run: node scripts/test_result_estimate.mjs
 */

// ── Mirror of result-estimate.ts ───────────────────────────────────────────────
const UNIVERSE_TOTAL = 30000;
const BUCKET_UNIVERSE      = { easy: 1500, medium: 4500, hard: 24000 };
const DEFAULT_BUCKET_RATES = { easy: 0.7,  medium: 0.4,  hard: 0.2  };
const LEVEL_THRESHOLDS = [[10000,'master'],[6000,'erudite'],[3000,'strong'],[1500,'good'],[500,'casual']];
const ZONE_MIN_TOTAL=5, ZONE_MAX=5, STRONG=0.7, WEAK=0.4, STRONG_MAX_GEO=2;
const ZONE_CATEGORY = { subdomain:'topic', domain:'topic', country:'geo', macroRegion:'geo', era:'time' };

const roundTo=(v,n)=>Math.round(v/n)*n;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function rangePct(t){if(t>=2000)return 7;if(t>=1000)return 10;if(t>=500)return 12;if(t>=200)return 15;return 20;}
function levelOf(p){for(const[t,l]of LEVEL_THRESHOLDS)if(p>=t)return l;return 'beginner';}

function calculateResultEstimate(profile){
  const answers = profile.answers ?? [];
  const answeredCount=profile.stats.totalAnswers, knowCount=profile.stats.knowCount,
        heardCount=profile.stats.heardCount, dontKnowCount=profile.stats.dontKnowCount,
        scoreSum=profile.stats.scoreSum;
  const scorePercent = answeredCount>0 ? (scoreSum/answeredCount)*100 : 0;

  const bucketData={};
  for(const a of answers){if(a.isRegionalSeed===true)continue;const b=a.difficultyBucket??'unknown';if(!bucketData[b])bucketData[b]={sum:0,count:0};bucketData[b].sum+=a.score;bucketData[b].count++;}

  let rawEstimate=0; const usedDefaultBuckets=[]; const bucketStats={};
  for(const b of ['easy','medium','hard']){
    const d=bucketData[b]; const usedDefault=!(d&&d.count>0);
    const scoreRate=usedDefault?DEFAULT_BUCKET_RATES[b]:d.sum/d.count;
    const count=usedDefault?0:d.count;
    bucketStats[b]={count,scoreRate,usedDefault};
    if(usedDefault)usedDefaultBuckets.push(b);
    rawEstimate+=BUCKET_UNIVERSE[b]*scoreRate;
  }
  const calibrationEstimate=roundTo(rawEstimate,100);
  const publicEstimate=clamp(calibrationEstimate,0,UNIVERSE_TOTAL);
  const rp=rangePct(answeredCount);
  const rangeLow=clamp(roundTo(publicEstimate*(1-rp/100),100),0,UNIVERSE_TOTAL);
  const rangeHigh=clamp(roundTo(publicEstimate*(1+rp/100),100),0,UNIVERSE_TOTAL);
  const levelLabel=levelOf(publicEstimate);
  const isPreliminary=answeredCount<100;

  const axes=[
    {axis:'subdomain',   getTag:a=>a.subdomain},
    {axis:'domain',      getTag:a=>(a.domain&&a.domain!=='unknown')?a.domain:null},
    {axis:'country',     getTag:a=>a.country},
    {axis:'macroRegion', getTag:a=>(a.macroRegion&&a.macroRegion!=='unknown')?a.macroRegion:null},
    {axis:'era',         getTag:a=>(a.era&&a.era!=='unknown')?a.era:null},
  ];
  const zoneMap=new Map(); const subToDomain={}, countryToRegion={};
  for(const a of answers){
    if(a.subdomain&&a.domain&&a.domain!=='unknown')subToDomain[a.subdomain]=a.domain;
    if(a.country&&a.macroRegion&&a.macroRegion!=='unknown')countryToRegion[a.country]=a.macroRegion;
    for(const{axis,getTag}of axes){const tag=getTag(a);if(!tag)continue;const key=`${axis}:${tag}`;const e=zoneMap.get(key);
      if(e){e.total++;e.scoreSum+=a.score;e.rate=e.scoreSum/e.total;}else zoneMap.set(key,{axis,tag,total:1,scoreSum:a.score,rate:a.score});}
  }
  const byRate=(a,b)=>b.rate-a.rate||b.total-a.total;
  function dedup(zones){const cd=new Set(),cr=new Set();for(const z of zones){if(z.axis==='subdomain'){const d=subToDomain[z.tag];if(d)cd.add(d);}if(z.axis==='country'){const r=countryToRegion[z.tag];if(r)cr.add(r);}}return zones.filter(z=>!(z.axis==='domain'&&cd.has(z.tag))&&!(z.axis==='macroRegion'&&cr.has(z.tag)));}
  const eligible=[...zoneMap.values()].filter(z=>z.total>=ZONE_MIN_TOTAL);
  function selectStrongBalanced(zones){
    const sorted=[...zones].sort(byRate); const result=[]; let geoCount=0;
    const pushable=z=>!result.includes(z)&&!(ZONE_CATEGORY[z.axis]==='geo'&&geoCount>=STRONG_MAX_GEO);
    const ft=sorted.find(z=>ZONE_CATEGORY[z.axis]==='topic'); if(ft)result.push(ft);
    for(const z of sorted){if(result.length>=ZONE_MAX)break;if(!pushable(z))continue;result.push(z);if(ZONE_CATEGORY[z.axis]==='geo')geoCount++;}
    return result.sort(byRate);
  }
  const strongZones=selectStrongBalanced(dedup(eligible.filter(z=>z.rate>=STRONG)));
  const mediumZones=dedup(eligible.filter(z=>z.rate>WEAK&&z.rate<STRONG).sort(byRate)).slice(0,ZONE_MAX);
  const weakZones=dedup(eligible.filter(z=>z.rate<=WEAK).sort((a,b)=>a.rate-b.rate||b.total-a.total)).slice(0,ZONE_MAX);
  const topZones=dedup([...eligible].sort(byRate)).slice(0,ZONE_MAX);
  const strongIsFallback=strongZones.length===0;

  return {answeredCount,knowCount,heardCount,dontKnowCount,scoreSum,scorePercent,universeTotal:UNIVERSE_TOTAL,
    calibrationEstimate,publicEstimate,rangeLow,rangeHigh,rangePercent:rp,levelLabel,bucketStats,usedDefaultBuckets,
    strongZones,strongIsFallback,topZones,mediumZones,weakZones,isPreliminary};
}

// ── profile factory ─────────────────────────────────────────────────────────
function makeProfile(records){
  const stats={totalAnswers:records.length,knowCount:0,heardCount:0,dontKnowCount:0,scoreSum:0};
  for(const r of records){
    if(r.score===1)stats.knowCount++; else if(r.score===0.5)stats.heardCount++; else stats.dontKnowCount++;
    stats.scoreSum+=r.score;
  }
  const answers=records.map((r,i)=>({qid:`Q${i}`,answer:r.score===1?'know':r.score===0.5?'heard':'dont_know',
    score:r.score,difficultyBucket:r.difficultyBucket??null,domain:r.domain??null,occupation:null,
    subdomain:r.subdomain??null,country:r.country??null,macroRegion:r.macroRegion??null,era:r.era??null,
    isRegionalSeed:r.isRegionalSeed===true,timestamp:i}));
  return {version:1,weights:{domain:{},occupation:{},subdomain:{},country:{},macroRegion:{},era:{}},stats,answers};
}
function rec(score,bucket,extra={}){return {score,difficultyBucket:bucket,...extra};}

// ── harness ───────────────────────────────────────────────────────────────────
let pass=0,fail=0;
function check(label,cond,detail=''){if(cond){console.log(`  PASS  ${label}`);pass++;}else{console.log(`  FAIL  ${label}${detail?'  →  '+detail:''}`);fail++;}}

console.log('\n── A: 30k cap (estimate never exceeds 30000) ──');
{
  const recs=[];
  for(let i=0;i<40;i++)recs.push(rec(1,'easy'));
  for(let i=0;i<40;i++)recs.push(rec(1,'medium'));
  for(let i=0;i<40;i++)recs.push(rec(1,'hard'));
  const r=calculateResultEstimate(makeProfile(recs));
  check('A1: all-know publicEstimate = 30000', r.publicEstimate===30000, `got ${r.publicEstimate}`);
  check('A2: publicEstimate ≤ 30000', r.publicEstimate<=30000, `got ${r.publicEstimate}`);
  check('A3: rangeHigh clamped ≤ 30000', r.rangeHigh<=30000, `got ${r.rangeHigh}`);
  check('A4: rangeLow ≥ 0', r.rangeLow>=0, `got ${r.rangeLow}`);
  check('A5: level master at 30000', r.levelLabel==='master', r.levelLabel);
}

console.log('\n── B: rangeHigh clamp when public near cap ──');
{
  const recs=[];
  for(let i=0;i<20;i++)recs.push(rec(1,'easy'));
  for(let i=0;i<20;i++)recs.push(rec(1,'medium'));
  for(let i=0;i<20;i++)recs.push(rec(i<19?1:0,'hard')); // 19/20 = 0.95
  const r=calculateResultEstimate(makeProfile(recs)); // 60 answers → 20%
  check('B1: publicEstimate ≤ 30000', r.publicEstimate<=30000, `got ${r.publicEstimate}`);
  check('B2: rangeHigh = 30000 (clamped from >30k)', r.rangeHigh===30000, `got ${r.rangeHigh}`);
}

console.log('\n── C: zero knowledge ──');
{
  const recs=[];
  for(let i=0;i<30;i++)recs.push(rec(0,'easy'));
  for(let i=0;i<30;i++)recs.push(rec(0,'medium'));
  for(let i=0;i<30;i++)recs.push(rec(0,'hard'));
  const r=calculateResultEstimate(makeProfile(recs));
  check('C1: publicEstimate = 0', r.publicEstimate===0, `got ${r.publicEstimate}`);
  check('C2: rangeLow = 0', r.rangeLow===0, `got ${r.rangeLow}`);
  check('C3: rangeHigh = 0', r.rangeHigh===0, `got ${r.rangeHigh}`);
  check('C4: level beginner', r.levelLabel==='beginner', r.levelLabel);
}

console.log('\n── D: bucket extrapolation math (30k base) ──');
{
  const recs=[];
  for(let i=0;i<10;i++)recs.push(rec(i<8?1:0,'easy'));   // 0.8
  for(let i=0;i<10;i++)recs.push(rec(i<4?1:0,'medium')); // 0.4
  for(let i=0;i<10;i++)recs.push(rec(i<2?1:0,'hard'));   // 0.2
  const r=calculateResultEstimate(makeProfile(recs));
  check('D1: estimate = 7800', r.publicEstimate===7800, `got ${r.publicEstimate}`); // 1200+1800+4800
  check('D2: level erudite (6000–9999)', r.levelLabel==='erudite', r.levelLabel);
}

console.log('\n── E: default rates for missing buckets ──');
{
  const recs=[]; for(let i=0;i<10;i++)recs.push(rec(1,'easy'));
  const r=calculateResultEstimate(makeProfile(recs)); // 1500 + 4500*0.4 + 24000*0.2 = 8100
  check('E1: estimate = 8100 (defaults applied)', r.publicEstimate===8100, `got ${r.publicEstimate}`);
  check('E2: usedDefaultBuckets = [medium,hard]', JSON.stringify(r.usedDefaultBuckets)===JSON.stringify(['medium','hard']));
}

console.log('\n── F: medium zone tier ──');
{
  const recs=[];
  for(let i=0;i<10;i++)recs.push(rec(i<5?1:0,'medium',{domain:'sports',subdomain:'football'})); // 0.5
  for(let i=0;i<10;i++)recs.push(rec(0,'hard',{domain:'science'}));
  const r=calculateResultEstimate(makeProfile(recs));
  const inMed=r.mediumZones.some(z=>z.tag==='football'||z.tag==='sports');
  const inStrong=r.strongZones.some(z=>z.tag==='football'||z.tag==='sports');
  const inWeak=r.weakZones.some(z=>z.tag==='football'||z.tag==='sports');
  check('F1: 0.5-rate zone in mediumZones', inMed);
  check('F2: not in strong', !inStrong);
  check('F3: not in weak', !inWeak);
}

console.log('\n── G: axis balance — geography cannot be the only strong zone ──');
{
  const recs=[];
  for(let i=0;i<6;i++)recs.push(rec(1,'easy',{country:'France',macroRegion:'western_europe'}));
  for(let i=0;i<6;i++)recs.push(rec(1,'easy',{country:'Japan',macroRegion:'east_asia'}));
  for(let i=0;i<6;i++)recs.push(rec(1,'easy',{country:'Brazil',macroRegion:'latin_america'}));
  for(let i=0;i<6;i++)recs.push(rec(1,'medium',{domain:'sports',subdomain:'tennis'}));
  const r=calculateResultEstimate(makeProfile(recs));
  const geoStrong=r.strongZones.filter(z=>z.axis==='country'||z.axis==='macroRegion').length;
  const topicStrong=r.strongZones.filter(z=>z.axis==='domain'||z.axis==='subdomain').length;
  check('G1: ≥1 topic zone in strong', topicStrong>=1, `topic=${topicStrong}`);
  check('G2: geo capped ≤2 in strong', geoStrong<=STRONG_MAX_GEO, `geo=${geoStrong}`);
  check('G3: strong is not all-geo', !(geoStrong>0 && topicStrong===0));
}

console.log('\n── H: cumulative counts from profile.stats ──');
{
  const recs=[rec(1,'easy'),rec(0.5,'medium'),rec(0,'hard'),rec(1,'easy')];
  const r=calculateResultEstimate(makeProfile(recs));
  check('H1: knowCount=2', r.knowCount===2);
  check('H2: heardCount=1', r.heardCount===1);
  check('H3: dontKnowCount=1', r.dontKnowCount===1);
  check('H4: answeredCount=4', r.answeredCount===4);
}

console.log('\n── I: range narrows with cumulative answers ──');
{
  const mk=n=>{const recs=[];for(let i=0;i<n;i++)recs.push(rec(i%2,'medium'));return calculateResultEstimate(makeProfile(recs));};
  check('I1: <200 → 20%', mk(100).rangePercent===20);
  check('I2: ≥200 → 15%', mk(200).rangePercent===15);
  check('I3: ≥500 → 12%', mk(500).rangePercent===12);
}

console.log('\n── J: isPreliminary flag ──');
{
  const mk=n=>{const recs=[];for(let i=0;i<n;i++)recs.push(rec(1,'easy'));return calculateResultEstimate(makeProfile(recs));};
  check('J1: 99 → preliminary', mk(99).isPreliminary===true);
  check('J2: 100 → not preliminary', mk(100).isPreliminary===false);
}

console.log('\n── K: fuzz — estimate & range never exceed [0,30000] (500 runs) ──');
{
  let v=0;
  for(let t=0;t<500;t++){
    const recs=[]; const n=20+Math.floor(Math.random()*200);
    const buckets=['easy','medium','hard','unknown'];
    for(let i=0;i<n;i++){const score=[0,0.5,1][Math.floor(Math.random()*3)];recs.push(rec(score,buckets[Math.floor(Math.random()*buckets.length)]));}
    const r=calculateResultEstimate(makeProfile(recs));
    if(r.publicEstimate>30000||r.publicEstimate<0)v++;
    if(r.rangeHigh>30000||r.rangeLow<0)v++;
    if(r.calibrationEstimate>30000||r.calibrationEstimate<0)v++;
  }
  check('K1: no estimate/range exceeded [0,30000] in 500 fuzz runs', v===0, `${v} violations`);
}

console.log('\n── L: empty profile safety ──');
{
  const r=calculateResultEstimate({version:1,weights:{},stats:{totalAnswers:0,knowCount:0,heardCount:0,dontKnowCount:0,scoreSum:0},answers:[]});
  check('L1: empty → defaults estimate 7700', r.publicEstimate===7700, `got ${r.publicEstimate}`); // 1050+1800+4800=7650 → roundTo100 → 7700
  check('L2: empty → no zones', r.strongZones.length===0&&r.mediumZones.length===0&&r.weakZones.length===0);
  check('L3: empty → preliminary', r.isPreliminary===true);
}

// mirror of getContinueMilestone / getAccuracyTier
function getContinueMilestone(n){if(n<200)return 200;if(n<300)return 300;if(n<400)return 400;if(n<500)return 500;if(n<750)return 750;if(n<1000)return 1000;if(n<1500)return 1500;if(n<2000)return 2000;if(n<3000)return 3000;return null;}
function getAccuracyTier(n){if(n<200)return 'baseline';if(n<500)return 'stable';if(n<1000)return 'high';return 'detailed';}

console.log('\n── P: continue milestones (fine-grained) ──');
{
  check('P1: 100 → 200',   getContinueMilestone(100)===200);
  check('P2: 199 → 200',   getContinueMilestone(199)===200);
  check('P3: 200 → 300',   getContinueMilestone(200)===300);
  check('P4: 299 → 300',   getContinueMilestone(299)===300);
  check('P5: 300 → 400',   getContinueMilestone(300)===400);
  check('P6: 399 → 400',   getContinueMilestone(399)===400);
  check('P7: 400 → 500',   getContinueMilestone(400)===500);
  check('P8: 499 → 500',   getContinueMilestone(499)===500);
  check('P9: 500 → 750',   getContinueMilestone(500)===750);
  check('P10: 749 → 750',  getContinueMilestone(749)===750);
  check('P11: 750 → 1000', getContinueMilestone(750)===1000);
  check('P12: 999 → 1000', getContinueMilestone(999)===1000);
  check('P13: 1000 → 1500',getContinueMilestone(1000)===1500);
  check('P14: 1499 → 1500',getContinueMilestone(1499)===1500);
  check('P15: 1500 → 2000',getContinueMilestone(1500)===2000);
  check('P16: 1999 → 2000',getContinueMilestone(1999)===2000);
  check('P17: 2000 → 3000',getContinueMilestone(2000)===3000);
  check('P18: 2999 → 3000',getContinueMilestone(2999)===3000);
  check('P19: 3000 → null',getContinueMilestone(3000)===null);
  check('P20: 5000 → null',getContinueMilestone(5000)===null);
}

console.log('\n── Q: accuracy tiers ──');
{
  check('Q1: 100 → baseline', getAccuracyTier(100)==='baseline');
  check('Q2: 199 → baseline', getAccuracyTier(199)==='baseline');
  check('Q3: 200 → stable',   getAccuracyTier(200)==='stable');
  check('Q4: 499 → stable',   getAccuracyTier(499)==='stable');
  check('Q5: 500 → high',     getAccuracyTier(500)==='high');
  check('Q6: 999 → high',     getAccuracyTier(999)==='high');
  check('Q7: 1000 → detailed',getAccuracyTier(1000)==='detailed');
  check('Q8: 5000 → detailed',getAccuracyTier(5000)==='detailed');
}

console.log('\n── R: strong-zone fallback (never empty when zones exist) ──');
{
  // All zones below 0.7 → strict strong empty; fallback topZones must fill in.
  const recs=[];
  // 6 distinct subdomains, each 6 answers at rate ~0.5 (3 know, 3 dont_know)
  const subs=['boxing','tennis','football','chess','cycling','skating'];
  for(const s of subs){for(let i=0;i<3;i++)recs.push(rec(1,'medium',{domain:'sports',subdomain:s}));for(let i=0;i<3;i++)recs.push(rec(0,'medium',{domain:'sports',subdomain:s}));}
  const r=calculateResultEstimate(makeProfile(recs));
  check('R1: strict strongZones empty (all rate 0.5)', r.strongZones.length===0);
  check('R2: strongIsFallback = true', r.strongIsFallback===true);
  check('R3: topZones non-empty (fallback fills section)', r.topZones.length>0);
  check('R4: topZones ≤ 5', r.topZones.length<=5);
}

{
  // Clear strength present → strict strong non-empty, no fallback.
  const recs=[];
  for(let i=0;i<8;i++)recs.push(rec(1,'medium',{domain:'sports',subdomain:'boxing'}));
  for(let i=0;i<6;i++)recs.push(rec(0,'hard',{domain:'science'}));
  const r=calculateResultEstimate(makeProfile(recs));
  check('R5: strict strong present → strongIsFallback false', r.strongIsFallback===false && r.strongZones.length>0);
}

console.log('\n── M: regional seed excluded from bucket estimate, kept in zones ──');
{
  const recs=[];
  // 10 regular easy, all know → easy rate 1.0 → 1500
  for(let i=0;i<10;i++)recs.push(rec(1,'easy',{domain:'science'}));
  // 10 regional-seed HARD, all know, flagged → if counted, hard rate 1.0 (=24000); must be excluded
  for(let i=0;i<10;i++)recs.push(rec(1,'hard',{domain:'sports',subdomain:'boxing',country:'Kazakhstan',macroRegion:'kz_ca',isRegionalSeed:true}));
  const r=calculateResultEstimate(makeProfile(recs));
  // hard bucket has only seeds (excluded) → default 0.2; medium default 0.4
  // 1500*1 + 4500*0.4 + 24000*0.2 = 8100
  check('M1: seeds excluded from estimate (=8100, not ~27300)', r.publicEstimate===8100, `got ${r.publicEstimate}`);
  check('M2: hard bucket uses default (seeds excluded)', r.bucketStats.hard.usedDefault===true);
  check('M3: regional-seed zone (boxing) still appears in strong', r.strongZones.some(z=>z.tag==='boxing'));
}

console.log('\n── N: MVP level scale boundaries ──');
{
  check('N1: 499 → beginner', levelOf(499)==='beginner');
  check('N2: 500 → casual', levelOf(500)==='casual');
  check('N3: 1499 → casual', levelOf(1499)==='casual');
  check('N4: 1500 → good', levelOf(1500)==='good');
  check('N5: 2999 → good', levelOf(2999)==='good');
  check('N6: 3000 → strong', levelOf(3000)==='strong');
  check('N7: 5999 → strong', levelOf(5999)==='strong');
  check('N8: 6000 → erudite', levelOf(6000)==='erudite');
  check('N9: 9999 → erudite', levelOf(9999)==='erudite');
  check('N10: 10000 → master', levelOf(10000)==='master');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Total: ${pass+fail}  PASS: ${pass}  FAIL: ${fail}`);
if(fail>0)process.exit(1);
