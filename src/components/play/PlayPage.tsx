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
import type { AdaptiveProfile } from '@/lib/play/adaptive-profile';
import { track, type AnalyticsPayload } from '@/lib/analytics/track';
import { useRouter } from '@/i18n/navigation';
import {
  getOrCreateAdaptiveProfile,
  saveAdaptiveProfile,
  clearAdaptiveProfile,
} from '@/lib/play/adaptive-storage';
import {
  CALIB_SIZE,
  SESSION_CARD_COUNT,
  EXPLORATION_RATIO_EARLY,
  EXPLORATION_RATIO_LATE,
  getInitialSessionCounts,
  buildAdaptiveCandidates,
  pickNextAdaptiveCard,
  createInitialSessionDeck,
} from '@/lib/play/play-sampler';
import type { PlayPoolsExtended, RegionParam } from '@/lib/play/play-sampler';
import { calculateResultEstimate } from '@/lib/play/result-estimate';
import type { ResultEstimate } from '@/lib/play/result-estimate';
import PlayCard from './PlayCard';
import PlayResult from './PlayResult';

interface Labels {
  know: string;
  heard: string;
  dont_know: string;
  loading: string;
}

interface PlayPageProps {
  initialDeck: Person[];
  locale: string;
  region: RegionParam;
  regionExplicit: boolean;        // true if the URL carried an explicit ?region (mandatory-selection gate)
  countryBoost?: string | null;   // IP country boost (server-resolved); preserved across continue
  labels: Labels;
}

