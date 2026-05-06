import type { Person, PlayPools } from './types';
import { SENSITIVE_OCCUPATIONS } from './localized-labels';

export const SESSION_CARD_COUNT = 100;

// Local extension — kz_ca_top lives in JSON but not in shared types.ts
interface PlayPoolsExtended extends PlayPools {
  kz_ca_top?: Person[];
  // top_30000 is the base pool; inherited from PlayPools
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

// Default: 80 from top_30000 (20+20+20+20) + 8 ru + 8 kz + 4 hpi = 100
const TOP_BUCKETS: Bucket[] = [
  { min: 1,    max: 100,  need: 20 },
  { min: 101,  max: 500,  need: 20 },
  { min: 501,  max: 1500, need: 20 },
  { min: 1501, max: 5000, need: 20 },
];

// region=kz: 46 from top_30000 (12+12+12+10) + 18 ru + 30 kz_ca_top + 6 hpi = 100
const KZ_BUCKETS: Bucket[] = [
  { min: 1,    max: 100,  need: 12 },
  { min: 101,  max: 500,  need: 12 },
  { min: 501,  max: 1500, need: 12 },
  { min: 1501, max: 5000, need: 10 },
];

const KZ_CA_TARGET = 30; // kz_ca_top has 26; shortage filled from kz_quota then top_30000

// ── Sensitive filter ─────────────────────────────────────────────────────────

function isSensitivePerson(person: Person): boolean {
  return SENSITIVE_OCCUPATIONS.has(person.occupation ?? '');
}

// ── Основная функция ──────────────────────────────────────────────────────────

export function createMixedSessionDeck(pools: PlayPoolsExtended, region?: 'kz'): Person[] {
  const safe: PlayPoolsExtended = {
    top_30000: pools.top_30000.filter(p => !isSensitivePerson(p)),
    ru_quota:  pools.ru_quota.filter(p => !isSensitivePerson(p)),
    kz_quota:  pools.kz_quota.filter(p => !isSensitivePerson(p)),
    hpi_quota: pools.hpi_quota.filter(p => !isSensitivePerson(p)),
    kz_ca_top: pools.kz_ca_top?.filter(p => !isSensitivePerson(p)),
  };

  const usedIds = new Set<string>();
  const deck: Person[] = [];

  if (region === 'kz') {
    // 46 из top_30000 по KZ-бакетам: 12/12/12/10
    for (const bucket of KZ_BUCKETS) {
      const pool = safe.top_30000.filter(
        (p) => p.global_rank >= bucket.min && p.global_rank <= bucket.max,
      );
      let picked = sampleUnique(pool, bucket.need, usedIds);
      if (picked.length < bucket.need) {
        const fallback = sampleUnique(safe.top_30000, bucket.need - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }

    // 18 из ru_quota
    {
      let picked = sampleUnique(safe.ru_quota, 18, usedIds);
      if (picked.length < 18) {
        const fallback = sampleUnique(safe.top_30000, 18 - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }

    // До KZ_CA_TARGET (30) из kz_ca_top; нехватка добирается из kz_quota, затем top_30000
    {
      const kzPool = safe.kz_ca_top ?? [];
      let slot = sampleUnique(kzPool, KZ_CA_TARGET, usedIds);
      if (slot.length < KZ_CA_TARGET) {
        const fill = sampleUnique(safe.kz_quota, KZ_CA_TARGET - slot.length, usedIds);
        slot = [...slot, ...fill];
      }
      if (slot.length < KZ_CA_TARGET) {
        const fill = sampleUnique(safe.top_30000, KZ_CA_TARGET - slot.length, usedIds);
        slot = [...slot, ...fill];
      }
      deck.push(...slot);
    }

    // 6 из hpi_quota
    {
      let picked = sampleUnique(safe.hpi_quota, 6, usedIds);
      if (picked.length < 6) {
        const fallback = sampleUnique(safe.top_30000, 6 - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }
  } else {
    // Default: 80 из top_30000 по бакетам 20/20/20/20
    for (const bucket of TOP_BUCKETS) {
      const pool = safe.top_30000.filter(
        (p) => p.global_rank >= bucket.min && p.global_rank <= bucket.max,
      );
      let picked = sampleUnique(pool, bucket.need, usedIds);
      if (picked.length < bucket.need) {
        const fallback = sampleUnique(safe.top_30000, bucket.need - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }

    // 8 из ru_quota
    {
      let picked = sampleUnique(safe.ru_quota, 8, usedIds);
      if (picked.length < 8) {
        const fallback = sampleUnique(safe.top_30000, 8 - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }

    // 8 из kz_quota
    {
      let picked = sampleUnique(safe.kz_quota, 8, usedIds);
      if (picked.length < 8) {
        const fallback = sampleUnique(safe.top_30000, 8 - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }

    // 4 из hpi_quota
    {
      let picked = sampleUnique(safe.hpi_quota, 4, usedIds);
      if (picked.length < 4) {
        const fallback = sampleUnique(safe.top_30000, 4 - picked.length, usedIds);
        picked = [...picked, ...fallback];
      }
      deck.push(...picked);
    }
  }

  return shuffle(deck);
}
