// M-CHAT (Modified Checklist for Autism in Toddlers) Scoring

export interface MCHATScore {
  totalScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  interpretation: string;
  recommendations: string[];
  scoredQuestions: number;
}

export function scoreMCHAT(answers: Record<string, number | string>): MCHATScore {
  let totalScore = 0;
  let scoredQuestions = 0;

  // Score answers: convert to 0/1 format if needed
  Object.values(answers).forEach((answer) => {
    const score = typeof answer === 'string' ? (answer === 'yes' ? 1 : 0) : (answer as number);
    totalScore += score;
    scoredQuestions += 1;
  });

  const riskLevel = getRiskLevel(totalScore);
  const interpretation = interpretMCHATScore(totalScore, riskLevel);
  const recommendations = getRecommendations(totalScore, riskLevel);

  return {
    totalScore,
    riskLevel,
    interpretation,
    recommendations,
    scoredQuestions,
  };
}

function getRiskLevel(score: number): 'low' | 'medium' | 'high' {
  // M-CHAT scoring: 0-2 = low risk, 3-7 = medium risk, 8+ = high risk
  if (score <= 2) return 'low';
  if (score <= 7) return 'medium';
  return 'high';
}

function interpretMCHATScore(score: number, riskLevel: 'low' | 'medium' | 'high'): string {
  const messages: Record<string, string> = {
    low: `Score of ${score}: Low risk for autism spectrum disorder. Child shows typical development in areas assessed.`,
    medium: `Score of ${score}: Medium risk for autism spectrum disorder. Further evaluation recommended to rule out or confirm ASD.`,
    high: `Score of ${score}: High risk for autism spectrum disorder. Professional developmental evaluation is strongly recommended.`,
  };
  return messages[riskLevel];
}

function getRecommendations(score: number, riskLevel: 'low' | 'medium' | 'high'): string[] {
  const recommendations: Record<string, string[]> = {
    low: [
      'Continue regular pediatric check-ups',
      'Monitor developmental milestones',
      'Provide age-appropriate activities',
    ],
    medium: [
      'Schedule comprehensive developmental evaluation',
      'Consult with pediatrician or developmental specialist',
      'Monitor for social and communication changes',
      'Continue supporting social interactions',
    ],
    high: [
      'Urgent referral to developmental pediatrician or child psychologist',
      'Comprehensive diagnostic evaluation recommended',
      'Consider early intervention services',
      'Begin detailed observation and documentation of behaviors',
      'Consult autism specialist for assessment',
    ],
  };
  return recommendations[riskLevel];
}
