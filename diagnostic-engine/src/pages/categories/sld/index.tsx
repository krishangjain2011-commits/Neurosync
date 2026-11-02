import React from 'react';
import Link from 'next/link';

export default function SLDCategory() {
  const assessments = [
    {
      id: 'dyslexia',
      title: 'Dyslexia Screening',
      description: 'Specific Learning Disability Assessment',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto py-8">
      <Link href="/">
        <a className="text-blue-600 hover:text-blue-800 mb-4 inline-block">← Back</a>
      </Link>
      <h1 className="text-3xl font-bold mb-8">Specific Learning Disability Assessment</h1>

      <div className="grid grid-cols-1 gap-6">
        {assessments.map((assessment) => (
          <Link key={assessment.id} href={`/categories/sld/assessment/${assessment.id}`}>
            <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition cursor-pointer">
              <h2 className="text-2xl font-bold mb-2">{assessment.title}</h2>
              <p className="text-gray-600">{assessment.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
