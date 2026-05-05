import type { Person, PlayPools } from './types';

// Local extension — kz_ca_top lives in JSON but not in shared types.ts
interface PlayPoolsExtended extends PlayPools {
  kz_ca_top?: Person[];
}

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
  min: number;
  max: number;
  need: number;
}

const TOP_BUCKETS: Bucket[] = [
  { min: 1,    max: 100,  need: 10 },
  { min: 101,  max: 500,  need: 10 },
  { min: 501,  max: 1500, need: 10 },
  { min: 1501, max: 5000, need: 10 },
];

const KZ_BUCKETS: Bucket[] = [
  { min: 1,    max: 100,  need: 6 },
  { min: 101,  max: 500,  need: 6 },
  { min: 501,  max: 1500, need: 6 },
  { min: 1501, max: 5000, need: 5 },
];

// ── Основная функция ──────────────────────────────────────────────────────────

export function createMixedSessionDeck(pools: PlayPoolsExtended, region?: 'kz'): Person[] {
  const usedIds = new Set<string>();
  const deck: Person[] = [];

  if (region === 'kz') {
    // 23 из top_5000 по KZ-бакетам: 6/6/6/5
    for (const bucket of KZ_BUCKETS) {
      const pool = pools.top_5000.filter(
        (p) => p.global_rank >= bucket.min && p.global_rank <= bucket.max,
      );
      let picked = sampleUnique(pool, bucket.need, usedIds);
      if (picked.length < bucket.need) {
        const fallback = sampleUnique(pools.top_5000, bucket.need - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }

    // 9 из ru_quota
    {
      let picked = sampleUnique(pools.ru_quota, 9, usedIds);
      if (picked.length < 9) {
        const fallback = sampleUnique(pools.top_5000, 9 - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }

    // 15 из kz_ca_top — без fallback; бросаем ошибку если пула нет или не хватает
    {
      const kzPool = pools.kz_ca_top;
      if (!kzPool || kzPool.length < 15) {
        throw new Error(
          `kz_ca_top pool has ${kzPool?.length ?? 0} entries, need at least 15`,
        );
      }
      const picked = sampleUnique(kzPool, 15, usedIds);
      if (picked.length < 15) {
        throw new Error(
          `kz_ca_top yielded only ${picked.length} unique entries after dedup, need 15`,
        );
      }
      deck.push(...picked);
    }

    // 3 из hpi_quota
    {
      let picked = sampleUnique(pools.hpi_quota, 3, usedIds);
      if (picked.length < 3) {
        const fallback = sampleUnique(pools.top_5000, 3 - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }
  } else {
    // Default: 40 из top_5000 по бакетам 10/10/10/10
    for (const bucket of TOP_BUCKETS) {
      const pool = pools.top_5000.filter(
        (p) => p.global_rank >= bucket.min && p.global_rank <= bucket.max,
      );
      let picked = sampleUnique(pool, bucket.need, usedIds);
      if (picked.length < bucket.need) {
        const fallback = sampleUnique(pools.top_5000, bucket.need - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }

    // 4 из ru_quota
    {
      let picked = sampleUnique(pools.ru_quota, 4, usedIds);
      if (picked.length < 4) {
        const fallback = sampleUnique(pools.top_5000, 4 - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }

    // 4 из kz_quota
    {
      let picked = sampleUnique(pools.kz_quota, 4, usedIds);
      if (picked.length < 4) {
        const fallback = sampleUnique(pools.top_5000, 4 - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }

    // 2 из hpi_quota
    {
      let picked = sampleUnique(pools.hpi_quota, 2, usedIds);
      if (picked.length < 2) {
        const fallback = sampleUnique(pools.top_5000, 2 - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }
  }

  return shuffle(deck);
}
