import React from 'react';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-4 text-gray-800">
          Diagnostic Assessment Engine
        </h1>
        <p className="text-center text-gray-600 mb-12">
          Select a category to begin assessment
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ASD/ADHD */}
          <Link href="/categories/asd-adhd">
            <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition cursor-pointer">
              <div className="text-4xl mb-4">🧠</div>
              <h2 className="text-2xl font-bold mb-2 text-gray-800">ASD/ADHD</h2>
              <p className="text-gray-600">Autism & ADHD Assessment</p>
            </div>
          </Link>

          {/* ID */}
          <Link href="/categories/id">
            <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition cursor-pointer">
              <div className="text-4xl mb-4">📚</div>
              <h2 className="text-2xl font-bold mb-2 text-gray-800">ID</h2>
              <p className="text-gray-600">Intellectual Disability Assessment</p>
            </div>
          </Link>

          {/* SLD */}
          <Link href="/categories/sld">
            <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition cursor-pointer">
              <div className="text-4xl mb-4">✏️</div>
              <h2 className="text-2xl font-bold mb-2 text-gray-800">SLD</h2>
              <p className="text-gray-600">Learning Disability Assessment</p>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
