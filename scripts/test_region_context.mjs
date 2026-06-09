/**
 * Stage 6.6 — IP/country region-context resolver tests (pure function, real module).
 * Run: node --loader ./scripts/ts-import-loader.mjs scripts/test_region_context.mjs
 */
import { resolveRegionContext, countryNameFromCode, isExplicitRegionParam } from '../src/lib/play/region-context.ts';

let PASS = 0, FAIL = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { PASS++; console.log(`  PASS  ${name}`); }
  else { FAIL++; console.log(`  FAIL  ${name}  — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

console.log('\n── code → country name ──');
eq('PL → Poland', countryNameFromCode('PL'), 'Poland');
eq('TR → Türkiye (diacritic)', countryNameFromCode('TR'), 'Türkiye');
eq('kr lowercase → South Korea', countryNameFromCode('kr'), 'South Korea');
eq('unknown code → null', countryNameFromCode('ZZ'), null);
eq('null code → null', countryNameFromCode(null), null);

console.log('\n── isExplicitRegionParam (mandatory-selection gate) ──');
eq('europe → explicit', isExplicitRegionParam('europe'), true);
eq('kz → explicit', isExplicitRegionParam('kz'), true);
eq('global → explicit', isExplicitRegionParam('global'), true);
eq('russia_cis → explicit', isExplicitRegionParam('russia_cis'), true);
eq('["europe"] (array) → explicit', isExplicitRegionParam(['europe']), true);
eq('undefined → not explicit', isExplicitRegionParam(undefined), false);
eq('"" → not explicit', isExplicitRegionParam(''), false);
eq('atlantis → not explicit', isExplicitRegionParam('atlantis'), false);
eq('uppercase KZ → not explicit (params are lowercase)', isExplicitRegionParam('KZ'), false);

console.log('\n── no explicit region → IP drives boost + macro fallback ──');
eq('no region + PL → Poland / europe',  resolveRegionContext(undefined, 'PL', 'global'), { region: 'europe', countryBoost: 'Poland' });
eq('no region + JP → Japan / east_asia', resolveRegionContext(undefined, 'JP', 'global'), { region: 'east_asia', countryBoost: 'Japan' });
eq('no region + RU → Russia / russia_cis', resolveRegionContext(undefined, 'RU', 'global'), { region: 'russia_cis', countryBoost: 'Russia' });
eq('no region + KZ → curated kz, no countryBoost', resolveRegionContext(undefined, 'KZ', 'global'), { region: 'kz', countryBoost: null });
eq('no region + NZ → global fallback + NZ boost', resolveRegionContext(undefined, 'NZ', 'global'), { region: 'global', countryBoost: 'New Zealand' });
eq('no region + missing IP → fallback', resolveRegionContext(undefined, null, 'global'), { region: 'global', countryBoost: null });
eq('no region + missing IP (kk fallback)', resolveRegionContext(undefined, undefined, 'kz'), { region: 'kz', countryBoost: null });
eq('no region + unknown IP code → fallback', resolveRegionContext(undefined, 'ZZ', 'global'), { region: 'global', countryBoost: null });

console.log('\n── explicit region wins; IP only if compatible ──');
eq('Europe + PL → Poland inside Europe', resolveRegionContext('europe', 'PL', 'global'), { region: 'europe', countryBoost: 'Poland' });
eq('Europe + KZ → ignore IP, Europe only', resolveRegionContext('europe', 'KZ', 'global'), { region: 'europe', countryBoost: null });
eq('Europe + missing IP → Europe only', resolveRegionContext('europe', null, 'global'), { region: 'europe', countryBoost: null });
eq('KZ + KZ → existing curated kz', resolveRegionContext('kz', 'KZ', 'global'), { region: 'kz', countryBoost: null });
eq('KZ + PL → kz wins, no boost', resolveRegionContext('kz', 'PL', 'global'), { region: 'kz', countryBoost: null });
eq('global selection + PL → global, no boost', resolveRegionContext('global', 'PL', 'global'), { region: 'global', countryBoost: null });
eq('east_asia + JP → Japan inside East Asia', resolveRegionContext('east_asia', 'JP', 'global'), { region: 'east_asia', countryBoost: 'Japan' });
eq('MENA + TR → Türkiye (middle_east ∈ MENA)', resolveRegionContext('middle_east_north_africa', 'TR', 'global'), { region: 'middle_east_north_africa', countryBoost: 'Türkiye' });
eq('north_america + CA → Canada inside NA', resolveRegionContext('north_america', 'CA', 'global'), { region: 'north_america', countryBoost: 'Canada' });
eq('Europe + US → USA compatible (western? no) ignored', resolveRegionContext('europe', 'US', 'global'), { region: 'europe', countryBoost: null });
eq('south_asia + IN → India', resolveRegionContext('south_asia', 'IN', 'global'), { region: 'south_asia', countryBoost: 'India' });

console.log(`\n${'─'.repeat(56)}\nTotal: ${PASS + FAIL}  PASS: ${PASS}  FAIL: ${FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
