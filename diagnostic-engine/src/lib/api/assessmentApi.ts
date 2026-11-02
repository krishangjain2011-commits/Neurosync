/**
 * Assessment API Client
 * Handles all assessment-related API calls to the backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export interface StartAssessmentRequest {
  childId: string;
}

export interface StartAssessmentResponse {
  resultId: string;
}

export interface SubmitAssessmentRequest {
  answers: Record<string, number | string>;
  score: number;
}

export interface SubmitAssessmentResponse {
  success: boolean;
  resultId?: string;
  error?: string;
}

export interface AssessmentResultResponse {
  id: string;
  assessment_id: string;
  child_id: string;
  answers: string;
  score: number;
  started_at: string;
  completed_at: string;
}

/**
 * Start a new assessment
 */
export async function startAssessment(
  assessmentId: string,
  request: StartAssessmentRequest
): Promise<StartAssessmentResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/assessments/${assessmentId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to start assessment');
    }

    return await response.json();
  } catch (error) {
    console.error('Error starting assessment:', error);
    throw error;
  }
}

/**
 * Submit assessment results
 */
export async function submitAssessment(
  resultId: string,
  request: SubmitAssessmentRequest
): Promise<SubmitAssessmentResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/assessments/${resultId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit assessment');
    }

    return await response.json();
  } catch (error) {
    console.error('Error submitting assessment:', error);
    throw error;
  }
}

/**
 * Fetch assessment result details
 */
export async function getAssessmentResult(resultId: string): Promise<AssessmentResultResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/assessments/results/${resultId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch assessment result');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching assessment result:', error);
    throw error;
  }
}

/**
 * Fetch all assessment results for a child
 */
export async function getChildAssessmentResults(childId: string): Promise<AssessmentResultResponse[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/assessments/child/${childId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch assessment results');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching assessment results:', error);
    throw error;
  }
}
