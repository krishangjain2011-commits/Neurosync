import React from 'react';

interface Props {
  value: number | null;
  onChange: (value: number) => void;
  scale?: number;
}

export default function LikertScale({ value, onChange, scale = 5 }: Props) {
  const labels = ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];

  return (
    <div className="flex gap-2 justify-center my-4">
      {Array.from({ length: scale }).map((_, i) => (
        <button
          key={i}
          onClick={() => onChange(i + 1)}
          className={`px-4 py-2 rounded-lg border-2 transition ${
            value === i + 1
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
          }`}
          title={labels[i]}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}
