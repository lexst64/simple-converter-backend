import { Router, Response, Request } from 'express';
import { pagination } from '../middlewares';
import { ConversionJobRequest } from '../types';
import { ConversionService } from '../services/conversion.service';
import { AppError } from '../errors';
import { logger } from '../index';

const router = Router();

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

    const { inputFileId, outputFormat }: ConversionJobRequest = req.body;

    // Validate request body
    if (!inputFileId || !outputFormat) {
      throw new AppError(400, 'inputFileId and outputFormat are required');
    }

    if (typeof inputFileId !== 'string' || typeof outputFormat !== 'string') {
      throw new AppError(400, 'inputFileId and outputFormat must be strings');
    }

    // Validate output format
    if (!ConversionService.isFormatSupported(outputFormat)) {
      throw new AppError(
        400,
        `Output format '${outputFormat}' is not supported. Supported formats: mp4, mkv, webm, avi, mov, flv, wmv, mp3, aac, wav, flac, ogg`,
      );
    }

    // Check if input file exists
    if (!ConversionService.fileExists(inputFileId)) {
      throw new AppError(404, `Input file with ID '${inputFileId}' not found`);
    }

    // Create the conversion job
    const job = ConversionService.createJob(userId, inputFileId, outputFormat);

    // Start the conversion process in the background
    ConversionService.startConversion(job).catch((error) => {
      logger.error({ jobId: job.id, error: error.message }, 'Background conversion failed');
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

    const jobs = ConversionService.getUserJobs(userId, parsedLimit, parsedOffset);

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
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
    const job = ConversionService.getJob(id);

    if (!job) {
      throw new AppError(404, `Conversion job with ID '${id}' not found`);
    }

    if (job.userId !== req.loggedInUser?.googleId) {
      throw new AppError(403, 'Forbidden: This job does not belong to you');
    }

    return res.json(job);
  } catch (error) {
    next(error);
  }
});

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
    const job = ConversionService.getJob(id);

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

    sendUpdate(job);

    const listener = (updatedJob: any) => {
      sendUpdate(updatedJob);
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
