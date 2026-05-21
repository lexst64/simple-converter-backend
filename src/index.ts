import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { jwtAuth } from './middlewares';
import systemRoutes from './routes/system.routes';
import authRoutes from './routes/auth.routes';
import filesRoutes from './routes/files.routes';
import conversionsRoutes from './routes/conversions.routes';
import preparationsRoutes from './routes/preparations.routes';
import { requireEnv } from './utils';
import { execSync } from 'node:child_process';
import { exit } from 'node:process';

dotenv.config();

export const PORT = requireEnv('PORT');
export const FRONTEND_URL = requireEnv('FRONTEND_URL');
export const JWT_SECRET = requireEnv('JWT_SECRET');
export const MODE = requireEnv('MODE');

try {
  const stdout = execSync('ffmpeg -version', { stdio: 'pipe', encoding: 'utf-8' }).toString();
  const versionLine = stdout.split('\n')[0];
  console.log(`✓ FFmpeg is installed! (${versionLine})`);
} catch (error) {
  console.error('✗ FFmpeg is NOT installed or not in your system PATH.');
  exit(1);
}

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(morgan(MODE === 'dev' ? 'dev' : 'combined'));
app.use(cors({ origin: FRONTEND_URL || true, credentials: true }));

const apiV1Router = express.Router();

apiV1Router.use(jwtAuth(['/api/v1/auth', '/api/v1/auth/google']));

apiV1Router.use('/', systemRoutes);
apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/files', filesRoutes);
apiV1Router.use('/conversions', conversionsRoutes);
apiV1Router.use('/preparations', preparationsRoutes);

app.use('/api/v1', apiV1Router);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
