// IP/country region context resolver. Stage 6.6.
//
// Two-level model: a macro `region` (RegionParam, used for storage + sampler) and an
// optional `countryBoost` (a bplace_country name) that front-loads local cards in the
// first-30 calibration. The resolver is PURE (no header/IO) so it is fully unit-testable.
//
// Rules: explicit selected region always wins. IP country only adds a country boost when
// it is COMPATIBLE with the selected region; if it conflicts, IP is ignored. With no
// explicit selection, IP country drives both the boost and the macro fallback.

import type { MacroRegion } from './types';
import { MACRO_REGION_MAP } from './derived-tags';
import { REGION_BOOST, REGION_PARAMS, type RegionParam } from './play-sampler';

export interface RegionContext {
  region:       RegionParam;       // macro region (storage key + sampler mode)
  countryBoost: string | null;     // bplace_country name to front-load, or null
}

// macro_region → RegionParam (for the IP fallback). Regions without a dedicated picker
// entry (oceania / subsaharan / other / unknown) fall back to 'global'.
const MACRO_TO_PARAM: Record<MacroRegion, RegionParam> = {
  usa_canada:        'north_america',
  western_europe:    'europe',
  ru_cis:            'russia_cis',
  kz_ca:             'kz',
  east_asia:         'east_asia',
  south_asia:        'south_asia',
  middle_east:       'middle_east_north_africa',
  north_africa:      'middle_east_north_africa',
  latin_america:     'latin_america',
  subsaharan_africa: 'global',
  oceania:           'global',
  other_region:      'global',
  unknown:           'global',
};

// ISO 3166-1 alpha-2 → bplace_country name EXACTLY as stored in play_pools (so the name
// matches both MACRO_REGION_MAP and the person rows). Unmapped codes → graceful fallback.
const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  US: 'United States', CA: 'Canada',
  GB: 'United Kingdom', DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain',
  NL: 'Netherlands', BE: 'Belgium', SE: 'Sweden', NO: 'Norway', DK: 'Denmark',
  FI: 'Finland', CH: 'Switzerland', AT: 'Austria', IE: 'Ireland', PT: 'Portugal',
  CZ: 'Czechia', PL: 'Poland', HU: 'Hungary', GR: 'Greece', RO: 'Romania',
  BG: 'Bulgaria', RS: 'Serbia', HR: 'Croatia', SI: 'Slovenia', MK: 'North Macedonia',
  EE: 'Estonia', LV: 'Latvia', AL: 'Albania', CY: 'Cyprus', MT: 'Malta',
  LU: 'Luxembourg', MC: 'Monaco', IM: 'Isle of Man', JE: 'Jersey', BA: 'Bosnia and Herzegovina',
  RU: 'Russia', UA: 'Ukraine', BY: 'Belarus', GE: 'Georgia', AM: 'Armenia',
  AZ: 'Azerbaijan', MD: 'Moldova',
  KZ: 'Kazakhstan', UZ: 'Uzbekistan', KG: 'Kyrgyzstan', TJ: 'Tajikistan',
  TM: 'Turkmenistan', MN: 'Mongolia',
  CN: 'China', JP: 'Japan', KR: 'South Korea', TW: 'Taiwan', HK: 'Hong Kong',
  MO: 'Macao', VN: 'Vietnam', TH: 'Thailand', MY: 'Malaysia', SG: 'Singapore',
  PH: 'Philippines', ID: 'Indonesia', MM: 'Myanmar (Burma)', KH: 'Cambodia', KP: 'North Korea',
  IN: 'India', PK: 'Pakistan', BD: 'Bangladesh', NP: 'Nepal', AF: 'Afghanistan',
  SA: 'Saudi Arabia', IR: 'Iran', IQ: 'Iraq', SY: 'Syria', IL: 'Israel',
  TR: 'Türkiye', AE: 'United Arab Emirates', QA: 'Qatar', KW: 'Kuwait', JO: 'Jordan',
  LB: 'Lebanon', OM: 'Oman', YE: 'Yemen',
  EG: 'Egypt', MA: 'Morocco', DZ: 'Algeria', TN: 'Tunisia', LY: 'Libya',
  NG: 'Nigeria', ZA: 'South Africa', KE: 'Kenya', GH: 'Ghana', ET: 'Ethiopia',
  TZ: 'Tanzania', CM: 'Cameroon', SN: 'Senegal', MZ: 'Mozambique', UG: 'Uganda',
  ZW: 'Zimbabwe', LR: 'Liberia', ML: 'Mali', BJ: 'Benin', RW: 'Rwanda',
  BF: 'Burkina Faso', GW: 'Guinea-Bissau', CI: "Côte d'Ivoire",
  CD: 'Democratic Republic of the Congo', SO: 'Somalia',
  MX: 'Mexico', BR: 'Brazil', AR: 'Argentina', CO: 'Colombia', CL: 'Chile',
  PE: 'Peru', VE: 'Venezuela', CU: 'Cuba', PR: 'Puerto Rico', UY: 'Uruguay',
  DO: 'Dominican Republic', SV: 'El Salvador', GT: 'Guatemala', NI: 'Nicaragua',
  EC: 'Ecuador', PA: 'Panama', JM: 'Jamaica', TT: 'Trinidad and Tobago', BB: 'Barbados',
  AU: 'Australia', NZ: 'New Zealand',
};

export function countryNameFromCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRY_CODE_TO_NAME[code.toUpperCase()] ?? null;
}

function isExplicitRegion(raw: string | string[] | undefined): raw is RegionParam {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return !!v && (REGION_PARAMS as readonly string[]).includes(v);
}

export function resolveRegionContext(
  regionParam:   string | string[] | undefined,
  ipCountryCode: string | null | undefined,
  fallback:      RegionParam,
): RegionContext {
  const ipName  = countryNameFromCode(ipCountryCode);
  const ipMacro: MacroRegion | null = ipName ? (MACRO_REGION_MAP[ipName] ?? null) : null;

  // ── No explicit selection → IP country drives boost + macro fallback ──
  if (!isExplicitRegion(regionParam)) {
    if (ipName && ipMacro) {
      const region = MACRO_TO_PARAM[ipMacro];
      // KZ keeps its curated kz_ca path (no generic country boost).
      return region === 'kz' ? { region: 'kz', countryBoost: null } : { region, countryBoost: ipName };
    }
    return { region: fallback, countryBoost: null };
  }

  // ── Explicit selection wins ──
  const selected = (Array.isArray(regionParam) ? regionParam[0] : regionParam) as RegionParam;
  // kz = curated path; global = explicit "other" → no country boost.
  if (selected === 'kz' || selected === 'global') return { region: selected, countryBoost: null };

  // Country boost only if the IP country belongs to the selected macro region.
  const macros = REGION_BOOST[selected]?.macroRegions ?? [];
  const compatible = !!ipMacro && macros.includes(ipMacro);
  return { region: selected, countryBoost: compatible ? ipName : null };
}
