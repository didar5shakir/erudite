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
  SESSION_CARD_COUNT,
  EXPLORATION_RATIO_EARLY,
  EXPLORATION_RATIO_LATE,
  getInitialSessionCounts,
  buildAdaptiveCandidates,
  pickNextAdaptiveCard,
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

function appendAdaptiveCard(
  deck:    Person[],
  cardIds: string[],
  pools:   PlayPoolsExtended,
  region:  'kz' | 'global',
  nextIndex: number,
): { deck: Person[]; cardIds: string[] } {
  const usedIds = new Set(cardIds);
  const candidates = buildAdaptiveCandidates(pools, region, usedIds);
  const counts = getInitialSessionCounts(deck);
  const recentCards = deck.slice(-10);
  const exploreRatio = nextIndex < 50 ? EXPLORATION_RATIO_EARLY : EXPLORATION_RATIO_LATE;
  const mode: 'exploit' | 'explore' = Math.random() < exploreRatio ? 'explore' : 'exploit';
  const nextCard = pickNextAdaptiveCard({
    candidates,
    profile: getOrCreateAdaptiveProfile(),
    usedIds,
    counts,
    recentCards,
    rng: Math.random,
    mode,
  });
  if (!nextCard) return { deck, cardIds };
  return {
    deck:    [...deck, nextCard],
    cardIds: [...cardIds, nextCard.wikidata_id],
  };
}

export default function PlayPage({ initialDeck, locale, region, labels }: PlayPageProps) {
  const [session, setSession] = useState<PlaySession | null>(null);
  const [pools, setPools] = useState<PlayPoolsExtended | null>(null);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    fetch('/data/play_pools.json')
      .then(r => r.json())
      .then((data: PlayPoolsExtended) => setPools(data))
      .catch(() => { /* pools unavailable — adaptive picks skipped */ });
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

  // When pools arrive and we're waiting for an adaptive card, generate it
  useEffect(() => {
    if (!pools || !session || session.completed) return;
    if (session.currentIndex < session.deck.length) return; // card already exists
    if (session.deck.length >= SESSION_CARD_COUNT) return;

    const { deck: newDeck, cardIds: newCardIds } = appendAdaptiveCard(
      session.deck, session.cardIds, pools, region, session.currentIndex,
    );
    if (newDeck.length === session.deck.length) return; // picker returned null

    const updated = { ...session, deck: newDeck, cardIds: newCardIds };
    saveSession(updated, region);
    setSession(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pools]);

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

    const nextIndex = session.currentIndex + 1;

    const profile = getOrCreateAdaptiveProfile();
    const updatedProfile = updateAdaptiveProfile(profile, person, answer, { timestamp: now });
    saveAdaptiveProfile(updatedProfile);

    let newDeck = session.deck;
    let newCardIds = session.cardIds;

    // Lazy append: one adaptive card per answer once in adaptive phase
    if (
      nextIndex >= CALIB_SIZE &&
      newDeck.length < SESSION_CARD_COUNT &&
      pools !== null
    ) {
      const usedIds = new Set(newCardIds);
      const candidates = buildAdaptiveCandidates(pools, region, usedIds);
      const counts = getInitialSessionCounts(newDeck);
      const recentCards = newDeck.slice(-10);
      const exploreRatio = nextIndex < 50 ? EXPLORATION_RATIO_EARLY : EXPLORATION_RATIO_LATE;
      const mode: 'exploit' | 'explore' = Math.random() < exploreRatio ? 'explore' : 'exploit';
      const nextCard = pickNextAdaptiveCard({
        candidates,
        profile: updatedProfile,
        usedIds,
        counts,
        recentCards,
        rng: Math.random,
        mode,
      });
      if (nextCard) {
        newDeck    = [...newDeck, nextCard];
        newCardIds = [...newCardIds, nextCard.wikidata_id];
      }
    }

    const isCompleted = nextIndex >= SESSION_CARD_COUNT;
    const updated: PlaySession = {
      ...session,
      deck:         newDeck,
      cardIds:      newCardIds,
      answers:      { ...session.answers, [person.wikidata_id]: newAnswer },
      currentIndex: isCompleted ? newDeck.length : nextIndex,
      completed:    isCompleted,
    };

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

  // Waiting for pools to load so adaptive card can be generated
  if (!currentPerson) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <p className="text-neutral-500">{labels.loading}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-8">
      <PlayCard
        person={currentPerson}
        locale={locale}
        labels={{ know: labels.know, heard: labels.heard, dont_know: labels.dont_know }}
        onAnswer={handleAnswer}
        progress={{ current: session.currentIndex + 1, total: SESSION_CARD_COUNT }}
      />
    </div>
  );
}
