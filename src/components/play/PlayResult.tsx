'use client';

interface Counts {
  know: number;
  heard: number;
  dont_know: number;
}

interface Labels {
  know: string;
  heard: string;
  dont_know: string;
}

interface PlayResultProps {
  counts: Counts;
  total: number;
  labels: Labels;
  resultTitle: string;
  playAgainLabel: string;
  onPlayAgain: () => void;
}

export default function PlayResult({
  counts,
  total,
  labels,
  resultTitle,
  playAgainLabel,
  onPlayAgain,
}: PlayResultProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 text-center">
      <div className="bg-neutral-900 rounded-xl shadow-lg p-8 space-y-6">
        <p className="text-6xl font-serif font-semibold text-white">
          {counts.know}
          <span className="text-neutral-500 text-3xl"> / {total}</span>
        </p>

        <p className="text-neutral-300 text-lg">{resultTitle}</p>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-400">{labels.know}</span>
            <span className="text-neutral-200">{counts.know}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">{labels.heard}</span>
            <span className="text-neutral-200">{counts.heard}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">{labels.dont_know}</span>
            <span className="text-neutral-200">{counts.dont_know}</span>
          </div>
        </div>
      </div>

      <button
        onClick={onPlayAgain}
        className="w-full py-4 rounded-xl bg-neutral-700 hover:bg-neutral-600 active:bg-neutral-800 text-white font-semibold text-lg transition-colors"
      >
        {playAgainLabel}
      </button>
    </div>
  );
}
