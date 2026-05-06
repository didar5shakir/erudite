import type { Domain, MacroRegion, EraBucket, DifficultyBucket, ContentSensitivity } from './types';
import type { Person } from './types';

// ── Domain map ────────────────────────────────────────────────────────────────

const DOMAIN_MAP: Record<string, Domain> = {
  // politics
  'POLITICIAN':           'politics',
  'MILITARY PERSONNEL':   'politics',
  'NOBLEMAN':             'politics',
  'DIPLOMAT':             'politics',
  'JUDGE':                'politics',
  'PUBLIC WORKER':        'politics',
  'SOCIAL ACTIVIST':      'politics',
  // entertainment
  'ACTOR':                'entertainment',
  'SINGER':               'entertainment',
  'MUSICIAN':             'entertainment',
  'FILM DIRECTOR':        'entertainment',
  'COMEDIAN':             'entertainment',
  'DANCER':               'entertainment',
  'PRODUCER':             'entertainment',
  'PRESENTER':            'entertainment',
  'TV PERSONALITY':       'entertainment',
  'YOUTUBER':             'entertainment',
  'GAMER':                'entertainment',
  'MODEL':                'entertainment',
  'CELEBRITY':            'entertainment',
  'MAGICIAN':             'entertainment',
  'COMPOSER':             'entertainment',
  'SCREENWRITER':         'entertainment',
  'PORNOGRAPHIC ACTOR':   'entertainment',
  // science
  'PHYSICIST':            'science',
  'MATHEMATICIAN':        'science',
  'BIOLOGIST':            'science',
  'CHEMIST':              'science',
  'ASTRONOMER':           'science',
  'GEOGRAPHER':           'science',
  'ENGINEER':             'science',
  'COMPUTER SCIENTIST':   'science',
  'INVENTOR':             'science',
  'PSYCHOLOGIST':         'science',
  'ASTRONAUT':            'science',
  'ANTHROPOLOGIST':       'science',
  'SOCIOLOGIST':          'science',
  'PHYSICIAN':            'science',
  'ARCHAEOLOGIST':        'science',
  'POLITICAL SCIENTIST':  'science',
  // literature & thought
  'WRITER':               'literature_thought',
  'PHILOSOPHER':          'literature_thought',
  'HISTORIAN':            'literature_thought',
  'JOURNALIST':           'literature_thought',
  'CRITIC':               'literature_thought',
  'LINGUIST':             'literature_thought',
  'ECONOMIST':            'literature_thought',
  // sports
  'SOCCER PLAYER':        'sports',
  'BOXER':                'sports',
  'TENNIS PLAYER':        'sports',
  'RACING DRIVER':        'sports',
  'BASKETBALL PLAYER':    'sports',
  'WRESTLER':             'sports',
  'SKATER':               'sports',
  'GYMNAST':              'sports',
  'SWIMMER':              'sports',
  'CRICKETER':            'sports',
  'BASEBALL PLAYER':      'sports',
  'CHESS PLAYER':         'sports',
  'CYCLIST':              'sports',
  'ATHLETE':              'sports',
  'HOCKEY PLAYER':        'sports',
  'AMERICAN FOOTBALL PLAYER': 'sports',
  'VOLLEYBALL PLAYER':    'sports',
  'GOLFER':               'sports',
  'SNOOKER':              'sports',
  'SKIER':                'sports',
  'MOUNTAINEER':          'sports',
  'MARTIAL ARTS':         'sports',
  'COACH':                'sports',
  // art
  'PAINTER':              'art',
  'SCULPTOR':             'art',
  'ARCHITECT':            'art',
  'DESIGNER':             'art',
  'PHOTOGRAPHER':         'art',
  'FASHION DESIGNER':     'art',
  'ARTIST':               'art',
  'COMIC ARTIST':         'art',
  'GAME DESIGNER':        'art',
  // religion
  'RELIGIOUS FIGURE':     'religion',
  'COMPANION':            'religion',
  // business & tech
  'BUSINESSPERSON':       'business_tech',
  'LAWYER':               'business_tech',
  // crime & power
  'EXTREMIST':            'crime_power',
  'MAFIOSO':              'crime_power',
  'PIRATE':               'crime_power',
  // other
  'OCCULTIST':            'other',
  'EXPLORER':             'other',
  'CHEF':                 'other',
  'INSPIRATION':          'other',
  'PILOT':                'other',
  'TEACHER':              'other',
};

// ── Subdomain map (sports + entertainment only) ───────────────────────────────

