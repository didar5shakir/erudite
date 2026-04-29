'use client';

import type { AnswerType, Person } from '@/lib/play/types';

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
  labels: Labels;
  onAnswer: (answer: AnswerType) => void;
  progress: Progress;
}

function formatYears(birthyear: number | null, deathyear: number | null): string | null {
  if (birthyear === null && deathyear === null) return null;
  if (birthyear !== null && deathyear !== null) return `${birthyear}–${deathyear}`;
  if (birthyear !== null) return `${birthyear}–`;
  return `–${deathyear}`;
}

export default function PlayCard({ person, labels, onAnswer, progress }: PlayCardProps) {
  const years = formatYears(person.birthyear, person.deathyear);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">

        <p className="text-center text-neutral-500 text-sm">
          {progress.current} / {progress.total}
        </p>

        <div className="bg-neutral-900 rounded-xl shadow-lg p-8 text-center space-y-3">
          <h2 className="text-4xl font-serif font-semibold text-white leading-tight">
            {person.name}
          </h2>

          {years && (
            <p className="text-neutral-400 text-lg">{years}</p>
          )}

          {person.occupation && (
            <p className="text-neutral-300 text-base">{person.occupation}</p>
          )}

          {person.bplace_country && (
            <p className="text-neutral-500 text-sm">{person.bplace_country}</p>
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
