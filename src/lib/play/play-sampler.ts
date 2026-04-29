import type { Person, PlayPools } from './types';

// ── Fisher-Yates shuffle ──────────────────────────────────────────────────────

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Случайная выборка без повторов ────────────────────────────────────────────

export function sampleUnique<T extends { wikidata_id: string }>(
  items: T[],
  count: number,
  usedIds: Set<string>,
): T[] {
  const candidates = items.filter((p) => !usedIds.has(p.wikidata_id));
  const shuffled = shuffle(candidates);
  const picked = shuffled.slice(0, count);
  picked.forEach((p) => usedIds.add(p.wikidata_id));
  return picked;
}

// ── Конфигурация бакетов ──────────────────────────────────────────────────────

interface Bucket {
  min: number;  // global_rank нижняя граница (включительно)
  max: number;  // global_rank верхняя граница (включительно)
  need: number; // сколько нужно взять
}

const TOP_BUCKETS: Bucket[] = [
  { min: 1,    max: 100,  need: 10 },
  { min: 101,  max: 500,  need: 10 },
  { min: 501,  max: 1500, need: 10 },
  { min: 1501, max: 5000, need: 10 },
];

// ── Основная функция ──────────────────────────────────────────────────────────

export function createMixedSessionDeck(pools: PlayPools): Person[] {
  const usedIds = new Set<string>();
  const deck: Person[] = [];

  // Бакеты из top_5000
  for (const bucket of TOP_BUCKETS) {
    const pool = pools.top_5000.filter(
      (p) => p.global_rank >= bucket.min && p.global_rank <= bucket.max,
    );

    let picked = sampleUnique(pool, bucket.need, usedIds);

    // Если в бакете не хватило — добираем из всего top_5000 (исключая уже взятых)
    if (picked.length < bucket.need) {
      const fallback = sampleUnique(
        pools.top_5000,
        bucket.need - picked.length,
        usedIds,
      );
      picked = [...picked, ...fallback];
    }

    deck.push(...picked);
  }

  // ru_quota — 4 фигуры
  {
    let picked = sampleUnique(pools.ru_quota, 4, usedIds);
    if (picked.length < 4) {
      const fallback = sampleUnique(pools.top_5000, 4 - picked.length, usedIds);
      picked = [...picked, ...fallback];
    }
    deck.push(...picked);
  }

  // kz_quota — 4 фигуры
  {
    let picked = sampleUnique(pools.kz_quota, 4, usedIds);
    if (picked.length < 4) {
      const fallback = sampleUnique(pools.top_5000, 4 - picked.length, usedIds);
      picked = [...picked, ...fallback];
    }
    deck.push(...picked);
  }

  // hpi_quota — 2 фигуры
  {
    let picked = sampleUnique(pools.hpi_quota, 2, usedIds);
    if (picked.length < 2) {
      const fallback = sampleUnique(pools.top_5000, 2 - picked.length, usedIds);
      picked = [...picked, ...fallback];
    }
    deck.push(...picked);
  }

  return shuffle(deck);
}
