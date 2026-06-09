import fs from 'node:fs';
import path from 'node:path';

import { getTranslations, setRequestLocale } from 'next-intl/server';

import { createInitialSessionDeck, normalizeRegionParam } from '@/lib/play/play-sampler';
import type { RegionParam } from '@/lib/play/play-sampler';
import type { PlayPools } from '@/lib/play/types';
import PlayPage from '@/components/play/PlayPage';

export const dynamic = 'force-dynamic';

function loadPools(): PlayPools {
  const file = fs.readFileSync(
    path.join(process.cwd(), 'public/data/play_pools.json'),
    'utf-8',
  );
  return JSON.parse(file) as PlayPools;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Explicit ?region=<id> always wins; fall back to a locale default only when absent
  // or unrecognized. No IP/auto-detect (future autodetect must only fill this fallback).
  const { region } = await searchParams;
  const fallback: RegionParam = locale === 'kk' ? 'kz' : 'global';
  const resolvedRegion: RegionParam = normalizeRegionParam(region, fallback);

  const pools = loadPools();
  const deck = createInitialSessionDeck(pools, resolvedRegion);

  const t = await getTranslations('play');

  return (
    <PlayPage
      initialDeck={deck}
      locale={locale}
      region={resolvedRegion}
      labels={{
        know:      t('know'),
        heard:     t('heard'),
        dont_know: t('dont_know'),
        loading:   t('loading'),
      }}
    />
  );
}
