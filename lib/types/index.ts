/**
 * Shared TypeScript Interfaces
 * Common types used across the application
 */

// ─────────────────────────────────────────────────────────────────
// DATABASE ENTITIES
// ─────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: 'parent' | 'educator' | 'therapist' | 'district_admin' | 'admin';
  org_id: string | null;
  preferences: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  type: string;
  region_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface Child {
  id: string;
  parent_id: string;
  org_id: string | null;
  name: string;
  age: number | null;
  category: string | null;
  onboarding_data: string | null;
  created_at: string;
}

export interface SessionToken {
  id: number;
  token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export interface AssessmentResult {
  id: string;
  assessment_id: string;
  child_id: string;
  answers: string; // JSON string
  score: number;
  started_at: string;
  completed_at: string | null;
  started_by: string;
}

export interface ProgressMetric {
  id: string;
  child_id: string;
  metric_type: string;
  value: number;
  recorded_at: string;
}

export interface AudioCue {
  id: string;
  child_id: string;
  audio_path: string;
  embedding: string | null;
  created_at: string;
}

export interface YouTubeCache {
  id: number;
  cache_key: string;
  results: string; // JSON string
  fetched_at: string;
  expires_at: string | null;
}

export interface DietPlan {
  id: string;
  child_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

export interface TherapySchedule {
  id: string;
  child_id: string;
  therapy_type: string;
  day_of_week: string | null;
  time: string | null;
  duration_minutes: number | null;
  created_by: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────
// REQUEST/RESPONSE TYPES
// ─────────────────────────────────────────────────────────────────

export interface AuthenticatedRequest {
  user?: {
    id: string;
    email: string;
    role: string;
  };
  sessionUser?: {
    id: string;
    email: string;
    role: string;
    orgId?: string;
  };
}

export interface JsonRepairResult {
  result: string;
  repaired: boolean;
}

export interface YouTubeFetchResult {
  results: Array<{
    title: string;
    url: string;
    description?: string;
  }>;
  timestamp: number;
}

export interface HealthCheckResponse {
  status: 'ok' | 'healthy' | 'error';
}

export interface ErrorResponse {
  error: string;
  details?: string;
  code?: string;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// ─────────────────────────────────────────────────────────────────
// MULTER FILE TYPES
// ─────────────────────────────────────────────────────────────────

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface MulterRequest {
  file?: UploadedFile;
  files?: UploadedFile[];
}

// ─────────────────────────────────────────────────────────────────
// AI / ML TYPES
// ─────────────────────────────────────────────────────────────────

export interface AIResponse {
  content: string;
  provider: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface StructuredAIResponse<T> {
  content: T;
  provider: string;
}

export interface TranslationParams {
  text: string;
  fromLanguage?: string;
  toLanguage?: string;
}

// ─────────────────────────────────────────────────────────────────
// UTILITY TYPES
// ─────────────────────────────────────────────────────────────────

export type AsyncFunction<T = any> = (...args: any[]) => Promise<T>;

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  key: string;
}

export interface DatabaseQueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}
