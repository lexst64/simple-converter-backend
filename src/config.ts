import dotenv from 'dotenv';
import { requireEnv } from '@/utils.js';

dotenv.config();

export const PORT = requireEnv('PORT');
export const FRONTEND_URL = requireEnv('FRONTEND_URL');
export const JWT_SECRET = requireEnv('JWT_SECRET');
export const GOOGLE_CLIENT_ID = requireEnv('GOOGLE_CLIENT_ID');
export const NODE_ENV = requireEnv('NODE_ENV');
export const MONGODB_URI = requireEnv('MONGODB_URI');
export const AWS_ACCESS_KEY_ID = requireEnv('AWS_ACCESS_KEY_ID');
export const AWS_SECRET_ACCESS_KEY = requireEnv('AWS_SECRET_ACCESS_KEY');
export const AWS_S3_BUCKET_NAME = requireEnv('AWS_S3_BUCKET_NAME');
export const AWS_REGION = requireEnv('AWS_REGION');
export const REDIS_URL = requireEnv('REDIS_URL');
