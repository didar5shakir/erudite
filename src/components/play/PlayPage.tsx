'use client';

import { useEffect, useRef, useState } from 'react';

import type { Answer, AnswerType, Person, PlaySession } from '@/lib/play/types';
import {
  clearSession,
  createNewSession,
  loadSession,
  saveSession,
} from '@/lib/play/play-storage';
import PlayCard from './PlayCard';
import PlayResult from './PlayResult';

interface Labels {
  know: string;
  heard: string;
  dont_know: string;
  result_title: string;  // шаблон с {count}: "You recognized {count} out of 50"
  play_again: string;
  loading: string;
}

interface PlayPageProps {
  initialDeck: Person[];
  locale: string;
  labels: Labels;
}

function computeCounts(answers: Record<string, Answer>) {
  let know = 0;
  let heard = 0;
  let dont_know = 0;
  for (const a of Object.values(answers)) {
    if (a.answer === 'know') know++;
    else if (a.answer === 'heard') heard++;
    else dont_know++;
  }
  return { know, heard, dont_know };
}

export default function PlayPage({ initialDeck, locale, labels }: PlayPageProps) {
  const [session, setSession] = useState<PlaySession | null>(null);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    const existing = loadSession(locale);
    if (existing) {
      setSession(existing);
    } else {
      const fresh = createNewSession(locale, initialDeck);
      saveSession(fresh);
      setSession(fresh);
    }
    startedAt.current = Date.now();
  // initialDeck identity is stable (comes from server), locale changes trigger new session
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  function handleAnswer(answer: AnswerType) {
    if (!session || session.completed) return;

    const person = session.deck[session.currentIndex];
    const newAnswer: Answer = {
      qid: person.wikidata_id,
      answer,
      answeredAt: new Date().toISOString(),
      responseMs: Date.now() - startedAt.current,
    };

    const isLast = session.currentIndex + 1 >= session.deck.length;
    const updated: PlaySession = {
      ...session,
      answers: { ...session.answers, [person.wikidata_id]: newAnswer },
      currentIndex: isLast ? session.deck.length : session.currentIndex + 1,
      completed: isLast,
    };

    saveSession(updated);
    setSession(updated);
    startedAt.current = Date.now();
  }

  function handlePlayAgain() {
    clearSession(locale);
    const fresh = createNewSession(locale, initialDeck);
    saveSession(fresh);
    setSession(fresh);
    startedAt.current = Date.now();
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <p className="text-neutral-500">{labels.loading}</p>
      </div>
    );
  }

  if (session.completed) {
    const counts = computeCounts(session.answers);
    const resultTitle = labels.result_title.replace('{count}', String(counts.know));
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-8">
        <PlayResult
          counts={counts}
          total={session.deck.length}
          labels={{ know: labels.know, heard: labels.heard, dont_know: labels.dont_know }}
          resultTitle={resultTitle}
          playAgainLabel={labels.play_again}
          onPlayAgain={handlePlayAgain}
        />
      </div>
    );
  }

  const currentPerson = session.deck[session.currentIndex];
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-8">
      <PlayCard
        person={currentPerson}
        labels={{ know: labels.know, heard: labels.heard, dont_know: labels.dont_know }}
        onAnswer={handleAnswer}
        progress={{ current: session.currentIndex + 1, total: session.deck.length }}
      />
    </div>
  );
}
