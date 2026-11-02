export const CONFIG = {
  // API
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  GROQ_VISION_MODEL: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || '',

  // Database
  DB_PATH: process.env.DB_PATH || './neurosync.db',
  UPLOADS_DIR: process.env.UPLOADS_DIR || './uploads',

  // ML
  ML_SIDECAR_URL: process.env.ML_SIDECAR_URL || 'http://localhost:8000',

  // Auth
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-key',
  TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 days

  // SMTP
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587'),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
  ADMIN_REPORT_EMAIL: process.env.ADMIN_REPORT_EMAIL,

  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000'),
};
