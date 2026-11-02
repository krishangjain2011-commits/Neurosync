import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function ASDAdhdAssessment() {
  const router = useRouter();
  const { id } = router.query;
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const [showResults, setShowResults] = useState(false);

  const questions = [
    'Does your child make eye contact when interacting with you?',
    'Does your child play with toys in varied ways?',
    'Does your child engage in pretend play?',
    'Does your child show interest in other children?',
    'Does your child respond to their name when called?',
    'Does your child follow simple instructions?',
    'Does your child use words to communicate?',
    'Does your child point to show you something interesting?',
    'Does your child understand when you say "no"?',
    'Does your child show affection for familiar people?',
  ];

  const handleAnswer = (index: number, value: boolean) => {
    setAnswers({ ...answers, [index]: value });
  };

  const handleSubmit = () => {
    setShowResults(true);
  };

  const score = Object.values(answers).filter((v) => v === true).length;
  const totalQuestions = questions.length;

  if (showResults) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-6">Assessment Results</h1>

          <div className="mb-6 p-6 bg-blue-50 rounded-lg">
            <p className="text-lg font-semibold mb-2">Your Score: {score}/{totalQuestions}</p>
            <p className="text-gray-700">
              {score <= 3 && 'Low risk - No immediate concerns identified'}
              {score > 3 && score <= 6 && 'Moderate - Further evaluation recommended'}
              {score > 6 && 'Higher risk - Professional consultation strongly recommended'}
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => router.push('/categories/asd-adhd')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to ASD/ADHD
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
      <Link href="/categories/asd-adhd">
        <a className="text-blue-600 hover:text-blue-800 mb-4 inline-block">← Back</a>
      </Link>

      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-8">M-CHAT Assessment - ASD Screening</h1>

        <div className="space-y-6">
          {questions.map((question, index) => (
            <div key={index} className="pb-6 border-b">
              <p className="text-lg font-semibold mb-4">{index + 1}. {question}</p>
              <div className="flex gap-4">
                <button
                  onClick={() => handleAnswer(index, true)}
                  className={`px-6 py-2 rounded-lg border-2 transition ${
                    answers[index] === true
                      ? 'bg-green-600 border-green-600 text-white'
                      : 'bg-white border-gray-300 hover:border-green-400'
                  }`}
                >
                  Yes
                </button>
                <button
                  onClick={() => handleAnswer(index, false)}
                  className={`px-6 py-2 rounded-lg border-2 transition ${
                    answers[index] === false
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-white border-gray-300 hover:border-red-400'
                  }`}
                >
                  No
                </button>
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
