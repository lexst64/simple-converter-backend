import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { Job, JobStatus } from '@/types.js';
import { db, logger } from '@/index.js';
import { FileService, OUTPUTS_DIR, UPLOADS_DIR } from '@/services/file.service.js';
import { EventEmitter } from 'events';
import { ObjectId } from 'mongodb';
import { AppError } from '@/errors.js';

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

const jobEvents = new EventEmitter();

export class ConversionService {
  /**
   * Adds a listener for job status changes.
   */
  static onJobUpdate(jobId: string, listener: (job: Job) => void) {
    jobEvents.on(jobId, listener);
  }

  /**
   * Removes a listener for job status changes.
   */
  static offJobUpdate(jobId: string, listener: (job: Job) => void) {
    jobEvents.off(jobId, listener);
  }

  /**
   * Updates a job and emits an event.
   */
  static async updateJob(job: Job, updates: Partial<Job>): Promise<Job> {
    const updatedJob = { ...job, ...updates, updatedAt: new Date() };

    const jobs = db.collection<Job>('jobs');
    const res = await jobs.findOneAndReplace({ _id: job._id }, updatedJob, {
      includeResultMetadata: true,
    });
    if (!res.ok) {
      throw new AppError(500, 'Failed to update job state');
    }
    jobEvents.emit(job._id.toString(), updatedJob);
    return updatedJob;
  }

  /**
   * Validates if the output format is supported
   */
  static isFormatSupported(format: string): boolean {
    return SUPPORTED_FORMATS.includes(format.toLowerCase());
  }

  /**
   * Validates if input file exists
   */
  static async fileExists(fileId: string): Promise<boolean> {
    const filePath = path.join(UPLOADS_DIR, fileId);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a new conversion job
   */
  static async createJob(userId: string, inputFileId: string, outputFormat: string): Promise<Job> {
    const jobs = db.collection<Job>('jobs');
    const res = await jobs.insertOne({
      _id: new ObjectId(),
      userId,
      inputFileId,
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
   * Gets all jobs for a user
   */
  static async getUserJobs(userId: string, limit: number, offset: number): Promise<Job[]> {
    const jobs = db.collection<Job>('jobs');

    return await jobs.find({ userId }).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray();
  }

  /**
   * Starts the conversion process
   */
  static async startConversion(job: Job): Promise<void> {
    const inputPath = path.join(UPLOADS_DIR, job.inputFileId);
    const outputFileId = `${randomUUID()}.${job.outputFormat}`;
    const outputPath = path.join(OUTPUTS_DIR, outputFileId);

    job = await this.updateJob(job, { status: JobStatus.PROCESSING });

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
      ffmpeg.stderr.on('data', async (data) => {
        const output = data.toString();
        errorOutput += output;

        if (duration > 0) {
          const timeMatch = output.match(/out_time_ms=(\d+)/);
          if (timeMatch) {
            const currentTime = parseFloat(timeMatch[1]) / 1_000_000;
            const progress = Math.min(Math.round((currentTime / duration) * 100), 99);

            if (prevProgress === progress) return;

            prevProgress = progress;

            await this.updateJob(job, { progress });
            logger.debug({ jobId: job._id.toString(), progress }, 'Conversion progress updated');
          }
        }
      });

      ffmpeg.on('close', async (code) => {
        if (code === 0) {
          // Conversion successful
          await this.updateJob(job, {
            status: JobStatus.COMPLETED,
            outputFileId,
            completedAt: new Date(),
            progress: 100,
          });
          const outputFileSize = (await fs.stat(outputPath)).size;

          await FileService.registerOutput({
            fileName: outputFileId,
            size: outputFileSize,
            userId: job.userId,
          });

          logger.info(
            { jobId: job._id.toString(), outputFileId },
            'Conversion completed successfully',
          );

          resolve();
        } else {
          // Conversion failed
          const errorMessage = `FFmpeg process exited with code ${code}`;
          this.updateJob(job, {
            status: JobStatus.FAILED,
            errorMessage,
          });

          // Clean up the output file if it was created
          FileService.removeOutput(outputFileId);

          logger.error(
            { jobId: job._id.toString(), code, stderr: errorOutput },
            'Conversion failed',
          );

          reject(new Error(`Conversion failed with code ${code}`));
        }
      });

      ffmpeg.on('error', async (error) => {
        this.updateJob(job, {
          status: JobStatus.FAILED,
          errorMessage: error.message,
        });

        // Clean up the output file if it was created
        await FileService.removeOutput(outputFileId);

        logger.error({ jobId: job._id.toString(), error: error.message }, 'FFmpeg process error');

        reject(error);
      });
    });
  }
}

export const ConversionStatusEnum = JobStatus;
