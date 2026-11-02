import React from 'react';

interface Props {
  score: number;
  maxScore: number;
  title?: string;
}

export default function PerformanceChart({ score, maxScore, title }: Props) {
  const percentage = (score / maxScore) * 100;

  return (
    <div className="my-6">
      {title && <h3 className="text-lg font-semibold mb-3">{title}</h3>}
      <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
        <div
          className="bg-blue-600 h-full rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-sm text-gray-600 mt-2">
        Score: {score} / {maxScore} ({Math.round(percentage)}%)
      </p>
    </div>
  );
}
