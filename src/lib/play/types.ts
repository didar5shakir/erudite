// ── Derived tag types ─────────────────────────────────────────────────────────

export type Domain =
  | 'politics'
  | 'entertainment'
  | 'science'
  | 'literature_thought'
  | 'sports'
  | 'art'
  | 'religion'
  | 'business_tech'
  | 'crime_power'
  | 'other'
  | 'unknown';

export type MacroRegion =
  | 'usa_canada'
  | 'western_europe'
  | 'ru_cis'
  | 'kz_ca'
  | 'east_asia'
  | 'south_asia'
  | 'middle_east'
  | 'north_africa'
  | 'subsaharan_africa'
  | 'latin_america'
  | 'oceania'
  | 'other_region'
  | 'unknown';

export type EraBucket =
  | 'ancient_bc'
  | 'classical_late_antiquity'
  | 'medieval'
  | 'early_modern'
  | 'industrial_modern'
  | 'postwar_births'
  | 'late_20c_births'
  | 'modern_media_births'
  | 'digital_births'
  | 'unknown';

export type DifficultyBucket = 'easy' | 'medium' | 'hard' | 'unknown';

export type ContentSensitivity =
  | 'normal'
  | 'adult_excluded'
  | 'crime_sensitive'
  | 'scandal_sensitive';

// ── InclusionSource ───────────────────────────────────────────────────────────

export type InclusionSource =
  | 'global'
  | 'ru_quota'
  | 'kz_quota'
  | 'hpi_quota'
  | 'global_fill';

// ── Фигура из play_pools.json ─────────────────────────────────────────────────

export interface Person {
  wikidata_id: string;
  name: string;
  occupation: string;       // пустая строка если неизвестно
  bplace_country: string;   // пустая строка если неизвестно
  birthyear: number | null;
  deathyear: number | null;
  inclusion_source: InclusionSource;
  global_rank: number;
  global_score: number;
  ru_score: number;
  kz_score: number;
  hpi: number;
  display_name_en?: string | null;
  display_name_ru?: string | null;
  display_name_kk?: string | null;
  gender?: string | null;
  // derived tags (added in Stage 5 derived-tags sprint)
  domain: Domain;
  subdomain: string | null;
  country_tag: string | null;
  macro_region: MacroRegion;
  era_bucket: EraBucket;
  difficulty_bucket: DifficultyBucket;
  content_sensitivity: ContentSensitivity;
}

// ── Структура play_pools.json ─────────────────────────────────────────────────

export interface PlayPools {
  top_30000: Person[];
  ru_quota: Person[];
  kz_quota: Person[];
  hpi_quota: Person[];
}

// ── Ответ пользователя ────────────────────────────────────────────────────────

export type AnswerType = 'know' | 'heard' | 'dont_know';

export interface Answer {
  qid: string;         // wikidata_id фигуры
  answer: AnswerType;
  answeredAt: string;  // ISO 8601
  responseMs: number;  // мс с момента показа карточки до ответа
}

// ── Сессия (хранится в localStorage) ─────────────────────────────────────────

export interface PlaySession {
  version: 1;
  locale: string;
  sessionId: string;
  deck: Person[];                    // 100 фигур в перемешанном порядке
  cardIds: string[];                 // wikidata_id тех же 100 фигур (для быстрого поиска)
  createdAt: string;                 // ISO 8601
  updatedAt: string;                 // ISO 8601
  currentIndex: number;              // 0–99, индекс текущей карточки
  answers: Record<string, Answer>;   // ключ — wikidata_id
  completed: boolean;
  adaptiveTailGenerated?: boolean;   // true после замены карточек 31–100 на адаптивные
}
