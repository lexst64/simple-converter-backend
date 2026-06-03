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
        outputPath,
      ];

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      let errorOutput = '';

      // Parse FFmpeg stderr for progress information
      ffmpeg.stderr.on('data', async (data) => {
        const output = data.toString();
        errorOutput += output;

        // Extract duration and current time to calculate progress
        const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
        const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);

        if (durationMatch && timeMatch) {
          const duration = this.timeToSeconds(
            parseInt(durationMatch[1]),
            parseInt(durationMatch[2]),
            parseFloat(durationMatch[3]),
          );

          const currentTime = this.timeToSeconds(
            parseInt(timeMatch[1]),
            parseInt(timeMatch[2]),
            parseFloat(timeMatch[3]),
          );

          const progress = Math.min(Math.round((currentTime / duration) * 100), 99);

          // We are not storing progress in the job object in this implementation,
          // but we are updating the 'updatedAt' field.
          await this.updateJob(job, {});

          logger.debug({ jobId: job._id.toString(), progress }, 'Conversion progress updated');
        }
      });

      ffmpeg.on('close', async (code) => {
        if (code === 0) {
          // Conversion successful
          await this.updateJob(job, {
            status: JobStatus.COMPLETED,
            outputFileId,
            completedAt: new Date(),
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

  /**
   * Helper function to convert time string (HH:MM:SS.ms) to seconds
   */
  private static timeToSeconds(hours: number, minutes: number, seconds: number): number {
    return hours * 3600 + minutes * 60 + seconds;
  }
}

export const ConversionStatusEnum = JobStatus;
