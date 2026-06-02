'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import type { ResultEstimate, ZoneStats, LevelLabel } from '@/lib/play/result-estimate';
import { getContinueMilestone, getAccuracyTier } from '@/lib/play/result-estimate';
import { formatZoneLabel } from '@/lib/play/localized-labels';

interface PlayResultProps {
  estimate:   ResultEstimate;
  locale:     string;
  onContinue: () => void;
  onReset:    () => void;
  onExport:   () => void;
}

function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU').replace(/\s/g, ' ');
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

export default function PlayResult({ estimate, locale, onContinue, onReset, onExport }: PlayResultProps) {
  const t = useTranslations('play');
  const [showDetails, setShowDetails] = useState(false);

  const {
    publicEstimate, rangeLow, rangeHigh, levelLabel,
    universeTotal, answeredCount, knowCount, heardCount, dontKnowCount,
    strongZones, strongIsFallback, topZones, mediumZones, weakZones, bucketStats,
  } = estimate;

  const milestone = getContinueMilestone(answeredCount);
  const accuracyTier = getAccuracyTier(answeredCount);

  // Strong section: strict strong zones, or top-by-rate fallback so it's never empty.
  const displayStrong = strongIsFallback ? topZones : strongZones;
  const strongTitle   = strongIsFallback ? t('result_strong_fallback_title') : t('result_strong_title');

  function handleReset() {
    if (typeof window === 'undefined' || window.confirm(t('start_new_confirm'))) onReset();
  }

  function handleShare() {
    const zoneStr = displayStrong.slice(0, 5)
      .map(z => formatZoneLabel(z.axis, z.tag, locale)).join(', ') || '—';
    const text = t('share_text', {
      estimate: formatNumber(publicEstimate),
      total:    formatNumber(universeTotal),
      level:    t(LEVEL_KEY[levelLabel]),
      count:    answeredCount,
      zones:    zoneStr,
    });
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ text, url }).catch(() => { /* user cancelled */ });
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(`${text} ${url}`.trim()).catch(() => { /* noop */ });
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
          {renderZones(displayStrong, 'result_strong_empty', 'bg-emerald-900/60 text-emerald-300')}
        </div>
        <div className="space-y-2">
          <p className="text-neutral-300 font-semibold text-sm">{t('result_medium_title')}</p>
          {renderZones(mediumZones, 'result_medium_empty', 'bg-amber-900/50 text-amber-300')}
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
          onClick={onExport}
          className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-neutral-300 font-medium transition-colors"
        >
          {t('btn_export')}
        </button>
        <button
          onClick={handleReset}
          className="w-full py-3 rounded-xl border border-neutral-700 text-neutral-400 hover:text-rose-300 hover:border-rose-800 active:bg-neutral-900 font-medium transition-colors"
        >
          {t('btn_start_new')}
        </button>
      </div>
    </div>
  );
}
