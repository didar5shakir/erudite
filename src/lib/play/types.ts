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
}

// ── Структура play_pools.json ─────────────────────────────────────────────────

export interface PlayPools {
  top_5000: Person[];
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
  deck: Person[];                    // 50 фигур в перемешанном порядке
  cardIds: string[];                 // wikidata_id тех же 50 фигур (для быстрого поиска)
  createdAt: string;                 // ISO 8601
  updatedAt: string;                 // ISO 8601
  currentIndex: number;              // 0–49, индекс текущей карточки
  answers: Record<string, Answer>;   // ключ — wikidata_id
  completed: boolean;
}
