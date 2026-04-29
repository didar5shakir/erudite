import fs from 'node:fs';
import path from 'node:path';

import { getTranslations, setRequestLocale } from 'next-intl/server';

import { createMixedSessionDeck } from '@/lib/play/play-sampler';
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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const pools = loadPools();
  const deck = createMixedSessionDeck(pools);

  const t = await getTranslations('play');

  return (
    <PlayPage
      initialDeck={deck}
      locale={locale}
      labels={{
        know: t('know'),
        heard: t('heard'),
        dont_know: t('dont_know'),
        result_title: t.raw('result_title'),
        play_again: t('play_again'),
        loading: t('loading'),
      }}
    />
  );
}
