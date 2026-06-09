'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import type { ResultEstimate, ZoneStats, LevelLabel } from '@/lib/play/result-estimate';
import { getContinueMilestone, getAccuracyTier } from '@/lib/play/result-estimate';
import { formatZoneLabel, getCategoryLabel, getCountryLabel } from '@/lib/play/localized-labels';
import type { Person, Answer, AnswerType } from '@/lib/play/types';

interface PlayResultProps {
  estimate:   ResultEstimate;
  locale:     string;
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
  know:      { icon: '✓', color: 'text-emerald-400' },
  heard:     { icon: '◐', color: 'text-amber-400' },
  dont_know: { icon: '✕', color: 'text-rose-400' },
};

export default function PlayResult({ estimate, locale, cards, answers, onContinue, onReset, onShare }: PlayResultProps) {
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

  function renderZones(zones: ZoneStats[], emptyKey: string, color: string) {
    if (zones.length === 0) {
      return <p className="text-neutral-500 text-sm">{t(emptyKey)}</p>;
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

      {/* Estimate headline */}
      <div className="bg-neutral-900 rounded-xl shadow-lg px-8 py-7 space-y-1">
        <p className="text-neutral-400 text-sm">{t('result_estimate_pre')}</p>
        <p className="text-6xl font-serif font-semibold text-white leading-tight">
          {formatNumber(publicEstimate)}
        </p>
        <p className="text-neutral-400 text-sm">
          {t('result_estimate_post', { total: formatNumber(universeTotal) })}
        </p>

        <div className="pt-3 space-y-1 text-sm">
          <p className="text-neutral-500">
            {t('result_range_label')}{' '}
            <span className="text-neutral-300">
              {formatNumber(rangeLow)}&nbsp;–&nbsp;{formatNumber(rangeHigh)}
            </span>
          </p>
          <p className="text-neutral-500">
            {t('result_level_label')}{' '}
            <span className="text-neutral-200 font-semibold">{t(LEVEL_KEY[levelLabel])}</span>
          </p>
        </div>
      </div>

      {/* Accuracy note */}
      <p className="text-neutral-400 text-xs px-2">
        {t(ACCURACY_KEY[accuracyTier], { count: answeredCount })}
      </p>

      {/* Progress / answer breakdown */}
      <div className="bg-neutral-900 rounded-xl px-8 py-5 space-y-2 text-sm">
        <p className="text-neutral-300 font-semibold">{t('progress_answered', { count: answeredCount })}</p>
        <div className="flex justify-between"><span className="text-neutral-400">{t('know')}</span><span className="text-emerald-300">{knowCount}</span></div>
        <div className="flex justify-between"><span className="text-neutral-400">{t('heard')}</span><span className="text-amber-300">{heardCount}</span></div>
        <div className="flex justify-between"><span className="text-neutral-400">{t('dont_know')}</span><span className="text-rose-300">{dontKnowCount}</span></div>
      </div>

      {/* Profile zones */}
      <div className="bg-neutral-900 rounded-xl px-8 py-5 text-left space-y-4">
        <div className="space-y-2">
          <p className="text-neutral-300 font-semibold text-sm">{strongTitle}</p>
          {renderZones(displayStrongZones, 'result_strong_empty', 'bg-emerald-900/60 text-emerald-300')}
        </div>
        <div className="space-y-2">
          <p className="text-neutral-300 font-semibold text-sm">{t('result_medium_title')}</p>
          {renderZones(mediumDisplay, 'result_medium_empty', 'bg-amber-900/50 text-amber-300')}
        </div>
        <div className="space-y-2">
          <p className="text-neutral-300 font-semibold text-sm">{t('result_weak_title')}</p>
          {renderZones(weakZones, 'result_weak_empty', 'bg-rose-900/60 text-rose-300')}
        </div>
      </div>

      {/* View details (difficulty breakdown) */}
      <div className="bg-neutral-900 rounded-xl px-8 py-4 text-left">
        <button
          onClick={() => setShowDetails(v => !v)}
          className="w-full flex items-center justify-between text-neutral-300 text-sm font-medium"
        >
          <span>{t('details_title')}</span>
          <span className="text-neutral-500">{showDetails ? t('btn_hide_details') : t('btn_view_details')}</span>
        </button>
        {showDetails && (
          <div className="pt-3 space-y-2 text-sm">
            {buckets.map(([b, labelKey]) => {
              const s = bucketStats[b];
              const pct = Math.round(s.scoreRate * 100);
              return (
                <div key={b} className="flex justify-between gap-3">
                  <span className="text-neutral-400">{t(labelKey)}</span>
                  <span className="text-neutral-300 text-right">
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
          className="w-full py-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white font-semibold text-lg transition-colors"
        >
          {milestone === null
            ? t('continue_more')
            : t('continue_to', { target: formatNumber(milestone) })}
        </button>
        <button
          onClick={handleShare}
          className="w-full py-3 rounded-xl bg-neutral-700 hover:bg-neutral-600 active:bg-neutral-800 text-white font-medium transition-colors"
        >
          {t('btn_share')}
        </button>
        <button
          onClick={() => setShowAnswers(true)}
          className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-neutral-300 font-medium transition-colors"
        >
          {t('btn_show_answers')}
        </button>
        <button
          onClick={handleReset}
          className="w-full py-3 rounded-xl border border-neutral-700 text-neutral-400 hover:text-rose-300 hover:border-rose-800 active:bg-neutral-900 font-medium transition-colors"
        >
          {t('btn_start_new')}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="rounded-xl bg-emerald-800 text-emerald-50 text-sm px-4 py-3 shadow-lg max-w-md">
            {toast}
          </div>
        </div>
      )}

      {/* Answers drawer */}
      {showAnswers && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-0 sm:px-4">
          <div className="w-full sm:max-w-md max-h-[85vh] flex flex-col bg-neutral-950 sm:rounded-2xl rounded-t-2xl border border-neutral-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
              <span className="text-neutral-200 font-semibold">{t('answers_title')}</span>
              <button onClick={() => setShowAnswers(false)} className="text-neutral-400 hover:text-neutral-200 text-sm">
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
                            <p className="text-neutral-100 text-sm leading-tight">{pickDisplayName(p, locale)}</p>
                            {meta2 && <p className="text-neutral-500 text-xs">{meta2}</p>}
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
