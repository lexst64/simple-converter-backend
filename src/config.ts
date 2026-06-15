import dotenv from 'dotenv';
import { requireEnv } from '@/utils.js';

dotenv.config();

export const PORT = requireEnv('PORT');
export const FRONTEND_URL = requireEnv('FRONTEND_URL');
export const JWT_SECRET = requireEnv('JWT_SECRET');
export const NODE_ENV = requireEnv('NODE_ENV');
export const MONGODB_URI = requireEnv('MONGODB_URI');
