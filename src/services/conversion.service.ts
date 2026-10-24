import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { Job, JobStatus, UserFile } from '@/types.js';
import { db } from '@/db.js';
import { logger } from '@/logger.js';
import { FileService, OUTPUTS_DIR, UPLOADS_DIR } from '@/services/file.service.js';

import { ChangeStream, ObjectId } from 'mongodb';
import { AppError } from '@/errors.js';
import { getFilenameExt } from '@/utils.js';
import { S3Service } from './s3.service.js';

export const SUPPORTED_FORMATS = [
  'jpeg',
  'jpg',
  'png',
  'gif',
  'bmp',
  'tiff',
  'heic',
  'webp',
  'mp4',
  'mkv',
  'webm',
  'avi',
  'mov',
  'flv',
  'wmv',
  'mp3',
  'aac',
  'wav',
  'flac',
  'ogg',
];

export class ConversionService {
  /**
   * Subscribes to updates for a specific job via a MongoDB Change Stream.
   * Returns the ChangeStream handle so it can be closed later with `offJobUpdate`.
   */
  static onJobUpdate(
    jobId: ObjectId,
    listener: (job: Job) => void,
    onError?: (err: Error) => void,
  ): ChangeStream {
    const pipeline = [
      {
        $match: {
          'documentKey._id': jobId,
          operationType: 'update',
        },
      },
    ];

    const changeStream = db.collection<Job>('jobs').watch(pipeline, {
      fullDocument: 'updateLookup',
    });

    changeStream.on('change', (change) => {
      if (change.operationType === 'update' && change.fullDocument) {
        listener(change.fullDocument);
      }
    });

    if (onError) {
      changeStream.on('error', onError);
    }

    return changeStream;
  }

  /**
   * Closes a change stream previously opened by `onJobUpdate`.
   */
  static offJobUpdate(changeStream: ChangeStream): void {
    changeStream.close().catch(() => {});
  }

  /**
   * Updates a job.
   */
  static async updateJob(job: Job, updates: Partial<Job>): Promise<Job> {
    const jobs = db.collection<Job>('jobs');
    const res = await jobs.findOneAndUpdate(
      { _id: job._id },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after', includeResultMetadata: false },
    );

    // Handle different MongoDB driver responses
    const updatedJob = (
      res && typeof res === 'object' && 'value' in res ? res.value : res
    ) as Job | null;

    if (!updatedJob) {
      throw new AppError(500, 'Failed to update job state');
    }

    return updatedJob;
  }

  /**
   * Validates if the output format is supported
   */
  static isFormatSupported(format: string): boolean {
    return SUPPORTED_FORMATS.includes(format.toLowerCase());
  }

