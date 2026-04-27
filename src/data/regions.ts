export const ALL_REGION_IDS = [
  'north_america',
  'europe',
  'latin_america',
  'east_asia',
  'south_asia',
  'southeast_asia',
  'middle_east_north_africa',
  'russia_cis',
  'kazakhstan_central_asia',
  'other',
] as const;

export type RegionId = (typeof ALL_REGION_IDS)[number];

const REGION_ORDER: Record<string, RegionId[]> = {
  en: [
    'north_america',
    'europe',
    'latin_america',
    'east_asia',
    'south_asia',
    'southeast_asia',
    'middle_east_north_africa',
    'russia_cis',
    'kazakhstan_central_asia',
    'other',
  ],
  ru: [
    'russia_cis',
    'kazakhstan_central_asia',
    'europe',
    'north_america',
    'middle_east_north_africa',
    'east_asia',
    'south_asia',
    'latin_america',
    'southeast_asia',
    'other',
  ],
  kk: [
    'kazakhstan_central_asia',
    'russia_cis',
    'europe',
    'north_america',
    'middle_east_north_africa',
    'east_asia',
    'south_asia',
    'latin_america',
    'southeast_asia',
    'other',
  ],
};

export function getOrderedRegionIds(locale: string): RegionId[] {
  return REGION_ORDER[locale] ?? REGION_ORDER['en'];
}
