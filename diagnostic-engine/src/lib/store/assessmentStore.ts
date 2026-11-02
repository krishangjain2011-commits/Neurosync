import { create } from 'zustand';
import { AssessmentResult } from '../types/assessment';
import { startAssessment, submitAssessment } from '../api/assessmentApi';

interface AssessmentStore {
  // State
  currentAssessmentId: string | null;
  currentResultId: string | null;
  answers: Record<string, number | string>;
  results: AssessmentResult[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentAssessment: (id: string) => void;
  updateAnswer: (questionId: string, answer: number | string) => void;
  startNewAssessment: (assessmentId: string, childId: string) => Promise<string>;
  submitAssessmentAnswers: (score: number) => Promise<boolean>;
  saveResult: (result: AssessmentResult) => void;
  clearCurrent: () => void;
  setError: (error: string | null) => void;
}

export const useAssessmentStore = create<AssessmentStore>((set, get) => ({
  // Initial state
  currentAssessmentId: null,
  currentResultId: null,
  answers: {},
  results: [],
  isLoading: false,
  error: null,

  // Action: Set current assessment
  setCurrentAssessment: (id) =>
    set(() => ({
      currentAssessmentId: id,
      answers: {},
      error: null,
    })),

  // Action: Update answer for a question
  updateAnswer: (questionId, answer) =>
    set((state) => ({
      answers: {
        ...state.answers,
        [questionId]: answer,
      },
    })),

  // Action: Start new assessment and get resultId from backend
  startNewAssessment: async (assessmentId: string, childId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await startAssessment(assessmentId, { childId });
      set({
        currentAssessmentId: assessmentId,
        currentResultId: response.resultId,
        answers: {},
        isLoading: false,
      });
      return response.resultId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start assessment';
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  // Action: Submit assessment answers to backend
  submitAssessmentAnswers: async (score: number) => {
    const state = get();
    if (!state.currentResultId) {
      set({ error: 'No assessment in progress' });
      return false;
    }

    set({ isLoading: true, error: null });
    try {
      const response = await submitAssessment(state.currentResultId, {
        answers: state.answers,
        score,
      });

      if (response.success) {
        // Store result in local state
        const result: AssessmentResult = {
          assessmentId: state.currentAssessmentId!,
          score,
          maxScore: 100,
          percentile: Math.round((score / 100) * 100),
          interpretation: `Score: ${score}`,
          recommendations: [],
          completedAt: new Date(),
        };

        set((prevState) => ({
          results: [...prevState.results, result],
          isLoading: false,
        }));

        return true;
      }

      set({ error: response.error || 'Failed to submit assessment', isLoading: false });
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit assessment';
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  // Action: Save result to local state
  saveResult: (result) =>
    set((state) => ({
      results: [...state.results, result],
    })),

  // Action: Clear current assessment
  clearCurrent: () =>
    set(() => ({
      currentAssessmentId: null,
      currentResultId: null,
      answers: {},
      error: null,
    })),

  // Action: Set error message
  setError: (error) => set({ error }),
}));
