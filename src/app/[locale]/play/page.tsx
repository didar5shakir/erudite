import fs from 'node:fs';
import path from 'node:path';

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';

import { createInitialSessionDeck } from '@/lib/play/play-sampler';
import type { RegionParam } from '@/lib/play/play-sampler';
import { resolveRegionContext, isExplicitRegionParam } from '@/lib/play/region-context';
import { decodeChallenge } from '@/lib/play/challenge';
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

  // Region selection is mandatory. An EXPLICIT ?region=<id> always wins and may use IP
  // (x-vercel-ip-country, server-only) for a compatible country boost. A bare /play (no
  // explicit region) must NOT silently start a game via IP — PlayPage redirects to
  // /onboarding unless a resumable session exists. So for the non-explicit case we use the
  // plain locale fallback (no IP) just for the session-key lookup.
  const { region, c } = await searchParams;
  const fallback: RegionParam = locale === 'kk' ? 'kz' : 'global';
  const regionExplicit = isExplicitRegionParam(region);

  let resolvedRegion: RegionParam = fallback;
  let countryBoost: string | null = null;
  if (regionExplicit) {
    const ipCountry = (await headers()).get('x-vercel-ip-country');
    ({ region: resolvedRegion, countryBoost } = resolveRegionContext(region, ipCountry, fallback));
  }

  // Optional friendly "compare with a friend" payload (?c=…). Decodes fail-safe to null
  // (invalid/oversized → ignored). Display-only: shown on the result screen, never affects
  // the test/sampler/estimate.
  const inviterSummary = decodeChallenge(c);

  const pools = loadPools();
  const deck = createInitialSessionDeck(pools, resolvedRegion, undefined, countryBoost);

  const t = await getTranslations('play');

  return (
    <PlayPage
      initialDeck={deck}
      locale={locale}
      region={resolvedRegion}
      regionExplicit={regionExplicit}
      countryBoost={countryBoost}
      inviterSummary={inviterSummary}
      labels={{
        know:      t('know'),
        heard:     t('heard'),
        dont_know: t('dont_know'),
        loading:   t('loading'),
      }}
    />
  );
}
