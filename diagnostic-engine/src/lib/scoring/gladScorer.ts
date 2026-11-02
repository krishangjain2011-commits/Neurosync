// GLAD (Griffiths Learning Ability Determination) Scoring

export interface GLADScore {
  totalScore: number;
  subscales: {
    locomotor: number;
    personalSocial: number;
    hearing: number;
    language: number;
    eye: number;
    handPerformance: number;
  };
  generalQuotient: number;
  interpretation: string;
}

export function scoreGLAD(answers: Record<string, number>): GLADScore {
  const subscales = {
    locomotor: 0,
    personalSocial: 0,
    hearing: 0,
    language: 0,
    eye: 0,
    handPerformance: 0,
  };

  let totalScore = 0;

  // Parse answers and categorize by subscale
  Object.entries(answers).forEach(([key, value]) => {
    totalScore += value as number;
  });

  const generalQuotient = Math.round((totalScore / 100) * 100);
  const interpretation = interpretGLADScore(generalQuotient);

  return {
    totalScore,
    subscales,
    generalQuotient,
    interpretation,
  };
}

function interpretGLADScore(gq: number): string {
  if (gq >= 130) return 'Very Superior';
  if (gq >= 120) return 'Superior';
  if (gq >= 110) return 'High Average';
  if (gq >= 90) return 'Average';
  if (gq >= 80) return 'Low Average';
  if (gq >= 70) return 'Borderline';
  return 'Significantly Below Average';
}
