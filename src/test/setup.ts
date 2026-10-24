import { vi } from 'vitest';

// src/config.ts calls requireEnv() at import time and exits if anything is missing.
// Real environment values (e.g. from .env) must never leak into tests, so override them.
Object.assign(process.env, {
  PORT: '0',
  FRONTEND_URL: 'http://localhost:5173',
  JWT_SECRET: 'test-jwt-secret',
  GOOGLE_CLIENT_ID: 'test-google-client-id.apps.googleusercontent.com',
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:1/test',
  AWS_ACCESS_KEY_ID: 'test-access-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret-key',
  AWS_S3_BUCKET_NAME: 'test-bucket',
  AWS_REGION: 'us-east-1',
  REDIS_URL: 'redis://127.0.0.1:1',
});

// Keep test output quiet and avoid writing to logs/.
vi.mock('@/logger.js', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { logger };
});