  /**
   * Creates a new conversion job
   */
  static async createJob(
    userId: string,
    inputFileId: ObjectId,
    outputFormat: string,
  ): Promise<Job> {
    const files = db.collection<UserFile>('files');
    const inputFile = await files.findOne({ _id: inputFileId, userId });

    if (!inputFile || inputFile.deletedAt) {
      throw new AppError(400, `Input file with ID ${inputFileId.toString()} does not exist`);
    }

    const inputFormat = getFilenameExt(inputFile.fileName);

    const jobs = db.collection<Job>('jobs');
    const res = await jobs.insertOne({
      _id: new ObjectId(),
      userId,
      inputFileId,
      inputFormat,
      outputFormat: outputFormat.toLowerCase(),
      status: JobStatus.PENDING,
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const job = await jobs.findOne({ _id: res.insertedId });
    if (!job) {
      throw new AppError(500, 'Failed initializing a job');
    }

    logger.info(job, 'Conversion job created');

    return job;
  }

  /**
   * Gets a job by ID
   */
  static async getJob(jobId: ObjectId): Promise<Job | undefined> {
    const jobs = db.collection<Job>('jobs');
    const job = await jobs.findOne({ _id: jobId });
    if (!job) return undefined;
    return job;
  }

  /**
   * Deletes a job by ID
   */
  static async deleteJob(jobId: ObjectId): Promise<boolean> {
    const jobs = db.collection<Job>('jobs');
    const result = await jobs.deleteOne({ _id: jobId });
    return result.deletedCount === 1;
  }

  /**
   * Gets a page of jobs for a user along with the user's total job count
   */
  static async getUserJobs(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ jobs: Job[]; total: number }> {
    const jobs = db.collection<Job>('jobs');

    const [page, total] = await Promise.all([
      jobs.find({ userId }).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray(),
      jobs.countDocuments({ userId }),
    ]);

    return { jobs: page, total };
  }

  /**
   * Atomically claims a job by changing its status to PROCESSING.
   * Allows claiming jobs that are PENDING, FAILED (for retries), or PROCESSING.
   * Returns the updated job if successfully claimed, or null if already completed or cancelled.
   */
  static async claimJob(jobId: ObjectId): Promise<Job | null> {
    const jobs = db.collection<Job>('jobs');
    const res = await jobs.findOneAndUpdate(
      {
        _id: jobId,
        status: { $in: [JobStatus.PENDING, JobStatus.FAILED, JobStatus.PROCESSING] },
      },
      { $set: { status: JobStatus.PROCESSING, updatedAt: new Date() } },
      { returnDocument: 'after', includeResultMetadata: false },
    );

    const updatedJob = (
      res && typeof res === 'object' && 'value' in res ? res.value : res
    ) as Job | null;

    return updatedJob;
  }

  /**
   * Starts the conversion process
   */
  static async startConversion(job: Job): Promise<void> {
    const claimedJob = await this.claimJob(job._id);
    if (!claimedJob) {
      logger.warn(
        { jobId: job._id.toString() },
        'Job already claimed or processed by another worker. Skipping execution.',
      );
      return;
    }
    job = claimedJob;

    const inputFile = await db.collection<UserFile>('files').findOne({ _id: job.inputFileId });

    if (!inputFile) {
      logger.error(
        { jobId: job._id.toString() },
        'Starting conversion failed. Failed obtaining input file from the database.',
      );
      throw new Error('Starting conversion failed. Failed obtaining input file from the database.');
    }

    const id = inputFile._id.toString();

    const inputPath = path.join(UPLOADS_DIR, inputFile.fileName);
    await S3Service.downloadFile(id, inputPath);

    const outputFileName = `${randomUUID()}.${job.outputFormat}`;
    const outputPath = path.join(OUTPUTS_DIR, outputFileName);

    const originalOutputFileName = `${path.parse(inputFile.originalFileName || inputFile.fileName).name}.${job.outputFormat}`;

    logger.info(
      { jobId: job._id.toHexString(), inputPath, outputPath },
      'Starting FFmpeg conversion',
    );

    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-i',
        inputPath,
        '-y', // Overwrite output file
        '-progress',
        'pipe:2',
        '-nostats',
        outputPath,
      ];

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      let duration = 0;
      let errorOutput = '';

      // Get total duration from FFmpeg's initial output
      const ffprobe = spawn('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath,
      ]);

      ffprobe.on('error', (err) => {
        logger.warn(
          { jobId: job._id.toHexString(), err },
          'Could not spawn ffprobe to determine duration',
        );
      });

      ffprobe.stdout.on('data', (data) => {
        duration = parseFloat(data.toString());
      });

      ffprobe.on('close', () => {
        if (duration === 0) {
          logger.warn(
            { jobId: job._id.toHexString() },
            'Could not determine video duration. Progress will not be reported.',
          );
        }
      });

      let prevProgress = 0;

      // Parse FFmpeg stderr for progress information
      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        errorOutput += output;

        if (duration > 0) {
          const timeMatch = output.match(/out_time_ms=(\d+)/);
          if (timeMatch) {
            const currentTime = parseFloat(timeMatch[1]) / 1_000_000;
            const progress = Math.min(Math.round((currentTime / duration) * 100), 99);

            if (prevProgress === progress) return;

            prevProgress = progress;

            this.updateJob(job, { progress })
              .then(() => {
                logger.debug(
                  { jobId: job._id.toString(), progress },
                  'Conversion progress updated',
                );
              })
              .catch((err) => {
                logger.warn(
                  { jobId: job._id.toString(), err },
                  'Failed to update conversion progress',
                );
              });
          }
        }
      });

      ffmpeg.on('close', async (code) => {
        try {
          if (code === 0) {
            // Conversion successful
            const outputFileSize = (await fs.stat(outputPath)).size;
            const outputFile = await FileService.registerOutput({
              fileName: outputFileName,
              originalFileName: originalOutputFileName,
              size: outputFileSize,
              userId: job.userId,
            });

            if (outputFile) {
              await S3Service.uploadFile(outputFile._id.toString(), outputPath);
            }

            await this.updateJob(job, {
              status: JobStatus.COMPLETED,
              outputFileId: outputFile?._id,
              completedAt: new Date(),
              progress: 100,
            });

            await FileService.removeUpload(inputFile.fileName);
            await fs.unlink(outputPath).catch(() => {});
            await S3Service.removeFile(inputFile._id.toString());

            logger.info(
              { jobId: job._id.toString(), outputFileId: outputFile?._id },
              'Conversion completed successfully',
            );

            resolve();
          } else {
            // Conversion failed
            const errorMessage = `FFmpeg process exited with code ${code}`;
            await this.updateJob(job, {
              status: JobStatus.FAILED,
              errorMessage,
            });

            // Clean up the output file if it was created
            await FileService.removeOutput(outputFileName);
            await fs.unlink(inputPath).catch(() => {});

            logger.error(
              { jobId: job._id.toString(), code, stderr: errorOutput },
              'Conversion failed',
            );

            reject(new Error(`Conversion failed with code ${code}`));
          }
        } catch (err) {
          logger.error({ err, jobId: job._id.toString() }, 'Error during conversion cleanup');
          await this.updateJob(job, {
            status: JobStatus.FAILED,
            errorMessage: err instanceof Error ? err.message : 'Unknown error during cleanup',
          }).catch(() => {});

          await fs.unlink(outputPath).catch(() => {});
          reject(err);
        }
      });

      ffmpeg.on('error', async (error) => {
        try {
          await this.updateJob(job, {
            status: JobStatus.FAILED,
            errorMessage: error.message,
          });

          // Clean up the output file if it was created
          await FileService.removeOutput(outputFileName);
          await fs.unlink(inputPath).catch(() => {});
        } catch (cleanupError) {
          logger.error(
            { err: cleanupError, jobId: job._id.toString() },
            'Error during ffmpeg error cleanup',
          );
        } finally {
          logger.error({ jobId: job._id.toString(), error: error.message }, 'FFmpeg process error');
          reject(error);
        }
      });
    });
  }
}

export const ConversionStatusEnum = JobStatus;
