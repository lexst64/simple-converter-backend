import { Router, Response, Request } from 'express';
import { pagination } from '@/middlewares.js';
import { ConversionService } from '@/services/conversion.service.js';
import { AppError } from '@/errors.js';
import { logger } from '@/logger.js';
import z from 'zod';
import { ObjectId } from 'mongodb';
import { Job, JobStatus } from '@/types.js';
import { FileService } from '@/services/file.service.js';
import { WebSocket } from 'ws';
import { S3Service } from '@/services/s3.service.js';

const router = Router();

const ConversionJobRequestSchema = z.object({
  inputFileId: z.string(),
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

  ConversionService.startConversion(job).catch((error) => {
    logger.error(
      { jobId: job._id.toString(), error: error.message },
      'Background conversion failed',
    );
  });

  return res.status(201).json(job);
});

/**
 * GET /api/v1/conversions/job
 * Gets list of conversion jobs for the authenticated user
 */
router.get('/job', pagination(1, 50), async (req, res) => {
  const userId = req.user?.googleId || '';

  const { limit, offset } = req.query;
  const parsedLimit = Number(limit) || 1;
  const parsedOffset = Number(offset) || 0;

  const jobs = await ConversionService.getUserJobs(userId, parsedLimit, parsedOffset);

  return res.json({
    jobs,
    limit: parsedLimit,
    offset: parsedOffset,
    total: jobs.length,
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

  const job = await ConversionService.getJob(new ObjectId(id));

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

  sendUpdate({ status: job.status, progress: job.progress });

  const listener = (updatedJob: Job) => {
    sendUpdate({ status: updatedJob.status, progress: updatedJob.progress });
  };

  ConversionService.onJobUpdate(id, listener);

  ws.on('close', () => {
    ConversionService.offJobUpdate(id, listener);
  });
}

export default router;
