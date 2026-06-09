/**
 * Stage 6.10 — challenge encode/decode tests (real module).
 * Run: node --loader ./scripts/ts-import-loader.mjs scripts/test_challenge.mjs
 */
import { encodeChallenge, decodeChallenge } from '../src/lib/play/challenge.ts';

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { PASS++; console.log(`  PASS  ${name}`); }
  else { FAIL++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

const sample = {
  estimate: 2300, level: 'good', answered: 100,
  know: 41, heard: 23, dontKnow: 36, rangeLow: 1900, rangeHigh: 2700,
  zones: ['subdomain:football', 'country:KZ', 'domain:sports'],
  region: 'kz', locale: 'ru',
};

console.log('\n── roundtrip ──');
const enc = encodeChallenge(sample);
ok('encode → URL-safe string (no +/=)', /^[A-Za-z0-9_-]+$/.test(enc), enc);
const dec = decodeChallenge(enc);
ok('decode returns object', !!dec);
ok('roundtrip preserves fields', JSON.stringify(dec) === JSON.stringify(sample), JSON.stringify(dec));

console.log('\n── fail-safe ──');
ok('undefined → null', decodeChallenge(undefined) === null);
ok('null → null', decodeChallenge(null) === null);
ok('empty string → null', decodeChallenge('') === null);
ok('garbage → null', decodeChallenge('!!!not base64!!!') === null);
ok('valid b64 non-json → null', decodeChallenge(encodeChallengeRaw('hello')) === null);
ok('too long → null', decodeChallenge('A'.repeat(801)) === null);
ok('array param uses first', JSON.stringify(decodeChallenge([enc, 'x'])) === JSON.stringify(sample));

console.log('\n── validation / clamping ──');
ok('missing v → null', decodeChallenge(b64url(JSON.stringify({ e: 100, l: 'good' }))) === null);
ok('bad level → null', decodeChallenge(b64url(JSON.stringify({ v: 1, l: 'godlike' }))) === null);
{
  const d = decodeChallenge(b64url(JSON.stringify({ v: 1, l: 'master', e: 999999, n: -5, rh: 50000, z: ['a','b','c','d','e','f', 123, {}], rg: 'europe', lo: 'zz' })));
  ok('estimate clamps to 30000', d && d.estimate === 30000, d && String(d.estimate));
  ok('negative count clamps to 0', d && d.answered === 0);
  ok('range clamps to 30000', d && d.rangeHigh === 30000);
  ok('zones cap at 4 + drop non-strings', d && d.zones.length === 4 && d.zones.every(z => typeof z === 'string'), d && JSON.stringify(d.zones));
  ok('invalid locale → en', d && d.locale === 'en');
  ok('region preserved', d && d.region === 'europe');
}
{
  const d = decodeChallenge(b64url(JSON.stringify({ v: 1, l: 'good', e: '2300' })));
  ok('numeric string coerced/clamped', d && d.estimate === 2300, d && String(d.estimate));
}

console.log(`\n${'─'.repeat(56)}\nTotal: ${PASS + FAIL}  PASS: ${PASS}  FAIL: ${FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);

// helpers mirroring the module's base64url (for crafting test inputs)
function b64url(json) {
  return Buffer.from(json, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function encodeChallengeRaw(s) { return b64url(s); }
