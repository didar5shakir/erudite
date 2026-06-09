import fs from 'node:fs';
import path from 'node:path';

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';

import { createInitialSessionDeck } from '@/lib/play/play-sampler';
import type { RegionParam } from '@/lib/play/play-sampler';
import { resolveRegionContext } from '@/lib/play/region-context';
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

  // Explicit ?region=<id> always wins. IP country (x-vercel-ip-country, server-only)
  // only adds a country boost when compatible with the selection, or drives the macro
  // fallback when no region was selected. The country code never reaches the client.
  const { region } = await searchParams;
  const ipCountry = (await headers()).get('x-vercel-ip-country');
  const fallback: RegionParam = locale === 'kk' ? 'kz' : 'global';
  const { region: resolvedRegion, countryBoost } = resolveRegionContext(region, ipCountry, fallback);

  const pools = loadPools();
  const deck = createInitialSessionDeck(pools, resolvedRegion, undefined, countryBoost);

  const t = await getTranslations('play');

  return (
    <PlayPage
      initialDeck={deck}
      locale={locale}
      region={resolvedRegion}
      countryBoost={countryBoost}
      labels={{
        know:      t('know'),
        heard:     t('heard'),
        dont_know: t('dont_know'),
        loading:   t('loading'),
      }}
    />
  );
}
