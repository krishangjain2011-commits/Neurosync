import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function SLDAssessment() {
  const router = useRouter();
  const { id } = router.query;
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);

  const questions = [
    'Child struggles with reading comprehension',
    'Child has difficulty with spelling',
    'Child struggles with writing and expressing ideas',
    'Child has poor handwriting or letter formation',
    'Child struggles with math calculations',
    'Child has difficulty with word problems',
    'Child is slow at processing written information',
    'Child has trouble organizing thoughts in writing',
  ];

  const handleAnswer = (index: number, value: number) => {
    setAnswers({ ...answers, [index]: value });
  };

  const handleSubmit = () => {
    setShowResults(true);
  };

  const score = Object.values(answers).reduce((a, b) => a + b, 0);
  const totalQuestions = questions.length;
  const maxScore = totalQuestions * 5;

  if (showResults) {
    const percentage = (score / maxScore) * 100;

    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-6">Dyslexia Screening Results</h1>

          <div className="mb-6 p-6 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold mb-2">Score: {score}/{maxScore}</p>
            <div className="w-full bg-gray-300 rounded-full h-4 mb-4">
              <div
                className="bg-blue-600 h-4 rounded-full"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <p className="text-gray-700 font-semibold mb-4">{Math.round(percentage)}%</p>

            <div className="bg-white p-4 rounded border-l-4 border-blue-600">
              {percentage <= 30 && (
                <p>
                  <strong>Low Risk:</strong> Child shows typical development in literacy skills.
                </p>
              )}
              {percentage > 30 && percentage <= 60 && (
                <p>
                  <strong>Moderate Risk:</strong> Some literacy challenges noted. Recommend further
                  evaluation.
                </p>
              )}
              {percentage > 60 && (
                <p>
                  <strong>Higher Risk:</strong> Significant literacy challenges. Professional
                  evaluation strongly recommended.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => router.push('/categories/sld')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to SLD
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Link href="/categories/sld">
        <a className="text-blue-600 hover:text-blue-800 mb-4 inline-block">← Back</a>
      </Link>

      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-8">Dyslexia Screening</h1>

        <div className="space-y-8">
          {questions.map((question, index) => (
            <div key={index} className="pb-6 border-b last:border-b-0">
              <p className="text-lg font-semibold mb-4">{index + 1}. {question}</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    key={score}
                    onClick={() => handleAnswer(index, score)}
                    className={`flex-1 py-2 rounded-lg border-2 transition font-semibold ${
                      answers[index] === score
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-300 hover:border-blue-400'
                    }`}
                    title={
                      score === 1
                        ? 'Strongly Disagree'
                        : score === 5
                          ? 'Strongly Agree'
                          : 'Neutral'
                    }
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={Object.keys(answers).length < totalQuestions}
          className="mt-8 w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
        >
          {Object.keys(answers).length < totalQuestions
            ? `Answer all questions (${Object.keys(answers).length}/${totalQuestions})`
            : 'View Results'}
        </button>
      </div>
    </div>
  );
}
