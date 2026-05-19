import { requireEnv } from "./utils";

export const PORT = requireEnv('PORT');
export const FRONTEND_URL = requireEnv('FRONTEND_URL');
export const JWT_SECRET = requireEnv('JWT_SECRET');
