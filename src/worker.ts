import { Worker } from 'bullmq';
import { connectToDatabase, closeDatabaseConnection } from '@/db.js';
import { ConversionService } from '@/services/conversion.service.js';
import { ObjectId } from 'mongodb';
import { logger } from '@/logger.js';
import { redisConnection } from '@/queue.js';
import { requireFfmpeg } from '@/utils.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const startWorker = async (): Promise<Worker> => {
  requireFfmpeg();
  await connectToDatabase();

  const worker = new Worker(
    'conversions',
    async (job) => {
      const conversionJobId = new ObjectId(job.data.jobId as string);
      const conversionJob = await ConversionService.getJob(conversionJobId);

      if (!conversionJob) {
        throw new Error(`Job ${conversionJobId.toString()} not found in database.`);
      }

      logger.info({ jobId: conversionJobId.toString() }, 'Worker started processing job');
      await ConversionService.startConversion(conversionJob);
      logger.info({ jobId: conversionJobId.toString() }, 'Worker finished processing job');
    },
    {
      connection: redisConnection,
      concurrency: Number(process.env.WORKER_CONCURRENCY) || 1,
      lockDuration: 300000, // 5 minutes lock duration for long-running FFmpeg jobs
      maxStalledCount: 1,
      prefix: '{conversions}',
    },
  );

  worker.on('failed', (job, err) => {
    if (job) {
      logger.error({ jobId: job.data.jobId, err: err.message }, 'Job failed');
    } else {
      logger.error({ err: err.message }, 'Unknown job failed');
    }
  });

  logger.info('Worker is running and listening for conversion jobs...');
  return worker;
};

// Check if this module is run directly from CLI
const currentFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (entryFile === currentFile) {
  startWorker()
    .then((worker) => {
      const gracefulShutdown = async (signal: string) => {
        logger.info(`Received ${signal}. Shutting down worker gracefully...`);
        await worker.close();
        await closeDatabaseConnection();
        process.exit(0);
      };

      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    })
    .catch((error) => {
      logger.error({ error }, 'Failed to start worker');
      process.exit(1);
    });
}
