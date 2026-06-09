'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import type { ResultEstimate, ZoneStats, LevelLabel, ZoneAxis } from '@/lib/play/result-estimate';
import { getContinueMilestone, getAccuracyTier } from '@/lib/play/result-estimate';
import { formatZoneLabel, getCategoryLabel, getCountryLabel } from '@/lib/play/localized-labels';
import { encodeChallenge, type InviterSummary } from '@/lib/play/challenge';
import type { RegionParam } from '@/lib/play/play-sampler';
import type { Person, Answer, AnswerType } from '@/lib/play/types';

interface PlayResultProps {
  estimate:   ResultEstimate;
  locale:     string;
  region:     RegionParam;
  inviterSummary?: InviterSummary | null;  // friendly compare payload (?c=…); additive, result-only
  cards:      Person[];                    // current-session deck (carries display names)
  answers:    Record<string, Answer>;      // current-session answers
  onContinue: () => void;
  onReset:    () => void;
  onShare?:   () => void;   // analytics: user tapped Share (fired regardless of share/clipboard outcome)
}

function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU').replace(/\s/g, ' ');
}

function pickDisplayName(p: Person, locale: string): string {
  if (locale === 'ru') return p.display_name_ru ?? p.display_name_en ?? p.name;
  if (locale === 'kk') return p.display_name_kk ?? p.display_name_ru ?? p.display_name_en ?? p.name;
  return p.display_name_en ?? p.name;
}

const LEVEL_KEY: Record<LevelLabel, string> = {
  beginner: 'level_beginner',
  casual:   'level_casual',
  good:     'level_good',
  strong:   'level_strong',
  erudite:  'level_erudite',
  master:   'level_master',
};

const ACCURACY_KEY = {
  baseline: 'accuracy_baseline',
  stable:   'accuracy_stable',
  high:     'accuracy_high',
  detailed: 'accuracy_detailed',
} as const;

const ANSWER_META: Record<AnswerType, { icon: string; color: string }> = {
  know:      { icon: '✓', color: 'text-emerald-deep' },
  heard:     { icon: '◐', color: 'text-amber-700' },
  dont_know: { icon: '✕', color: 'text-rose-700' },
};

