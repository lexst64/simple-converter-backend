import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler, httpLogger, jwtAuth } from './middlewares';
import systemRoutes from './routes/system.routes';
import authRoutes from './routes/auth.routes';
import filesRoutes from './routes/files.routes';
import conversionsRoutes from './routes/conversions.routes';
import preparationsRoutes from './routes/preparations.routes';
import { requireEnv, requireFfmpeg } from './utils';
import { createLogger } from './logger';

dotenv.config();

export const PORT = requireEnv('PORT');
export const FRONTEND_URL = requireEnv('FRONTEND_URL');
export const JWT_SECRET = requireEnv('JWT_SECRET');
export const NODE_ENV = requireEnv('NODE_ENV');

requireFfmpeg();

export const logger = createLogger();

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(httpLogger(logger));
app.use(cors({ origin: FRONTEND_URL || true, credentials: true }));

const apiV1Router = express.Router();

apiV1Router.use(
  jwtAuth(['/api/v1/auth', '/api/v1/auth/google', '/api/v1/health', '/api/v1/formats']),
);

apiV1Router.use('/', systemRoutes);
apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/files', filesRoutes);
apiV1Router.use('/conversions', conversionsRoutes);
apiV1Router.use('/preparations', preparationsRoutes);

app.use('/api/v1', apiV1Router);

app.use(errorHandler());

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception');
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled Promise Rejection');
  process.exit(1);
});

app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
