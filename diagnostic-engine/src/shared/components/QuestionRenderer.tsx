import React from 'react';
import { Question } from '../../lib/types/assessment';
import LikertScale from './LikertScale';

interface Props {
  question: Question;
  answer: any;
  onChange: (answer: any) => void;
}

export default function QuestionRenderer({ question, answer, onChange }: Props) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{question.text}</h3>

      {question.type === 'likert' && (
        <LikertScale value={answer} onChange={onChange} />
      )}

      {question.type === 'yes-no' && (
        <div className="flex gap-4">
          <button
            onClick={() => onChange(true)}
            className={`px-6 py-2 rounded-lg border-2 transition ${
              answer === true
                ? 'bg-green-600 border-green-600 text-white'
                : 'bg-white border-gray-300'
            }`}
          >
            Yes
          </button>
          <button
            onClick={() => onChange(false)}
            className={`px-6 py-2 rounded-lg border-2 transition ${
              answer === false
                ? 'bg-red-600 border-red-600 text-white'
                : 'bg-white border-gray-300'
            }`}
          >
            No
          </button>
        </div>
      )}

      {question.type === 'multiple-choice' && (
        <div className="space-y-2">
          {question.options?.map((option, idx) => (
            <button
              key={idx}
              onClick={() => onChange(option)}
              className={`w-full text-left px-4 py-2 rounded-lg border-2 transition ${
                answer === option
                  ? 'bg-blue-100 border-blue-600'
                  : 'bg-white border-gray-300'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {question.type === 'text' && (
        <input
          type="text"
          value={answer || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg"
          placeholder="Enter your response"
        />
      )}
    </div>
  );
}