export default function PlayResult({ estimate, locale, region, inviterSummary, cards, answers, onContinue, onReset, onShare }: PlayResultProps) {
  const t = useTranslations('play');
  const [showDetails, setShowDetails] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const {
    publicEstimate, rangeLow, rangeHigh, levelLabel,
    universeTotal, answeredCount, knowCount, heardCount, dontKnowCount,
    displayStrongZones, strongIsFallback, mediumZones, weakZones, bucketStats,
  } = estimate;

  const milestone = getContinueMilestone(answeredCount);
  const accuracyTier = getAccuracyTier(answeredCount);

  const strongTitle = strongIsFallback ? t('result_strong_fallback_title') : t('result_strong_title');
  // Avoid showing the same zone twice: medium section drops zones already in the top section.
  const shownKeys = new Set(displayStrongZones.map(z => `${z.axis}:${z.tag}`));
  const mediumDisplay = mediumZones.filter(z => !shownKeys.has(`${z.axis}:${z.tag}`));

  function handleReset() {
    if (typeof window === 'undefined' || window.confirm(t('start_new_confirm'))) onReset();
  }

  function handleShare() {
    onShare?.();
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (typeof navigator !== 'undefined' && navigator.share) {
      const zoneStr = displayStrongZones.slice(0, 5)
        .map(z => formatZoneLabel(z.axis, z.tag, locale)).join(', ') || '—';
      const text = t('share_text', {
        estimate: formatNumber(publicEstimate),
        total:    formatNumber(universeTotal),
        level:    t(LEVEL_KEY[levelLabel]),
        count:    answeredCount,
        zones:    zoneStr,
      });
      navigator.share({ text, url }).catch(() => { /* user cancelled */ });
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url)
        .then(() => {
          setToast(t('share_copied'));
          window.setTimeout(() => setToast(null), 3500);
        })
        .catch(() => { /* noop */ });
    }
  }

  // "Compare with a friend": encode this result into a link to /<locale>/onboarding?c=…
  // (friend picks their own region, takes their own test, then sees the comparison).
  function handleChallenge() {
    if (typeof window === 'undefined') return;
    const summary: InviterSummary = {
      estimate: publicEstimate, level: levelLabel, answered: answeredCount,
      know: knowCount, heard: heardCount, dontKnow: dontKnowCount,
      rangeLow, rangeHigh,
      zones: displayStrongZones.slice(0, 4).map(z => `${z.axis}:${z.tag}`),
      region, locale,
    };
    const url = `${window.location.origin}/${locale}/onboarding?c=${encodeChallenge(summary)}`;
    const text = t('challenge_share_text', { estimate: formatNumber(publicEstimate), total: formatNumber(universeTotal) });
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ text, url }).catch(() => { /* cancelled */ });
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url)
        .then(() => { setToast(t('challenge_copied')); window.setTimeout(() => setToast(null), 3500); })
        .catch(() => { /* noop */ });
    }
  }

  // Comparison data (only when opened from a challenge link).
  const youZones = displayStrongZones.slice(0, 4).map(z => `${z.axis}:${z.tag}`);
  const inviterZoneSet = new Set(inviterSummary?.zones ?? []);
  const sharedZones = youZones.filter(z => inviterZoneSet.has(z));
  const uniqueZones = youZones.filter(z => !inviterZoneSet.has(z));
  const diff = inviterSummary ? publicEstimate - inviterSummary.estimate : 0;
  const diffLabel = !inviterSummary ? ''
    : diff > 0 ? t('compare_diff_ahead',  { diff: formatNumber(diff) })
    : diff < 0 ? t('compare_diff_behind', { diff: formatNumber(-diff) })
    : t('compare_diff_equal');

  function zoneChip(z: string) {
    const i = z.indexOf(':');
    const axis = z.slice(0, i) as ZoneAxis;
    const tag  = z.slice(i + 1);
    return (
      <span key={z} className="rounded-full px-3 py-1 text-xs bg-emerald-deep/10 text-emerald-deep">
        {formatZoneLabel(axis, tag, locale)}
      </span>
    );
  }

  function renderZones(zones: ZoneStats[], emptyKey: string, color: string) {
    if (zones.length === 0) {
      return <p className="text-muted text-sm">{t(emptyKey)}</p>;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {zones.map(z => (
          <span key={`${z.axis}:${z.tag}`} className={`rounded-full px-3 py-1 text-xs ${color}`}>
            {formatZoneLabel(z.axis, z.tag, locale)}
          </span>
        ))}
      </div>
    );
  }

  const buckets: Array<['easy' | 'medium' | 'hard', string]> = [
    ['easy',   'details_easy'],
    ['medium', 'details_medium'],
    ['hard',   'details_hard'],
  ];

  // Answered cards from the current session, grouped by answer type for the readable view.
  const answeredCards = cards.filter(c => answers[c.wikidata_id]);
  const groupOrder: AnswerType[] = ['know', 'heard', 'dont_know'];
  const grouped = groupOrder.map(g => ({
    answer: g,
    items: answeredCards.filter(c => answers[c.wikidata_id]?.answer === g),
  })).filter(grp => grp.items.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 text-center">

      {/* Estimate headline — grouped estimate / range / level */}
      <div className="bg-white border border-divider rounded-2xl shadow-sm px-8 py-7 space-y-1">
        <p className="text-muted text-sm">{t('result_estimate_pre')}</p>
        <p className="text-6xl font-serif font-semibold text-graphite leading-tight">
          {formatNumber(publicEstimate)}
        </p>
        <p className="text-muted text-sm">
          {t('result_estimate_post', { total: formatNumber(universeTotal) })}
        </p>

        <div className="mt-4 pt-4 border-t border-divider space-y-1 text-sm">
          <p className="text-muted">
            {t('result_range_label')}{' '}
            <span className="text-graphite font-medium">
              {formatNumber(rangeLow)}&nbsp;–&nbsp;{formatNumber(rangeHigh)}
            </span>
          </p>
          <p className="text-muted">
            {t('result_level_label')}{' '}
            <span className="text-emerald-deep font-semibold">{t(LEVEL_KEY[levelLabel])}</span>
          </p>
          <p className="text-muted/80 text-xs pt-1">{t('result_approx_note')}</p>
        </div>
      </div>

      {/* Friendly comparison (only from a challenge link) — additive, never disrupts normal result */}
      {inviterSummary && (
        <div className="bg-white border border-divider rounded-2xl px-8 py-5 text-left space-y-3">
          <p className="text-graphite font-semibold text-sm">{t('compare_title')}</p>
          <div className="flex justify-between text-sm">
            <span className="text-muted">{t('compare_you')}</span>
            <span className="text-graphite font-medium">{formatNumber(publicEstimate)} · {t(LEVEL_KEY[levelLabel])}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">{t('compare_friend')}</span>
            <span className="text-graphite font-medium">{formatNumber(inviterSummary.estimate)} · {t(LEVEL_KEY[inviterSummary.level])}</span>
          </div>
          <p className="text-emerald-deep text-sm font-medium">{diffLabel}</p>
          {sharedZones.length > 0 && (
            <div className="space-y-1">
              <p className="text-muted text-xs">{t('compare_shared')}</p>
              <div className="flex flex-wrap gap-2">{sharedZones.map(zoneChip)}</div>
            </div>
          )}
          {uniqueZones.length > 0 && (
            <div className="space-y-1">
              <p className="text-muted text-xs">{t('compare_unique')}</p>
              <div className="flex flex-wrap gap-2">{uniqueZones.map(zoneChip)}</div>
            </div>
          )}
          <p className="text-muted/80 text-xs">{t('challenge_disclaimer')}</p>
        </div>
      )}

      {/* Accuracy note */}
      <p className="text-muted text-xs px-2">
        {t(ACCURACY_KEY[accuracyTier], { count: answeredCount })}
      </p>

      {/* Progress / answer breakdown */}
      <div className="bg-white border border-divider rounded-2xl px-8 py-5 space-y-2 text-sm">
        <p className="text-graphite font-semibold">{t('progress_answered', { count: answeredCount })}</p>
        <div className="flex justify-between"><span className="text-muted">{t('know')}</span><span className="text-emerald-deep font-medium">{knowCount}</span></div>
        <div className="flex justify-between"><span className="text-muted">{t('heard')}</span><span className="text-amber-700 font-medium">{heardCount}</span></div>
        <div className="flex justify-between"><span className="text-muted">{t('dont_know')}</span><span className="text-rose-700 font-medium">{dontKnowCount}</span></div>
      </div>

      {/* Profile zones */}
      <div className="bg-white border border-divider rounded-2xl px-8 py-5 text-left space-y-4">
        <div className="space-y-2">
          <p className="text-graphite font-semibold text-sm">{strongTitle}</p>
          {renderZones(displayStrongZones, 'result_strong_empty', 'bg-emerald-deep/10 text-emerald-deep')}
        </div>
        <div className="space-y-2">
          <p className="text-graphite font-semibold text-sm">{t('result_medium_title')}</p>
          {renderZones(mediumDisplay, 'result_medium_empty', 'bg-amber-100 text-amber-800')}
        </div>
        <div className="space-y-2">
          <p className="text-graphite font-semibold text-sm">{t('result_weak_title')}</p>
          {renderZones(weakZones, 'result_weak_empty', 'bg-rose-100 text-rose-700')}
        </div>
      </div>

      {/* View details (difficulty breakdown) */}
      <div className="bg-white border border-divider rounded-2xl px-8 py-4 text-left">
        <button
          onClick={() => setShowDetails(v => !v)}
          className="w-full flex items-center justify-between text-graphite text-sm font-medium"
        >
          <span>{t('details_title')}</span>
          <span className="text-muted">{showDetails ? t('btn_hide_details') : t('btn_view_details')}</span>
        </button>
        {showDetails && (
          <div className="pt-3 space-y-2 text-sm">
            {buckets.map(([b, labelKey]) => {
              const s = bucketStats[b];
              const pct = Math.round(s.scoreRate * 100);
              return (
                <div key={b} className="flex justify-between gap-3">
                  <span className="text-muted">{t(labelKey)}</span>
                  <span className="text-graphite text-right">
                    {s.usedDefault ? '—' : t('details_row', { count: s.count, rate: pct })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <button
          onClick={onContinue}
          className="w-full py-4 rounded-xl bg-emerald-deep text-white font-semibold text-lg hover:opacity-90 active:opacity-100 transition-opacity"
        >
          {milestone === null
            ? t('continue_more')
            : t('continue_to', { target: formatNumber(milestone) })}
        </button>
        <p className="text-muted text-xs -mt-1">{t('result_continue_hint')}</p>
        <button
          onClick={handleShare}
          className="w-full py-3 rounded-xl border border-divider bg-white text-graphite font-medium hover:bg-divider/40 active:bg-divider/60 transition-colors"
        >
          {t('btn_share')}
        </button>
        <button
          onClick={handleChallenge}
          className="w-full py-3 rounded-xl border border-divider bg-white text-graphite font-medium hover:bg-divider/40 active:bg-divider/60 transition-colors"
        >
          {t('challenge_button')}
        </button>
        <button
          onClick={() => setShowAnswers(true)}
          className="w-full py-3 rounded-xl border border-divider bg-white text-graphite font-medium hover:bg-divider/40 active:bg-divider/60 transition-colors"
        >
          {t('btn_show_answers')}
        </button>
        <button
          onClick={handleReset}
          className="w-full py-3 rounded-xl border border-divider text-muted hover:text-rose-700 hover:border-rose-300 active:bg-divider/30 font-medium transition-colors"
        >
          {t('btn_start_new')}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="rounded-xl bg-emerald-deep text-white text-sm px-4 py-3 shadow-lg max-w-md">
            {toast}
          </div>
        </div>
      )}

      {/* Answers drawer */}
      {showAnswers && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-graphite/40 px-0 sm:px-4">
          <div className="w-full sm:max-w-md max-h-[85vh] flex flex-col bg-cream sm:rounded-2xl rounded-t-2xl border border-divider shadow-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-divider">
              <span className="text-graphite font-semibold">{t('answers_title')}</span>
              <button onClick={() => setShowAnswers(false)} className="text-muted hover:text-graphite text-sm">
                {t('btn_close')}
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-5 text-left">
              {grouped.map(grp => {
                const meta = ANSWER_META[grp.answer];
                return (
                  <div key={grp.answer} className="space-y-3">
                    <p className={`text-sm font-semibold ${meta.color}`}>
                      {meta.icon} {t(grp.answer)} · {grp.items.length}
                    </p>
                    {grp.items.map(p => {
                      const occ = getCategoryLabel(p, locale);
                      const country = getCountryLabel(p.bplace_country, locale);
                      const meta2 = [occ, country].filter(Boolean).join(' • ');
                      return (
                        <div key={p.wikidata_id} className="flex items-start gap-2">
                          <span className={`${meta.color} text-sm mt-0.5`}>{meta.icon}</span>
                          <div>
                            <p className="text-graphite text-sm leading-tight">{pickDisplayName(p, locale)}</p>
                            {meta2 && <p className="text-muted text-xs">{meta2}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
