import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { ConversionJob, ConversionStatus } from '../types';
import { logger } from '../index';
import { FilesService, OUTPUTS_DIR, UPLOADS_DIR } from './files.service';

export const SUPPORTED_FORMATS = ['jpeg', 'jpg', 'png', 'gif', 'bmp', 'tiff', 'heic', 'webp', 'mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'wmv', 'mp3', 'aac', 'wav', 'flac', 'ogg'];

// In-memory job store (for production, use a database)
const jobStore = new Map<string, ConversionJob>();
const activeProcesses = new Map<string, ChildProcess>();

export class ConversionService {
  /**
   * Validates if the output format is supported
   */
  static isFormatSupported(format: string): boolean {
    return SUPPORTED_FORMATS.includes(format.toLowerCase());
  }

  /**
   * Validates if input file exists
   */
  static fileExists(fileId: string): boolean {
    const filePath = path.join(UPLOADS_DIR, fileId);
    return fs.existsSync(filePath);
  }

  /**
   * Creates a new conversion job
   */
  static createJob(
    userId: string,
    inputFileId: string,
    outputFormat: string,
  ): ConversionJob {
    const jobId = randomUUID();
    const job: ConversionJob = {
      id: jobId,
      userId,
      inputFileId,
      outputFormat: outputFormat.toLowerCase(),
      status: ConversionStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    jobStore.set(jobId, job);
    logger.info({ jobId, userId, inputFileId, outputFormat }, 'Conversion job created');

    return job;
  }

  /**
   * Gets a job by ID
   */
  static getJob(jobId: string): ConversionJob | undefined {
    return jobStore.get(jobId);
  }

  /**
   * Gets all jobs for a user
   */
  static getUserJobs(userId: string, limit: number, offset: number): ConversionJob[] {
    return Array.from(jobStore.values())
      .filter((job) => job.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  /**
   * Starts the conversion process
   */
  static async startConversion(job: ConversionJob): Promise<void> {
    const inputPath = path.join(UPLOADS_DIR, job.inputFileId);
    const outputFileId = `${randomUUID()}.${job.outputFormat}`;
    const outputPath = path.join(OUTPUTS_DIR, outputFileId);

    // Update job status
    job.status = ConversionStatus.PROCESSING;
    job.updatedAt = new Date();
    jobStore.set(job.id, job);

    logger.info(
      { jobId: job.id, inputPath, outputPath },
      'Starting FFmpeg conversion',
    );

    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-i', inputPath,
        '-y', // Overwrite output file
        outputPath,
      ];

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      activeProcesses.set(job.id, ffmpeg);

      let errorOutput = '';

      // Parse FFmpeg stderr for progress information
      ffmpeg.stderr.on('data', (data) => {
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


          job.updatedAt = new Date();
          jobStore.set(job.id, job);

          logger.debug({ jobId: job.id }, 'Conversion progress updated');
        }
      });

      ffmpeg.on('close', (code) => {
        activeProcesses.delete(job.id);

        if (job.status === ConversionStatus.CANCELLED) {
          FilesService.removeOutput(outputFileId);
          logger.info({ jobId: job.id, outputFileId }, 'Conversion cancelled');
          resolve();
          return;
        }

        if (code === 0) {
          // Conversion successful
          job.status = ConversionStatus.COMPLETED;
          job.outputFileId = outputFileId;
          job.completedAt = new Date();
          job.updatedAt = new Date();
          jobStore.set(job.id, job);

          FilesService.removeUpload(job.inputFileId);

          logger.info(
            { jobId: job.id, outputFileId },
            'Conversion completed successfully',
          );

          resolve();
        } else {
          // Conversion failed
          job.status = ConversionStatus.FAILED;
          job.errorMessage = `FFmpeg process exited with code ${code}`;
          job.updatedAt = new Date();
          jobStore.set(job.id, job);

          // Clean up the output file if it was created
          FilesService.removeOutput(outputFileId);

          logger.error(
            { jobId: job.id, code, stderr: errorOutput },
            'Conversion failed',
          );

          reject(new Error(`Conversion failed with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        activeProcesses.delete(job.id);

        job.status = ConversionStatus.FAILED;
        job.errorMessage = error.message;
        job.updatedAt = new Date();
        jobStore.set(job.id, job);

        logger.error({ jobId: job.id, error: error.message }, 'FFmpeg process error');

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

  /**
   * Cancels a conversion job
   */
  static cancelJob(jobId: string): boolean {
    const job = jobStore.get(jobId);
    if (!job) {
      return false;
    }

    if (job.status === ConversionStatus.PROCESSING) {
      const ffmpeg = activeProcesses.get(jobId);
      job.status = ConversionStatus.CANCELLED;
      job.updatedAt = new Date();
      jobStore.set(jobId, job);

      if (ffmpeg) {
        ffmpeg.kill('SIGTERM');
      }
      
      logger.info({ jobId }, 'Conversion job cancelled');
      return true;
    }

    return false;
  }

  /**
   * Deletes a completed job and cleans up output file
   */
  static deleteJob(jobId: string): boolean {
    const job = jobStore.get(jobId);
    if (!job) {
      return false;
    }

    // Clean up output file if it exists
    if (job.outputFileId) {
      const outputPath = path.join(OUTPUTS_DIR, job.outputFileId);
      if (fs.existsSync(outputPath)) {
        try {
          fs.unlinkSync(outputPath);
          logger.info({ jobId, outputFileId: job.outputFileId }, 'Output file deleted');
        } catch (error) {
          logger.error({ jobId, error }, 'Failed to delete output file');
        }
      }
    }

    jobStore.delete(jobId);
    logger.info({ jobId }, 'Conversion job deleted');
    return true;
  }
}

export const ConversionStatusEnum = ConversionStatus;