const SUBDOMAIN_MAP: Record<string, string> = {
  // sports
  'SOCCER PLAYER':            'football',
  'BOXER':                    'boxing',
  'TENNIS PLAYER':            'tennis',
  'RACING DRIVER':            'motorsport',
  'BASKETBALL PLAYER':        'basketball',
  'WRESTLER':                 'wrestling',
  'SKATER':                   'skating',
  'GYMNAST':                  'gymnastics',
  'SWIMMER':                  'swimming',
  'CRICKETER':                'cricket',
  'BASEBALL PLAYER':          'baseball',
  'CHESS PLAYER':             'chess',
  'CYCLIST':                  'cycling',
  'ATHLETE':                  'athletics',
  'HOCKEY PLAYER':            'hockey',
  'AMERICAN FOOTBALL PLAYER': 'american_football',
  'VOLLEYBALL PLAYER':        'volleyball',
  'GOLFER':                   'golf',
  'SNOOKER':                  'snooker',
  'SKIER':                    'skiing',
  'MOUNTAINEER':              'mountaineering',
  'MARTIAL ARTS':             'martial_arts',
  'COACH':                    'sports_coaching',
  // entertainment
  'ACTOR':                    'actor',
  'SINGER':                   'singer',
  'MUSICIAN':                 'musician',
  'FILM DIRECTOR':            'film_director',
  'COMEDIAN':                 'comedian',
  'DANCER':                   'dancer',
  'PRODUCER':                 'producer',
  'PRESENTER':                'tv_presenter',
  'TV PERSONALITY':           'tv_presenter',
  'YOUTUBER':                 'digital_creator',
  'GAMER':                    'digital_creator',
  'MODEL':                    'modeling',
  'CELEBRITY':                'celebrity',
  'MAGICIAN':                 'magic',
  'COMPOSER':                 'composer',
  'SCREENWRITER':             'screenwriting',
  'PORNOGRAPHIC ACTOR':       'adult',
};

// ── Macro region map ──────────────────────────────────────────────────────────

const MACRO_REGION_MAP: Record<string, MacroRegion> = {
  'United States': 'usa_canada', 'Canada': 'usa_canada',
  'United Kingdom': 'western_europe', 'Germany': 'western_europe',
  'France': 'western_europe', 'Italy': 'western_europe',
  'Spain': 'western_europe', 'Netherlands': 'western_europe',
  'Belgium': 'western_europe', 'Sweden': 'western_europe',
  'Norway': 'western_europe', 'Denmark': 'western_europe',
  'Finland': 'western_europe', 'Switzerland': 'western_europe',
  'Austria': 'western_europe', 'Ireland': 'western_europe',
  'Portugal': 'western_europe', 'Czechia': 'western_europe',
  'Poland': 'western_europe', 'Hungary': 'western_europe',
  'Greece': 'western_europe', 'Romania': 'western_europe',
  'Bulgaria': 'western_europe', 'Serbia': 'western_europe',
  'Croatia': 'western_europe', 'Slovenia': 'western_europe',
  'North Macedonia': 'western_europe', 'Estonia': 'western_europe',
  'Latvia': 'western_europe', 'Albania': 'western_europe',
  'Cyprus': 'western_europe', 'Malta': 'western_europe',
  'Luxembourg': 'western_europe', 'Monaco': 'western_europe',
  'Isle of Man': 'western_europe', 'Jersey': 'western_europe',
  'Bosnia and Herzegovina': 'western_europe',
  'Russia': 'ru_cis', 'Ukraine': 'ru_cis', 'Belarus': 'ru_cis',
  'Georgia': 'ru_cis', 'Armenia': 'ru_cis', 'Azerbaijan': 'ru_cis',
  'Moldova': 'ru_cis',
  'Kazakhstan': 'kz_ca', 'Uzbekistan': 'kz_ca', 'Kyrgyzstan': 'kz_ca',
  'Tajikistan': 'kz_ca', 'Turkmenistan': 'kz_ca', 'Mongolia': 'kz_ca',
  'China': 'east_asia', 'Japan': 'east_asia', 'South Korea': 'east_asia',
  'Taiwan': 'east_asia', 'Hong Kong': 'east_asia', 'Macao': 'east_asia',
  'Vietnam': 'east_asia', 'Thailand': 'east_asia', 'Malaysia': 'east_asia',
  'Singapore': 'east_asia', 'Philippines': 'east_asia', 'Indonesia': 'east_asia',
  'Myanmar (Burma)': 'east_asia', 'Cambodia': 'east_asia', 'North Korea': 'east_asia',
  'India': 'south_asia', 'Pakistan': 'south_asia', 'Bangladesh': 'south_asia',
  'Nepal': 'south_asia', 'Afghanistan': 'south_asia',
  'Saudi Arabia': 'middle_east', 'Iran': 'middle_east', 'Iraq': 'middle_east',
  'Syria': 'middle_east', 'Israel': 'middle_east', 'Türkiye': 'middle_east',
  'United Arab Emirates': 'middle_east', 'Qatar': 'middle_east',
  'Kuwait': 'middle_east', 'Jordan': 'middle_east', 'Lebanon': 'middle_east',
  'Oman': 'middle_east', 'Yemen': 'middle_east',
  'Egypt': 'north_africa', 'Morocco': 'north_africa', 'Algeria': 'north_africa',
  'Tunisia': 'north_africa', 'Libya': 'north_africa',
  'Nigeria': 'subsaharan_africa', 'South Africa': 'subsaharan_africa',
  'Kenya': 'subsaharan_africa', 'Ghana': 'subsaharan_africa',
  'Ethiopia': 'subsaharan_africa', 'Tanzania': 'subsaharan_africa',
  'Cameroon': 'subsaharan_africa', 'Senegal': 'subsaharan_africa',
  'Mozambique': 'subsaharan_africa', 'Uganda': 'subsaharan_africa',
  'Zimbabwe': 'subsaharan_africa', 'Liberia': 'subsaharan_africa',
  'Mali': 'subsaharan_africa', 'Benin': 'subsaharan_africa',
  'Rwanda': 'subsaharan_africa', 'Burkina Faso': 'subsaharan_africa',
  "Guinea-Bissau": 'subsaharan_africa', "Côte d'Ivoire": 'subsaharan_africa',
  'Democratic Republic of the Congo': 'subsaharan_africa', 'Somalia': 'subsaharan_africa',
  'Mexico': 'latin_america', 'Brazil': 'latin_america', 'Argentina': 'latin_america',
  'Colombia': 'latin_america', 'Chile': 'latin_america', 'Peru': 'latin_america',
  'Venezuela': 'latin_america', 'Cuba': 'latin_america', 'Puerto Rico': 'latin_america',
  'Uruguay': 'latin_america', 'Dominican Republic': 'latin_america',
  'El Salvador': 'latin_america', 'Guatemala': 'latin_america',
  'Nicaragua': 'latin_america', 'Ecuador': 'latin_america', 'Panama': 'latin_america',
  'Jamaica': 'latin_america', 'Trinidad and Tobago': 'latin_america',
  'Barbados': 'latin_america', 'Saint Lucia': 'latin_america',
  'Saint Kitts and Nevis': 'latin_america', 'Suriname': 'latin_america',
  'Guyana': 'latin_america', 'Aruba': 'latin_america', 'Martinique': 'latin_america',
  'Guadeloupe': 'latin_america', 'U.S. Virgin Islands': 'latin_america',
  'Australia': 'oceania', 'New Zealand': 'oceania', 'American Samoa': 'oceania',
  'Bermuda': 'other_region',
};

