import { Router, Response, Request } from 'express';
import { pagination } from '@/middlewares.js';
import { ConversionService } from '@/services/conversion.service.js';
import { AppError } from '@/errors.js';
import { logger } from '@/logger.js';
import z from 'zod';
import { ObjectId } from 'mongodb';
import { JobStatus } from '@/types.js';
import { FileService } from '@/services/file.service.js';
import { WebSocket } from 'ws';
import { S3Service } from '@/services/s3.service.js';
import { conversionQueue } from '@/queue.js';

const router = Router();

const ConversionJobRequestSchema = z.object({
  inputFileId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid inputFileId'),
  outputFormat: z.string(),
});

/**
 * POST /api/v1/conversions/job
 * Creates a new conversion job
 */
router.post('/job', async (req, res) => {
  const userId = req.user?.googleId;
  if (!userId) {
    throw new AppError(401, 'User not authenticated');
  }

  const validation = ConversionJobRequestSchema.safeParse(req.body);
  if (!validation.success) {
    throw new AppError(400, validation.error.message);
  }

  const { inputFileId, outputFormat } = validation.data;

  if (!ConversionService.isFormatSupported(outputFormat)) {
    throw new AppError(400, `Output format '${outputFormat}' is not supported.`);
  }

  const job = await ConversionService.createJob(
    userId,
    ObjectId.createFromHexString(inputFileId),
    outputFormat,
  );

  await conversionQueue.add(
    'convert',
    { jobId: job._id.toString() },
    {
      jobId: job._id.toString(),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  );

  return res.status(201).json(job);
});

/**
 * GET /api/v1/conversions/job
 * Gets list of conversion jobs for the authenticated user
 */
router.get('/job', pagination(20, 50), async (req, res) => {
  const userId = req.user?.googleId || '';

  const { limit, offset } = res.locals.pagination!;

  const { jobs, total } = await ConversionService.getUserJobs(userId, limit, offset);

  return res.json({
    jobs,
    limit,
    offset,
    total,
  });
});

/**
 * GET /api/v1/conversions/job/:id
 * Gets a specific conversion job details
 */
router.get('/job/:id', async (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
  if (!ObjectId.isValid(id)) {
    throw new AppError(400, 'Invalid ID format');
  }

  const job = await ConversionService.getJob(new ObjectId(id));

  if (!job) {
    throw new AppError(404, `Conversion job with ID '${id}' not found`);
  }

  if (job.userId !== req.user?.googleId) {
    throw new AppError(403, 'Forbidden: This job does not belong to you');
  }

  return res.json(job);
});

/**
 * DELETE /api/v1/conversions/job/:id
 * Deletes a specified job unless it is pending or in progress
 */
router.delete('/job/:id', async (req: Request, res: Response, next) => {
  const userId = req.user?.googleId;
  if (!userId) {
    throw new AppError(401, 'User not authenticated');
  }

  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
  if (!ObjectId.isValid(id)) {
    throw new AppError(400, 'Invalid ID format');
  }

  const job = await ConversionService.getJob(new ObjectId(id));

  if (!job) {
    throw new AppError(404, `Conversion job with ID '${id}' not found`);
  }

  if (job.userId !== userId) {
    throw new AppError(403, 'Forbidden: This job does not belong to you');
  }

  if (job.status === JobStatus.PENDING || job.status === JobStatus.PROCESSING) {
    throw new AppError(400, 'Cannot delete a pending or in-progress job');
  }

  if (job.inputFileId) {
    await FileService.removeUpload(job.inputFileId);
    await S3Service.removeFile(job.inputFileId.toString());
  }
  if (job.outputFileId) {
    await FileService.removeOutput(job.outputFileId);
    await S3Service.removeFile(job.outputFileId.toString());
  }

  await ConversionService.deleteJob(job._id);

  return res.status(200).json({ message: 'Job and associated files deleted successfully' });
});

/**
 * Handles WebSocket connection for monitoring conversion job status
 */
export async function handleJobStatusWebSocket(ws: WebSocket, req: Request, id: string) {
  const userId = req.user?.googleId;
  if (!userId) {
    ws.close(4001, 'User not authenticated');
    return;
  }

  if (!ObjectId.isValid(id)) {
    ws.close(4000, 'Invalid ID format');
    return;
  }

  const jobId = new ObjectId(id);
  const job = await ConversionService.getJob(jobId);

  if (!job) {
    ws.close(4004, `Conversion job with ID '${id}' not found`);
    return;
  }

  if (job.userId !== userId) {
    ws.close(4003, 'Forbidden: This job does not belong to you');
    return;
  }

  const sendUpdate = (data: object) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  // send the current state immediately
  sendUpdate({ status: job.status, progress: job.progress });

  // if the job is already in a terminal state, close right away
  const terminalStatuses: JobStatus[] = [
    JobStatus.COMPLETED,
    JobStatus.FAILED,
    JobStatus.CANCELLED,
  ];
  if (terminalStatuses.includes(job.status)) {
    ws.close(1000, 'Job already in terminal state');
    return;
  }

  const changeStream = ConversionService.onJobUpdate(
    jobId,
    (updatedJob) => {
      const { status, progress } = updatedJob;
      sendUpdate({ status, progress });

      if (terminalStatuses.includes(status)) {
        ConversionService.offJobUpdate(changeStream);
        ws.close(1000, 'Job reached terminal state');
      }
    },
    (err) => {
      logger.error({ jobId: id, error: err }, 'Change stream error');
      ConversionService.offJobUpdate(changeStream);
      ws.close(1011, 'Internal error');
    },
  );

  ws.on('close', () => {
    ConversionService.offJobUpdate(changeStream);
  });
}

export default router;
