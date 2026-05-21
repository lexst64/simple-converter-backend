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
import { requireEnv, requireFfmpeg } from './utils';

dotenv.config();

export const PORT = requireEnv('PORT');
export const FRONTEND_URL = requireEnv('FRONTEND_URL');
export const JWT_SECRET = requireEnv('JWT_SECRET');
export const MODE = requireEnv('MODE');

requireFfmpeg();

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

app.listen(PORT, () => console.log(`\nServer running on port ${PORT}`));