// ── Sensitive QIDs ────────────────────────────────────────────────────────────

const SCANDAL_QIDS = new Set([
  'Q2904131',   // Jeffrey Epstein
  'Q5556756',   // Ghislaine Maxwell
  'Q78473599',  // Virginia Giuffre
  'Q216936',    // Sean Combs
]);

const CRIME_OCCUPATIONS = new Set([
  'EXTREMIST', 'MAFIOSO', 'PIRATE',
]);

// ── Tag functions ─────────────────────────────────────────────────────────────

export function getDomain(occupation: string | null | undefined): Domain {
  if (!occupation) return 'unknown';
  return DOMAIN_MAP[occupation.trim().toUpperCase()] ?? 'unknown';
}

export function getSubdomain(occupation: string | null | undefined): string | null {
  if (!occupation) return null;
  return SUBDOMAIN_MAP[occupation.trim().toUpperCase()] ?? null;
}

export function getMacroRegion(country: string | null | undefined): MacroRegion {
  if (!country) return 'unknown';
  return MACRO_REGION_MAP[country.trim()] ?? 'other_region';
}

export function getEraBucket(birthyear: number | null | undefined): EraBucket {
  if (birthyear == null) return 'unknown';
  if (birthyear < 0)     return 'ancient_bc';
  if (birthyear <= 499)  return 'classical_late_antiquity';
  if (birthyear <= 1499) return 'medieval';
  if (birthyear <= 1849) return 'early_modern';
  if (birthyear <= 1929) return 'industrial_modern';
  if (birthyear <= 1949) return 'postwar_births';
  if (birthyear <= 1969) return 'late_20c_births';
  if (birthyear <= 1989) return 'modern_media_births';
  return 'digital_births';
}

export function getDifficultyBucket(globalRank: number | null | undefined): DifficultyBucket {
  if (globalRank == null) return 'unknown';
  if (globalRank <= 1500)  return 'easy';
  if (globalRank <= 10000) return 'medium';
  return 'hard';
}

export function getContentSensitivity(
  wikidataId: string,
  occupation: string | null | undefined,
): ContentSensitivity {
  const occ = occupation?.trim().toUpperCase() ?? '';
  if (occ === 'PORNOGRAPHIC ACTOR')    return 'adult_excluded';
  if (CRIME_OCCUPATIONS.has(occ))      return 'crime_sensitive';
  if (SCANDAL_QIDS.has(wikidataId))    return 'scandal_sensitive';
  return 'normal';
}

// ── Convenience predicates for sampler use ────────────────────────────────────

export function isSensitive(person: Pick<Person, 'content_sensitivity'>): boolean {
  return person.content_sensitivity !== 'normal';
}

export function isHardExcluded(person: Pick<Person, 'content_sensitivity'>): boolean {
  return person.content_sensitivity === 'adult_excluded';
}

export function isSoftSensitive(person: Pick<Person, 'content_sensitivity'>): boolean {
  return (
    person.content_sensitivity === 'crime_sensitive' ||
    person.content_sensitivity === 'scandal_sensitive'
  );
}
