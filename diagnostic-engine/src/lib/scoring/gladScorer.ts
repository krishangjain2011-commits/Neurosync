// GLAD (Griffiths Learning Ability Determination) Scoring
// Subscales map question IDs to their respective subscales

const SUBSCALE_MAPPING: Record<string, keyof GLADScore['subscales']> = {
  // Locomotor (5 questions)
  'loc1': 'locomotor',
  'loc2': 'locomotor',
  'loc3': 'locomotor',
  'loc4': 'locomotor',
  'loc5': 'locomotor',
  // Personal-Social (5 questions)
  'ps1': 'personalSocial',
  'ps2': 'personalSocial',
  'ps3': 'personalSocial',
  'ps4': 'personalSocial',
  'ps5': 'personalSocial',
  // Hearing (5 questions)
  'hear1': 'hearing',
  'hear2': 'hearing',
  'hear3': 'hearing',
  'hear4': 'hearing',
  'hear5': 'hearing',
  // Language (5 questions)
  'lang1': 'language',
  'lang2': 'language',
  'lang3': 'language',
  'lang4': 'language',
  'lang5': 'language',
  // Eye and Hand Coordination (5 questions)
  'eye1': 'eye',
  'eye2': 'eye',
  'eye3': 'eye',
  'eye4': 'eye',
  'eye5': 'eye',
  // Hand Performance (5 questions)
  'hand1': 'handPerformance',
  'hand2': 'handPerformance',
  'hand3': 'handPerformance',
  'hand4': 'handPerformance',
  'hand5': 'handPerformance',
};

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
  subscaleInterpretations: Record<string, string>;
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

  const subscaleCounts = {
    locomotor: 0,
    personalSocial: 0,
    hearing: 0,
    language: 0,
    eye: 0,
    handPerformance: 0,
  };

  let totalScore = 0;

  // Categorize answers by subscale and calculate subscale scores
  Object.entries(answers).forEach(([questionId, answer]) => {
    const numericAnswer = typeof answer === 'string' ? (answer === 'yes' ? 1 : 0) : (answer as number);
    totalScore += numericAnswer;

    const subscale = SUBSCALE_MAPPING[questionId] as keyof typeof subscales;
    if (subscale) {
      subscales[subscale] += numericAnswer;
      subscaleCounts[subscale] += 1;
    }
  });

  // Calculate average for each subscale to get standard scores (0-10)
  Object.entries(subscaleCounts).forEach(([key, count]) => {
    if (count > 0) {
      subscales[key as keyof typeof subscales] = Math.round(
        (subscales[key as keyof typeof subscales] / count) * 10
      );
    }
  });

  // Calculate General Quotient using standard formula (mean of subscales * 10 + 100)
  const subscaleValues = Object.values(subscales);
  const meanSubscaleScore = subscaleValues.reduce((a, b) => a + b, 0) / subscaleValues.length;
  const generalQuotient = Math.round(meanSubscaleScore * 10 + 100);

  const interpretation = interpretGLADScore(generalQuotient);
  const subscaleInterpretations = Object.entries(subscales).reduce(
    (acc, [subscale, score]) => {
      acc[subscale] = interpretSubscaleScore(score);
      return acc;
    },
    {} as Record<string, string>
  );

  return {
    totalScore,
    subscales,
    generalQuotient,
    interpretation,
    subscaleInterpretations,
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

function interpretSubscaleScore(score: number): string {
  // Subscale scores are 0-10
  if (score >= 9) return 'Very High';
  if (score >= 8) return 'High';
  if (score >= 6) return 'Average';
  if (score >= 4) return 'Low';
  return 'Very Low';
}
