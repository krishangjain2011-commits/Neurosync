export interface Assessment {
  id: string;
  category: 'asd-adhd' | 'id' | 'sld';
  type: string;
  title: string;
  description: string;
  questions: Question[];
  scoreRange: [number, number];
}

export interface Question {
  id: string;
  text: string;
  type: 'likert' | 'yes-no' | 'multiple-choice' | 'text';
  options?: string[];
  score?: number;
}

export interface AssessmentResult {
  assessmentId: string;
  score: number;
  maxScore: number;
  percentile: number;
  interpretation: string;
  recommendations: string[];
  completedAt: Date;
}

export interface Category {
  id: 'asd-adhd' | 'id' | 'sld';
  name: string;
  description: string;
  icon: string;
  assessments: Assessment[];
}
