import { Category } from '../types/assessment';

export const CATEGORIES: Record<string, Category> = {
  'asd-adhd': {
    id: 'asd-adhd',
    name: 'ASD/ADHD',
    description: 'Autism Spectrum Disorder & Attention Deficit Hyperactivity Disorder Assessment',
    icon: '🧠',
    assessments: [
      {
        id: 'm-chat',
        category: 'asd-adhd',
        type: 'm-chat',
        title: 'M-CHAT',
        description: 'Modified Checklist for Autism in Toddlers',
        questions: [],
        scoreRange: [0, 20],
      },
    ],
  },
  'id': {
    id: 'id',
    name: 'Intellectual Disability',
    description: 'Assessment for Intellectual Disability',
    icon: '📚',
    assessments: [
      {
        id: 'glad',
        category: 'id',
        type: 'glad',
        title: 'GLAD',
        description: 'Griffiths Learning Ability Determination',
        questions: [],
        scoreRange: [0, 100],
      },
    ],
  },
  'sld': {
    id: 'sld',
    name: 'Specific Learning Disabilities',
    description: 'Assessment for Learning Disabilities',
    icon: '✏️',
    assessments: [
      {
        id: 'dyslexia',
        category: 'sld',
        type: 'dyslexia',
        title: 'Dyslexia Screening',
        description: 'Screening for Dyslexia',
        questions: [],
        scoreRange: [0, 50],
      },
    ],
  },
};
