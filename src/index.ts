import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler, httpLogger, jwtAuth } from '@/middlewares.js';
import systemRoutes from '@/routes/system.routes.js';
import authRoutes from '@/routes/auth.routes.js';
import filesRoutes from '@/routes/files.routes.js';
import conversionsRoutes from '@/routes/conversions.routes.js';
import { requireFfmpeg } from '@/utils.js';
import { logger } from '@/logger.js';
import { connectToDatabase, closeDatabaseConnection } from '@/db.js';
import { PORT, FRONTEND_URL } from '@/config.js';

requireFfmpeg();

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(httpLogger(logger));
app.use(cors({ origin: FRONTEND_URL, credentials: true }));

const apiV1Router = express.Router();

apiV1Router.use(jwtAuth(['/api/v1/auth/google', '/api/v1/health', '/api/v1/formats']));

apiV1Router.use('/', systemRoutes);
apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/files', filesRoutes);
apiV1Router.use('/conversions', conversionsRoutes);

app.use('/api/v1', apiV1Router);

app.use(errorHandler());

const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  try {
    await closeDatabaseConnection();
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during database disconnection');
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception');
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled Promise Rejection');
  process.exit(1);
});

try {
  await connectToDatabase();
  app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
} catch (error) {
  logger.error({ error }, 'Failed to start application');
  process.exit(1);
}
