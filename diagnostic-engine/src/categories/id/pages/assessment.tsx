import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function IDAssessment() {
  const router = useRouter();
  const { id } = router.query;
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);

  const questions = [
    'Child can understand and follow simple instructions',
    'Child communicates basic needs (hungry, tired, etc.)',
    'Child demonstrates problem-solving abilities',
    'Child shows awareness of social cues',
    'Child can engage in structured activities',
    'Child demonstrates adaptive behaviors for self-care',
    'Child shows interest in learning new skills',
    'Child can concentrate on tasks',
  ];

  const handleAnswer = (score: number) => {
    setAnswers({ ...answers, [currentQuestion]: score });

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setShowResults(true);
    }
  };

  const calculateScore = () => {
    return Object.values(answers).reduce((a, b) => a + b, 0);
  };

  if (showResults) {
    const totalScore = calculateScore();
    const maxScore = questions.length * 10;
    const percentage = (totalScore / maxScore) * 100;

    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-6">GLAD Assessment Results</h1>

          <div className="mb-6 p-6 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold mb-2">Score: {totalScore}/{maxScore}</p>
            <div className="w-full bg-gray-300 rounded-full h-4 mb-4">
              <div
                className="bg-blue-600 h-4 rounded-full"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <p className="text-gray-700 font-semibold">{Math.round(percentage)}%</p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => router.push('/categories/id')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to ID
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
      <Link href="/categories/id">
        <a className="text-blue-600 hover:text-blue-800 mb-4 inline-block">← Back</a>
      </Link>

      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-600 mb-2">
            Question {currentQuestion + 1} of {questions.length}
          </h2>
          <div className="w-full bg-gray-300 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{
                width: `${((currentQuestion + 1) / questions.length) * 100}%`,
              }}
            />
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-8">{questions[currentQuestion]}</h1>

        <div className="space-y-3">
          {[
            { score: 10, label: 'Strongly Agree' },
            { score: 7, label: 'Agree' },
            { score: 5, label: 'Neutral' },
            { score: 3, label: 'Disagree' },
            { score: 0, label: 'Strongly Disagree' },
          ].map(({ score, label }) => (
            <button
              key={score}
              onClick={() => handleAnswer(score)}
              className="w-full text-left px-6 py-3 bg-gray-100 hover:bg-blue-100 rounded-lg border-2 border-gray-300 hover:border-blue-600 transition"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
