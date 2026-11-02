import { create } from 'zustand';
import { AssessmentResult } from '../types/assessment';

interface AssessmentStore {
  currentAssessmentId: string | null;
  answers: Record<string, any>;
  results: AssessmentResult[];
  setCurrentAssessment: (id: string) => void;
  updateAnswer: (questionId: string, answer: any) => void;
  saveResult: (result: AssessmentResult) => void;
  clearCurrent: () => void;
}

export const useAssessmentStore = create<AssessmentStore>((set) => ({
  currentAssessmentId: null,
  answers: {},
  results: [],
  setCurrentAssessment: (id) =>
    set(() => ({
      currentAssessmentId: id,
      answers: {},
    })),
  updateAnswer: (questionId, answer) =>
    set((state) => ({
      answers: {
        ...state.answers,
        [questionId]: answer,
      },
    })),
  saveResult: (result) =>
    set((state) => ({
      results: [...state.results, result],
    })),
  clearCurrent: () =>
    set(() => ({
      currentAssessmentId: null,
      answers: {},
    })),
}));
