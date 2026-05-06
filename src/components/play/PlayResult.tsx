'use client';

import type { ResultEstimate } from '@/lib/play/result-estimate';
import { formatZoneLabel } from '@/lib/play/localized-labels';

interface ResultLabels {
  know: string;
  heard: string;
  dont_know: string;
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

interface PlayResultProps {
  estimate: ResultEstimate;
  locale: string;
  labels: ResultLabels;
  playAgainLabel: string;
  onPlayAgain: () => void;
}

function formatNumber(n: number): string {
  // Non-breaking space as thousands separator
  return n.toLocaleString('ru-RU').replace(/\s/g, ' ');
}

export default function PlayResult({
  estimate,
  locale,
  labels,
  playAgainLabel,
  onPlayAgain,
}: PlayResultProps) {
  const {
    publicEstimate,
    rangeLow,
    rangeHigh,
    levelLabel,
    knowCount,
    heardCount,
    dontKnowCount,
    answeredCount,
    strongZones,
    weakZones,
    isPreliminary,
  } = estimate;

  const disclaimerText = labels.result_disclaimer.replace('{count}', String(answeredCount));

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 text-center">

      {/* Estimate headline */}
      <div className="bg-neutral-900 rounded-xl shadow-lg px-8 py-7 space-y-1">
        <p className="text-neutral-400 text-sm">{labels.result_estimate_pre}</p>
        <p className="text-6xl font-serif font-semibold text-white leading-tight">
          {formatNumber(publicEstimate)}
        </p>
        <p className="text-neutral-400 text-sm">{labels.result_estimate_post}</p>

        <div className="pt-3 space-y-1 text-sm">
          <p className="text-neutral-500">
            {labels.result_range_label}{' '}
            <span className="text-neutral-300">
              {formatNumber(rangeLow)}&nbsp;–&nbsp;{formatNumber(rangeHigh)}
            </span>
          </p>
          <p className="text-neutral-500">
            {labels.result_level_label}{' '}
            <span className="text-neutral-200 font-semibold capitalize">{levelLabel}</span>
          </p>
        </div>

        {isPreliminary && (
          <p className="pt-2 text-xs text-amber-500">{labels.result_preliminary}</p>
        )}
      </div>

      {/* Answer breakdown */}
      <div className="bg-neutral-900 rounded-xl px-8 py-5 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-400">{labels.know}</span>
          <span className="text-neutral-200">{knowCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-400">{labels.heard}</span>
          <span className="text-neutral-200">{heardCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-400">{labels.dont_know}</span>
          <span className="text-neutral-200">{dontKnowCount}</span>
        </div>
      </div>

      {/* Strong zones */}
      <div className="bg-neutral-900 rounded-xl px-8 py-5 text-left space-y-2">
        <p className="text-neutral-300 font-semibold text-sm">{labels.result_strong_title}</p>
        {strongZones.length === 0 ? (
          <p className="text-neutral-500 text-sm">{labels.result_strong_empty}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {strongZones.map(z => (
              <span
                key={`${z.axis}:${z.tag}`}
                className="rounded-full bg-emerald-900/60 px-3 py-1 text-xs text-emerald-300"
              >
                {formatZoneLabel(z.axis, z.tag, locale)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Weak zones */}
      <div className="bg-neutral-900 rounded-xl px-8 py-5 text-left space-y-2">
        <p className="text-neutral-300 font-semibold text-sm">{labels.result_weak_title}</p>
        {weakZones.length === 0 ? (
          <p className="text-neutral-500 text-sm">{labels.result_weak_empty}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {weakZones.map(z => (
              <span
                key={`${z.axis}:${z.tag}`}
                className="rounded-full bg-rose-900/60 px-3 py-1 text-xs text-rose-300"
              >
                {formatZoneLabel(z.axis, z.tag, locale)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <p className="text-neutral-600 text-xs px-2">{disclaimerText}</p>

      <button
        onClick={onPlayAgain}
        className="w-full py-4 rounded-xl bg-neutral-700 hover:bg-neutral-600 active:bg-neutral-800 text-white font-semibold text-lg transition-colors"
      >
        {playAgainLabel}
      </button>
    </div>
  );
}
