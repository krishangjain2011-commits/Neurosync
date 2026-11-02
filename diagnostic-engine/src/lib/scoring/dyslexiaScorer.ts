// Dyslexia Screening Scorer

export interface DyslexiaScore {
  totalScore: number;
  riskLevel: 'low' | 'moderate' | 'high';
  percentageScore: number;
  interpretation: string;
  recommendations: string[];
  areasOfConcern: string[];
  scoredQuestions: number;
}

// Map question IDs to screening areas
const AREA_MAPPING: Record<string, string> = {
  'read1': 'Letter Recognition',
  'read2': 'Phonemic Awareness',
  'read3': 'Phonological Processing',
  'read4': 'Reading Fluency',
  'read5': 'Word Recognition',
  'spell1': 'Spelling Ability',
  'spell2': 'Letter Order',
  'spell3': 'Letter Omission',
  'spell4': 'Sight Words',
  'spell5': 'Spelling Consistency',
  'motor1': 'Handwriting Legibility',
  'motor2': 'Pencil Grip',
  'motor3': 'Letter Formation',
  'motor4': 'Writing Endurance',
  'motor5': 'Fine Motor Skills',
  'comprehension1': 'Text Understanding',
  'comprehension2': 'Recall Ability',
  'comprehension3': 'Sequencing',
  'comprehension4': 'Inference',
  'comprehension5': 'Vocabulary',
  'phonological1': 'Rhyming',
  'phonological2': 'Syllable Segmentation',
  'phonological3': 'Initial Sounds',
  'phonological4': 'Sound Substitution',
  'phonological5': 'Family History',
};

export function scoreDyslexia(answers: Record<string, number | string>): DyslexiaScore {
  let totalScore = 0;
  let scoredQuestions = 0;
  const areasOfConcern: string[] = [];

  // Score answers: convert to 0/1 format if needed
  Object.entries(answers).forEach(([questionId, answer]) => {
    const score = typeof answer === 'string' ? (answer === 'yes' ? 1 : 0) : (answer as number);
    totalScore += score;
    scoredQuestions += 1;

    // Track areas with positive responses (concerns)
    if (score === 1) {
      const area = AREA_MAPPING[questionId];
      if (area && !areasOfConcern.includes(area)) {
        areasOfConcern.push(area);
      }
    }
  });

  const maxScore = 25; // Maximum possible score for 25 questions
  const percentageScore = Math.round((totalScore / maxScore) * 100);
  const riskLevel = getRiskLevel(percentageScore);
  const interpretation = interpretDyslexiaScore(percentageScore, riskLevel, totalScore);
  const recommendations = getRecommendations(riskLevel, areasOfConcern);

  return {
    totalScore,
    riskLevel,
    percentageScore,
    interpretation,
    recommendations,
    areasOfConcern,
    scoredQuestions,
  };
}

function getRiskLevel(percentageScore: number): 'low' | 'moderate' | 'high' {
  // Risk level based on percentage of positive responses
  if (percentageScore <= 20) return 'low';
  if (percentageScore <= 50) return 'moderate';
  return 'high';
}

function interpretDyslexiaScore(
  percentage: number,
  riskLevel: 'low' | 'moderate' | 'high',
  totalScore: number
): string {
  const messages: Record<string, string> = {
    low: `Score of ${totalScore}/25 (${percentage}%): Low risk indicators for dyslexia. Most reading and writing skills appear within expected range.`,
    moderate: `Score of ${totalScore}/25 (${percentage}%): Moderate risk indicators. Some concerns noted in reading/writing skills. Further assessment recommended.`,
    high: `Score of ${totalScore}/25 (${percentage}%): High risk indicators. Multiple areas of concern in reading, writing, and related skills. Professional evaluation strongly recommended.`,
  };
  return messages[riskLevel];
}

function getRecommendations(riskLevel: 'low' | 'moderate' | 'high', areasOfConcern: string[]): string[] {
  const baseRecommendations: Record<string, string[]> = {
    low: ['Continue monitoring reading progress', 'Provide support in any weak areas', 'Schedule periodic check-ins'],
    moderate: [
      'Comprehensive psychoeducational evaluation recommended',
      'Consider dyslexia screening by specialist',
      'Implement targeted reading interventions',
      'Consult with special education professional',
      `Focus on areas of concern: ${areasOfConcern.slice(0, 3).join(', ')}`,
    ],
    high: [
      'Urgent referral for comprehensive dyslexia assessment',
      'Educational psychology evaluation recommended',
      'Implement intensive reading intervention programs',
      'Consider multisensory/structured literacy approaches',
      'Explore accommodations and support services',
      `Priority areas: ${areasOfConcern.slice(0, 5).join(', ')}`,
    ],
  };
  return baseRecommendations[riskLevel];
}
