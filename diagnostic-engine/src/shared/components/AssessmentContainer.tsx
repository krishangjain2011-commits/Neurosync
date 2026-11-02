import React from 'react';

interface Props {
  title: string;
  children: React.ReactNode;
  onComplete?: () => void;
}

export default function AssessmentContainer({
  title,
  children,
  onComplete,
}: Props) {
  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">{title}</h1>
      <div className="bg-white rounded-lg shadow-lg p-8">
        {children}
      </div>
    </div>
  );
}
