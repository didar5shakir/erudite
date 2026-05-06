'use client';

import { useEffect, useRef, useState } from 'react';

import type { Answer, AnswerType, Person, PlaySession } from '@/lib/play/types';
import {
  clearSession,
  createNewSession,
  loadSession,
  saveSession,
} from '@/lib/play/play-storage';
import { updateAdaptiveProfile } from '@/lib/play/adaptive-profile';
import {
  getOrCreateAdaptiveProfile,
  saveAdaptiveProfile,
} from '@/lib/play/adaptive-storage';
import {
  CALIB_SIZE,
  ADAPTIVE_TAIL_SIZE,
  createAdaptiveTail,
  getInitialSessionCounts,
} from '@/lib/play/play-sampler';
import type { PlayPoolsExtended } from '@/lib/play/play-sampler';
import { calculateResultEstimate } from '@/lib/play/result-estimate';
import PlayCard from './PlayCard';
import PlayResult from './PlayResult';

interface Labels {
  know: string;
  heard: string;
  dont_know: string;
  result_title: string;
  play_again: string;
  loading: string;
  result_estimate_pre: string;
  result_estimate_post: string;
  result_range_label: string;
  result_level_label: string;
  result_strong_title: string;
  result_weak_title: string;
  result_strong_empty: string;
  result_weak_empty: string;
  result_disclaimer: string;
  result_preliminary: string;
}

interface PlayPageProps {
  initialDeck: Person[];
  locale: string;
  region: 'kz' | 'global';
  labels: Labels;
}

export default function PlayPage({ initialDeck, locale, region, labels }: PlayPageProps) {
  const [session, setSession] = useState<PlaySession | null>(null);
  const [pools, setPools] = useState<PlayPoolsExtended | null>(null);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    fetch('/data/play_pools.json')
      .then(r => r.json())
      .then((data: PlayPoolsExtended) => setPools(data))
      .catch(() => { /* pools unavailable — adaptive tail skipped */ });
  }, []);

  useEffect(() => {
    const existing = loadSession(locale, region);
    if (existing) {
      setSession(existing);
    } else {
      const fresh = createNewSession(locale, initialDeck, region);
      saveSession(fresh, region);
      setSession(fresh);
    }
    startedAt.current = Date.now();
  // initialDeck identity is stable (comes from server), locale/region changes trigger new session
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, region]);

  function handleAnswer(answer: AnswerType) {
    if (!session || session.completed) return;

    const person = session.deck[session.currentIndex];
    const now = Date.now();
    const newAnswer: Answer = {
      qid: person.wikidata_id,
      answer,
      answeredAt: new Date().toISOString(),
      responseMs: now - startedAt.current,
    };

    const isLast = session.currentIndex + 1 >= session.deck.length;
    let updated: PlaySession = {
      ...session,
      answers: { ...session.answers, [person.wikidata_id]: newAnswer },
      currentIndex: isLast ? session.deck.length : session.currentIndex + 1,
      completed: isLast,
    };

    // Update adaptive profile (separate storage, persists across sessions)
    const profile = getOrCreateAdaptiveProfile();
    const updatedProfile = updateAdaptiveProfile(profile, person, answer, { timestamp: now });
    saveAdaptiveProfile(updatedProfile);

    // After the 30th card (last calibration card), replace the tail with adaptive picks
    if (
      session.currentIndex === CALIB_SIZE - 1 &&
      !session.adaptiveTailGenerated &&
      pools !== null
    ) {
      const calibCards = updated.deck.slice(0, CALIB_SIZE);
      const calibUsedIds = new Set(calibCards.map(p => p.wikidata_id));
      const sessionCounts = getInitialSessionCounts(calibCards);
      const adaptiveTail = createAdaptiveTail(
        pools, region, calibUsedIds, updatedProfile, sessionCounts,
      );
      if (adaptiveTail.length === ADAPTIVE_TAIL_SIZE) {
        const newDeck = [...calibCards, ...adaptiveTail];
        updated = {
          ...updated,
          deck:                  newDeck,
          cardIds:               newDeck.map(p => p.wikidata_id),
          adaptiveTailGenerated: true,
        };
      }
    }

    saveSession(updated, region);
    setSession(updated);
    startedAt.current = now;
  }

  function handlePlayAgain() {
    clearSession(locale, region);
    const fresh = createNewSession(locale, initialDeck, region);
    saveSession(fresh, region);
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
    const profile = getOrCreateAdaptiveProfile();
    const estimate = calculateResultEstimate(session.deck, session.answers, profile);
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-8">
        <PlayResult
          estimate={estimate}
          locale={locale}
          labels={{
            know:                labels.know,
            heard:               labels.heard,
            dont_know:           labels.dont_know,
            result_estimate_pre: labels.result_estimate_pre,
            result_estimate_post:labels.result_estimate_post,
            result_range_label:  labels.result_range_label,
            result_level_label:  labels.result_level_label,
            result_strong_title: labels.result_strong_title,
            result_weak_title:   labels.result_weak_title,
            result_strong_empty: labels.result_strong_empty,
            result_weak_empty:   labels.result_weak_empty,
            result_disclaimer:   labels.result_disclaimer,
            result_preliminary:  labels.result_preliminary,
          }}
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
        locale={locale}
        labels={{ know: labels.know, heard: labels.heard, dont_know: labels.dont_know }}
        onAnswer={handleAnswer}
        progress={{ current: session.currentIndex + 1, total: session.deck.length }}
      />
    </div>
  );
}
