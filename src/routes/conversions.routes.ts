import { Router, Response, Request } from 'express';
import { pagination } from '@/middlewares.js';
import { ConversionService } from '@/services/conversion.service.js';
import { AppError } from '@/errors.js';
import { logger } from '@/logger.js';
import z from 'zod';
import { ObjectId } from 'mongodb';
import { Job } from '@/types.js';

const router = Router();

const ConversionJobRequestSchema = z.object({
  inputFileId: z.string(),
  outputFormat: z.string(),
});

/**
 * POST /api/v1/conversions/job
 * Creates a new conversion job
 */
router.post('/job', async (req: Request, res: Response, next) => {
  try {
    const userId = req.loggedInUser?.googleId;
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
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/conversions/job
 * Gets list of conversion jobs for the authenticated user
 */
router.get('/job', pagination(1, 50), async (req: Request, res: Response, next) => {
  try {
    const userId = req.loggedInUser?.googleId || '';

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
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/conversions/job/:id
 * Gets a specific conversion job details
 */
router.get('/job/:id', async (req: Request, res: Response, next) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
  if (!ObjectId.isValid(id)) {
    throw new AppError(400, 'Invalid ID format');
  }

  const job = await ConversionService.getJob(new ObjectId(id));

  if (!job) {
    throw new AppError(404, `Conversion job with ID '${id}' not found`);
  }

  if (job.userId !== req.loggedInUser?.googleId) {
    throw new AppError(403, 'Forbidden: This job does not belong to you');
  }

  return res.json(job);
});

/**
 * DELETE /api/v1/conversions/job/:id
 * Deletes a specified job unless it is pending or in progress
 */
router.delete('/job/:id', async (req, res) => {});

/**
 * GET /api/v1/conversions/job/:id/status
 * Gets the status of a specific conversion job as a real-time stream (SSE)
 */
router.get('/job/:id/status', async (req: Request, res: Response, next) => {
  try {
    const userId = req.loggedInUser?.googleId;
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

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendUpdate = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendUpdate({ status: job.status, progress: job.progress });

    const listener = (updatedJob: Job) => {
      sendUpdate({ status: updatedJob.status, progress: updatedJob.progress });
    };

    ConversionService.onJobUpdate(id, listener);

    req.on('close', () => {
      ConversionService.offJobUpdate(id, listener);
      res.end();
    });
  } catch (error) {
    next(error);
  }
});

export default router;
