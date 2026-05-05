'use client';

import type { AnswerType, Person } from '@/lib/play/types';
import { getOccupationLabel, getCountryLabel } from '@/lib/play/localized-labels';
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
  const years       = formatYearRange(person.birthyear, person.deathyear, locale);
  const displayName = pickDisplayName(person, locale);
  const occupation  = getOccupationLabel(person.occupation, locale);
  const country     = getCountryLabel(person.bplace_country, locale);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">

        <p className="text-center text-neutral-500 text-sm">
          {progress.current} / {progress.total}
        </p>

        <div className="bg-neutral-900 rounded-xl shadow-lg p-8 text-center space-y-3">
          <h2 className="text-4xl font-serif font-semibold text-white leading-tight">
            {displayName}
          </h2>

          {years && (
            <p className="text-neutral-400 text-lg">{years}</p>
          )}

          {occupation && (
            <p className="text-neutral-300 text-base">{occupation}</p>
          )}

          {country && (
            <p className="text-neutral-500 text-sm">{country}</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => onAnswer('know')}
            className="flex-1 py-4 rounded-xl bg-green-700 hover:bg-green-600 active:bg-green-800 text-white font-semibold text-lg transition-colors"
          >
            {labels.know}
          </button>

          <button
            onClick={() => onAnswer('heard')}
            className="flex-1 py-4 rounded-xl bg-amber-700 hover:bg-amber-600 active:bg-amber-800 text-white font-semibold text-lg transition-colors"
          >
            {labels.heard}
          </button>

          <button
            onClick={() => onAnswer('dont_know')}
            className="flex-1 py-4 rounded-xl bg-neutral-700 hover:bg-neutral-600 active:bg-neutral-800 text-white font-semibold text-lg transition-colors"
          >
            {labels.dont_know}
          </button>
        </div>

    </div>
  );
}