function appendAdaptiveCard(
  deck:    Person[],
  cardIds: string[],
  pools:   PlayPoolsExtended,
  region:  RegionParam,
  nextIndex: number,
): { deck: Person[]; cardIds: string[] } {
  const profile = getOrCreateAdaptiveProfile();
  // Exclude the whole cumulative answer history, not just the current session,
  // so continuation (200/300/500/1000…) never repeats an already-answered person.
  const usedIds = new Set(cardIds);
  for (const a of profile.answers) usedIds.add(a.qid);
  const candidates = buildAdaptiveCandidates(pools, region, usedIds);
  const counts = getInitialSessionCounts(deck);
  const recentCards = deck.slice(-10);
  const exploreRatio = nextIndex < 50 ? EXPLORATION_RATIO_EARLY : EXPLORATION_RATIO_LATE;
  const mode: 'exploit' | 'explore' = Math.random() < exploreRatio ? 'explore' : 'exploit';
  const nextCard = pickNextAdaptiveCard({
    candidates,
    profile,
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

export default function PlayPage({ initialDeck, locale, region, regionExplicit, countryBoost, labels }: PlayPageProps) {
  const [session, setSession] = useState<PlaySession | null>(null);
  const [pools, setPools] = useState<PlayPoolsExtended | null>(null);
  const startedAt = useRef<number>(Date.now());
  const router = useRouter();

  // Build the aggregated, non-personal analytics payload. estimate-bearing events
  // (result_*/continue/share/restart) pass the computed estimate; session/checkpoint
  // events omit it. top_zones are theme tags only (axis:tag) — never names/QIDs.
  function buildAnalytics(
    profile:   AdaptiveProfile | null,
    sessionId: string | undefined,
    estimate?: ResultEstimate,
  ): AnalyticsPayload {
    return {
      session_id:      sessionId,
      locale,
      region,
      total_answers:   profile?.stats.totalAnswers,
      know_count:      profile?.stats.knowCount,
      heard_count:     profile?.stats.heardCount,
      dont_know_count: profile?.stats.dontKnowCount,
      estimate:        estimate?.publicEstimate,
      range_low:       estimate?.rangeLow,
      range_high:      estimate?.rangeHigh,
      level:           estimate?.levelLabel,
      top_zones:       estimate
        ? estimate.displayStrongZones.slice(0, 5).map(z => `${z.axis}:${z.tag}`)
        : undefined,
    };
  }

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
    } else if (!regionExplicit) {
      // Region selection is mandatory: a bare /play (no explicit ?region) with no
      // resumable session must not silently start a game (incl. via IP) — go to onboarding.
      router.push('/onboarding');
      return;
    } else {
      const fresh = createNewSession(locale, initialDeck, region);
      saveSession(fresh, region);
      setSession(fresh);
      // A brand-new test began (no resumable session). Not fired on resume/continue.
      // So a full first 100-card test emits 3 checkpoints total: session_started +
      // reached_30 + result_100 (a *continued* 100→200 run emits continue_clicked +
      // result_200, no session_started). Dev Strict-Mode safe: this branch persists the
      // session synchronously, so the second Strict invocation finds it via loadSession
      // and takes the resume branch above — session_started fires exactly once.
      track('session_started', buildAnalytics(getOrCreateAdaptiveProfile(), fresh.sessionId));
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
      // Cumulative exclusion: current session cards + entire profile history
      // (updatedProfile already includes the answer just recorded above).
      const usedIds = new Set(newCardIds);
      for (const a of updatedProfile.answers) usedIds.add(a.qid);
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

    // ── Analytics: low-frequency checkpoints ONLY (never one per answer/card) ──
    // Both fire on exact cumulative counts, so each occurs at most once and is
    // naturally idempotent across reloads (handleAnswer runs only on a real answer).
    const newTotal = updatedProfile.stats.totalAnswers;
    if (newTotal === 30) {
      track('reached_30', buildAnalytics(updatedProfile, session.sessionId));
    }
    if (isCompleted) {
      const resultEvent =
        newTotal === 100 ? 'result_100' :
        newTotal === 200 ? 'result_200' :
        newTotal === 300 ? 'result_300' : null;
      if (resultEvent) {
        const completedEstimate = calculateResultEstimate(updatedProfile);
        track(resultEvent, buildAnalytics(updatedProfile, session.sessionId, completedEstimate));
      }
    }
  }

  // Continue: start a fresh 100-card session; cumulative adaptive profile is PRESERVED.
  // The new calibration deck excludes every previously-answered QID so a person never
  // repeats across the 100→200→300→… progression. Falls back to the SSR initialDeck
  // only if pools haven't loaded (shouldn't happen post-completion, but stays safe).
  function handleContinue() {
    const prevProfile = getOrCreateAdaptiveProfile();
    track('continue_clicked', buildAnalytics(prevProfile, session?.sessionId, calculateResultEstimate(prevProfile)));
    clearSession(locale, region);
    const answeredIds = new Set(getOrCreateAdaptiveProfile().answers.map(a => a.qid));
    const deck = pools
      ? createInitialSessionDeck(pools, region, answeredIds, countryBoost)
      : initialDeck;
    const fresh = createNewSession(locale, deck, region);
    saveSession(fresh, region);
    setSession(fresh);
    startedAt.current = Date.now();
  }

  // Start new test: clear session AND cumulative profile, then send the user back to
  // onboarding (region selection is mandatory). We do NOT immediately create a new
  // session in the old region — the new test begins only after the user re-picks a
  // region. Clearing the profile wipes stats/answers/answeredQids so the next test's
  // analysis starts clean and never reuses the previous result.
  function handleReset() {
    const prevProfile = getOrCreateAdaptiveProfile();
    track('restart_clicked', buildAnalytics(prevProfile, session?.sessionId, calculateResultEstimate(prevProfile)));
    clearSession(locale, region);
    clearAdaptiveProfile();
    router.push('/onboarding');
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="text-muted">{labels.loading}</p>
      </div>
    );
  }

  if (session.completed) {
    const profile = getOrCreateAdaptiveProfile();
    const estimate = calculateResultEstimate(profile);
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-8">
        <PlayResult
          estimate={estimate}
          locale={locale}
          cards={session.deck}
          answers={session.answers}
          onContinue={handleContinue}
          onReset={handleReset}
          onShare={() => track('share_clicked', buildAnalytics(profile, session.sessionId, estimate))}
        />
      </div>
    );
  }

  const currentPerson = session.deck[session.currentIndex];

  // Waiting for pools to load so adaptive card can be generated
  if (!currentPerson) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="text-muted">{labels.loading}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-8">
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
