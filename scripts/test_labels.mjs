/**
 * Stage 6.7 — localization label tests (real module).
 * Run: node --loader ./scripts/ts-import-loader.mjs scripts/test_labels.mjs
 */
import { getCategoryLabel, getOccupationLabel, OCCUPATION_LABELS } from '../src/lib/play/localized-labels.ts';

let PASS = 0, FAIL = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  if (ok) { PASS++; console.log(`  PASS  ${name}`); }
  else { FAIL++; console.log(`  FAIL  ${name}  — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const ok = (name, cond, extra = '') => { if (cond) { PASS++; console.log(`  PASS  ${name}`); } else { FAIL++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); } };
const P = (o) => ({ occupation: null, subdomain: null, domain: 'unknown', gender: null, ...o });

console.log('\n── Issue 1: COMPANION no longer "Сахаба" ──');
eq('COMPANION kk → Танымал тұлға', OCCUPATION_LABELS.COMPANION.kk, 'Танымал тұлға');
eq('COMPANION ru → Публичная персона', OCCUPATION_LABELS.COMPANION.ru, 'Публичная персона');
eq('COMPANION en → Public Figure', OCCUPATION_LABELS.COMPANION.en, 'Public Figure');
const sahabaAnywhere = Object.values(OCCUPATION_LABELS).some(l => l.ru === 'Сахаба' || l.kk === 'Сахаба' || l.en === 'Сахаба');
ok('"Сахаба" not present in any occupation label', !sahabaAnywhere);
// Empress Elisabeth-style figure: COMPANION + domain religion + female → neutral, not Сахаба/Религия
const sisi = P({ occupation: 'COMPANION', domain: 'religion', gender: 'Female' });
eq('COMPANION female (Sisi) kk → Танымал тұлға (not Сахаба, not Дін)', getCategoryLabel(sisi, 'kk'), 'Танымал тұлға');
eq('COMPANION female (Sisi) ru → Публичная персона (not Религия)', getCategoryLabel(sisi, 'ru'), 'Публичная персона');

console.log('\n── Issue 2: neutral category subtitle (genderless) ──');
// female figures must NOT get a masculine person-noun
eq('female PAINTER → Искусство (not Живописец)', getCategoryLabel(P({ occupation: 'PAINTER', domain: 'art', gender: 'Female' }), 'ru'), 'Искусство');
eq('female SOCCER PLAYER (sub football) → Футбол', getCategoryLabel(P({ occupation: 'SOCCER PLAYER', subdomain: 'football', domain: 'sports', gender: 'Female' }), 'ru'), 'Футбол');
eq('female ACTOR (sub actor) → Кино (not Актриса/Актёр)', getCategoryLabel(P({ occupation: 'ACTOR', subdomain: 'actor', domain: 'entertainment', gender: 'Female' }), 'ru'), 'Кино');
eq('female BOXER (sub boxing) → Бокс', getCategoryLabel(P({ occupation: 'BOXER', subdomain: 'boxing', domain: 'sports', gender: 'Female' }), 'ru'), 'Бокс');
eq('SINGER (sub singer) → Музыка', getCategoryLabel(P({ occupation: 'SINGER', subdomain: 'singer', domain: 'entertainment' }), 'ru'), 'Музыка');
eq('POLITICIAN (no sub) → Политика', getCategoryLabel(P({ occupation: 'POLITICIAN', domain: 'politics' }), 'ru'), 'Политика');
eq('PHYSICIST (no sub) domain science → Наука', getCategoryLabel(P({ occupation: 'PHYSICIST', domain: 'science' }), 'ru'), 'Наука');
eq('BUSINESSPERSON domain business_tech → Бизнес и тех.', getCategoryLabel(P({ occupation: 'BUSINESSPERSON', domain: 'business_tech' }), 'ru'), 'Бизнес и тех.');
eq('NOBLEMAN → Аристократия (neutral override, not Политика/Аристократ)', getCategoryLabel(P({ occupation: 'NOBLEMAN', domain: 'politics', gender: 'Female' }), 'ru'), 'Аристократия');
eq('NOBLEMAN kk → Ақсүйектер', getCategoryLabel(P({ occupation: 'NOBLEMAN', domain: 'politics' }), 'kk'), 'Ақсүйектер');
eq('NOBLEMAN en → Nobility', getCategoryLabel(P({ occupation: 'NOBLEMAN', domain: 'politics' }), 'en'), 'Nobility');
// kk + en sanity
eq('football kk → Футбол', getCategoryLabel(P({ subdomain: 'football', domain: 'sports' }), 'kk'), 'Футбол');
eq('actor en → Film', getCategoryLabel(P({ occupation: 'ACTOR', subdomain: 'actor', domain: 'entertainment' }), 'en'), 'Film');

console.log('\n── fallback (unknown domain, no subdomain) → occupation label ──');
eq('ASTRONAUT unknown domain → occupation label (Космонавт)', getCategoryLabel(P({ occupation: 'ASTRONAUT', domain: 'unknown' }), 'ru'), getOccupationLabel('ASTRONAUT', 'ru'));
ok('fallback returns non-empty', getCategoryLabel(P({ occupation: 'ASTRONAUT', domain: 'unknown' }), 'ru').length > 0);
eq('truly empty (no occupation, unknown domain) → ""', getCategoryLabel(P({ occupation: null, domain: 'unknown' }), 'ru'), '');

console.log(`\n${'─'.repeat(56)}\nTotal: ${PASS + FAIL}  PASS: ${PASS}  FAIL: ${FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
