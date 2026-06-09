'use client';

import { useTranslations } from 'next-intl';

import type { AnswerType, Person } from '@/lib/play/types';
import { getCategoryLabel, getCountryLabel } from '@/lib/play/localized-labels';
import { formatYearRange } from '@/lib/play/format-utils';

interface Labels {
  know: string;
  heard: string;
  dont_know: string;
}

interface Progress {
  current: number;
  total: number;
}

interface PlayCardProps {
  person: Person;
  locale: string;
  labels: Labels;
  onAnswer: (answer: AnswerType) => void;
  progress: Progress;
}

function pickDisplayName(person: Person, locale: string): string {
  if (locale === 'ru') {
    return person.display_name_ru ?? person.display_name_en ?? person.name;
  }
  if (locale === 'kk') {
    return (
      person.display_name_kk ??
      person.display_name_ru ??
      person.display_name_en ??
      person.name
    );
  }
  return person.display_name_en ?? person.name;
}

export default function PlayCard({ person, locale, labels, onAnswer, progress }: PlayCardProps) {
  const t           = useTranslations('play');
  const years       = formatYearRange(person.birthyear, person.deathyear, locale);
  const displayName = pickDisplayName(person, locale);
  const occupation  = getCategoryLabel(person, locale);
  const country     = getCountryLabel(person.bplace_country, locale);

  // Rare, single-card micro-hints (no analytics): once at card 10, once at card 30.
  const hint =
    progress.current === 10 ? t('hint_heard') :
    progress.current === 30 ? t('hint_adaptive') :
    null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">

        <div className="space-y-1 text-center">
          <p className="text-muted text-sm">
            {progress.current} / {progress.total}
          </p>
          {hint && (
            <p className="text-emerald-deep text-xs">{hint}</p>
          )}
        </div>

        <div className="bg-white border border-divider rounded-2xl shadow-sm p-8 text-center space-y-3">
          <h2 className="text-4xl font-serif font-semibold text-graphite leading-tight">
            {displayName}
          </h2>

          {years && (
            <p className="text-muted text-lg">{years}</p>
          )}

          {occupation && (
            <p className="text-graphite text-base">{occupation}</p>
          )}

          {country && (
            <p className="text-muted text-sm">{country}</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => onAnswer('know')}
            className="flex-1 py-4 rounded-xl bg-emerald-deep text-white font-semibold text-lg hover:opacity-90 active:opacity-100 transition-opacity"
          >
            {labels.know}
          </button>

          <button
            onClick={() => onAnswer('heard')}
            className="flex-1 py-4 rounded-xl bg-amber-600 text-white font-semibold text-lg hover:bg-amber-500 active:bg-amber-700 transition-colors"
          >
            {labels.heard}
          </button>

          <button
            onClick={() => onAnswer('dont_know')}
            className="flex-1 py-4 rounded-xl bg-rose-700 text-white font-semibold text-lg hover:bg-rose-600 active:bg-rose-800 transition-colors"
          >
            {labels.dont_know}
          </button>
        </div>

    </div>
  );
}
