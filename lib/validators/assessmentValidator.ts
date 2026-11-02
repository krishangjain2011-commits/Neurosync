/**
 * Assessment Input Validators
 * Validates assessment answers, scores, and related data
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate assessment answers
 */
export function validateAnswers(
  answers: unknown,
  assessmentId: string
): ValidationResult {
  const errors: string[] = [];

  // Check if answers exists and is an object
  if (!answers) {
    errors.push('Answers are required');
    return { isValid: false, errors };
  }

  if (typeof answers !== 'object' || Array.isArray(answers)) {
    errors.push('Answers must be an object mapping question IDs to answers');
    return { isValid: false, errors };
  }

  const answersObj = answers as Record<string, unknown>;
  const entries = Object.entries(answersObj);

  if (entries.length === 0) {
    errors.push('At least one answer is required');
    return { isValid: false, errors };
  }

  // Validate each answer
  const maxAnswers = getMaxAnswersForAssessment(assessmentId);

  entries.forEach(([questionId, answer]) => {
    // Check question ID format
    if (!questionId || typeof questionId !== 'string') {
      errors.push('Invalid question ID format');
      return;
    }

    // Check answer is valid type (number, string, boolean)
    if (
      answer !== null &&
      typeof answer !== 'number' &&
      typeof answer !== 'string' &&
      typeof answer !== 'boolean'
    ) {
      errors.push(
        `Invalid answer type for question ${questionId}: expected number, string, or boolean`
      );
      return;
    }

    // For numeric answers, check bounds
    if (typeof answer === 'number') {
      if (isNaN(answer) || !isFinite(answer)) {
        errors.push(`Invalid numeric answer for question ${questionId}`);
        return;
      }
      if (answer < 0 || answer > 1) {
        errors.push(
          `Answer for question ${questionId} must be 0 or 1, got ${answer}`
        );
      }
    }

    // For string answers, check valid values
    if (typeof answer === 'string') {
      const validAnswers = ['yes', 'no', '0', '1'];
      if (!validAnswers.includes(answer.toLowerCase())) {
        errors.push(
          `Invalid answer for question ${questionId}: must be 'yes', 'no', '0', or '1'`
        );
      }
    }
  });

  // Check answer count doesn't exceed expected
  if (entries.length > maxAnswers) {
    errors.push(
      `Too many answers: expected at most ${maxAnswers}, got ${entries.length}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate assessment score
 */
export function validateScore(
  score: unknown,
  assessmentId: string
): ValidationResult {
  const errors: string[] = [];

  // Check if score exists
  if (score === undefined || score === null) {
    errors.push('Score is required');
    return { isValid: false, errors };
  }

  // Check if score is a number
  if (typeof score !== 'number') {
    errors.push(`Score must be a number, got ${typeof score}`);
    return { isValid: false, errors };
  }

  // Check if score is valid number
  if (isNaN(score) || !isFinite(score)) {
    errors.push('Score must be a valid finite number');
    return { isValid: false, errors };
  }

  // Check score range based on assessment type
  const { min, max } = getScoreRangeForAssessment(assessmentId);

  if (score < min) {
    errors.push(
      `Score ${score} is below minimum of ${min} for ${assessmentId}`
    );
  }

  if (score > max) {
    errors.push(
      `Score ${score} exceeds maximum of ${max} for ${assessmentId}`
    );
  }

  // Check for reasonable values (no extreme outliers)
  if (score % 1 !== 0 && score % 0.5 !== 0) {
    // Allow whole numbers or halves
    errors.push(`Score ${score} should be a whole number or half increment`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate childId
 */
export function validateChildId(childId: unknown): ValidationResult {
  const errors: string[] = [];

  if (!childId) {
    errors.push('Child ID is required');
    return { isValid: false, errors };
  }

  if (typeof childId !== 'string') {
    errors.push('Child ID must be a string');
    return { isValid: false, errors };
  }

  if (childId.trim().length === 0) {
    errors.push('Child ID cannot be empty');
    return { isValid: false, errors };
  }

  if (childId.length > 100) {
    errors.push('Child ID is too long (max 100 characters)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate assessmentId
 */
export function validateAssessmentId(assessmentId: unknown): ValidationResult {
  const errors: string[] = [];

  if (!assessmentId) {
    errors.push('Assessment ID is required');
    return { isValid: false, errors };
  }

  if (typeof assessmentId !== 'string') {
    errors.push('Assessment ID must be a string');
    return { isValid: false, errors };
  }

  const validIds = ['m-chat', 'glad', 'dyslexia'];
  if (!validIds.includes(assessmentId as string)) {
    errors.push(`Invalid assessment ID: ${assessmentId}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate resultId format
 */
export function validateResultId(resultId: unknown): ValidationResult {
  const errors: string[] = [];

  if (!resultId) {
    errors.push('Result ID is required');
    return { isValid: false, errors };
  }

  if (typeof resultId !== 'string') {
    errors.push('Result ID must be a string');
    return { isValid: false, errors };
  }

  if (resultId.length === 0 || resultId.length > 50) {
    errors.push('Result ID has invalid length');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get expected score range for an assessment
 */
function getScoreRangeForAssessment(
  assessmentId: string
): { min: number; max: number } {
  const ranges: Record<string, { min: number; max: number }> = {
    'm-chat': { min: 0, max: 20 },
    'glad': { min: 0, max: 100 },
    'dyslexia': { min: 0, max: 25 },
  };

  return ranges[assessmentId] || { min: 0, max: 100 };
}

/**
 * Get max number of answers expected for an assessment
 */
function getMaxAnswersForAssessment(assessmentId: string): number {
  const maxAnswers: Record<string, number> = {
    'm-chat': 20,
    'glad': 30,
    'dyslexia': 25,
  };

  return maxAnswers[assessmentId] || 100;
}

/**
 * Sanitize answers by converting to consistent format
 */
export function sanitizeAnswers(
  answers: Record<string, unknown>
): Record<string, number> {
  const sanitized: Record<string, number> = {};

  Object.entries(answers).forEach(([questionId, answer]) => {
    let numericAnswer = 0;

    if (typeof answer === 'number') {
      numericAnswer = answer ? 1 : 0;
    } else if (typeof answer === 'string') {
      numericAnswer = answer.toLowerCase() === 'yes' ? 1 : 0;
    } else if (typeof answer === 'boolean') {
      numericAnswer = answer ? 1 : 0;
    }

    sanitized[questionId] = numericAnswer;
  });

  return sanitized;
}
