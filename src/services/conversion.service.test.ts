import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'child_process';
import { ObjectId } from 'mongodb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db.js';
import { AppError } from '@/errors.js';
import { logger } from '@/logger.js';
import { ConversionService, SUPPORTED_FORMATS } from '@/services/conversion.service.js';
import { FileService } from '@/services/file.service.js';
import { S3Service } from '@/services/s3.service.js';
import { Job, JobStatus, UserFile } from '@/types.js';

vi.mock('@/db.js', () => ({ db: { collection: vi.fn() } }));

vi.mock('@/services/s3.service.js', () => ({
  S3Service: {
    downloadFile: vi.fn(),
    uploadFile: vi.fn(),
    removeFile: vi.fn(),
    generateUploadPresignedUrl: vi.fn(),
    generateDownloadPresignedUrl: vi.fn(),
  },
}));

vi.mock('@/services/file.service.js', async () => {
  const nodePath = await import('node:path');
  const nodeOs = await import('node:os');
  const root = nodePath.join(nodeOs.tmpdir(), 'simple-converter-test-nonexistent');
  return {
    UPLOADS_DIR: nodePath.join(root, '_uploads'),
    OUTPUTS_DIR: nodePath.join(root, '_outputs'),
    FileService: {
      registerUpload: vi.fn(),
      registerOutput: vi.fn(),
      removeUpload: vi.fn(),
      removeOutput: vi.fn(),
      getUserFile: vi.fn(),
    },
  };
});

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  spawn: vi.fn(),
}));

type MockCollection = Record<string, ReturnType<typeof vi.fn>>;

function mockCollections(collections: Record<string, MockCollection>) {
  vi.mocked(db.collection).mockImplementation(((name: string) => {
    const collection = collections[name];
    if (!collection) throw new Error(`Unexpected collection: ${name}`);
    return collection;
  }) as unknown as typeof db.collection);
}

function makeFile(overrides: Partial<UserFile> = {}): UserFile {
  return {
    _id: new ObjectId(),
    userId: 'user-1',
    fileName: 'abc.MOV',
    originalFileName: 'holiday.MOV',
    type: 'upload',
    size: 1234,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    _id: new ObjectId(),
    userId: 'user-1',
    inputFileId: new ObjectId(),
    inputFormat: 'mov',
    outputFormat: 'mp4',
    progress: 0,
    status: JobStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ConversionService.isFormatSupported', () => {
  it.each(SUPPORTED_FORMATS)('accepts %s', (format) => {
    expect(ConversionService.isFormatSupported(format)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(ConversionService.isFormatSupported('MP4')).toBe(true);
    expect(ConversionService.isFormatSupported('Jpeg')).toBe(true);
  });

  it('rejects unsupported or empty formats', () => {
    expect(ConversionService.isFormatSupported('exe')).toBe(false);
    expect(ConversionService.isFormatSupported('')).toBe(false);
    expect(ConversionService.isFormatSupported('.mp4')).toBe(false);
  });
});

describe('ConversionService.createJob', () => {
  let files: MockCollection;
  let jobs: MockCollection;

  beforeEach(() => {
    files = { findOne: vi.fn() };
    jobs = { insertOne: vi.fn(), findOne: vi.fn() };
    mockCollections({ files, jobs });
  });

  // Regression: the input file lookup used to ignore userId, letting users convert others' files.
  it('looks up the input file scoped to the requesting user', async () => {
    const inputFileId = new ObjectId();
    files.findOne!.mockResolvedValue(null); // no file owned by this user

    const promise = ConversionService.createJob('user-1', inputFileId, 'mp4');

    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ status: 400 });
    expect(files.findOne).toHaveBeenCalledWith({ _id: inputFileId, userId: 'user-1' });
    expect(jobs.insertOne).not.toHaveBeenCalled();
  });

  it("rejects another user's file with a 400", async () => {
    const otherUsersFile = makeFile({ userId: 'user-2' });
    // Emulate Mongo honouring the filter: only match when userId matches the owner.
    files.findOne!.mockImplementation(async (filter: { _id: ObjectId; userId?: string }) =>
      filter._id.equals(otherUsersFile._id) && filter.userId === otherUsersFile.userId
        ? otherUsersFile
        : null,
    );

    await expect(
      ConversionService.createJob('user-1', otherUsersFile._id, 'mp4'),
    ).rejects.toMatchObject({ status: 400 });
    expect(jobs.insertOne).not.toHaveBeenCalled();
  });

  it('rejects a soft-deleted file with a 400', async () => {
    const file = makeFile({ deletedAt: new Date() });
    files.findOne!.mockResolvedValue(file);

    await expect(ConversionService.createJob('user-1', file._id, 'mp4')).rejects.toMatchObject({
      status: 400,
    });
    expect(jobs.insertOne).not.toHaveBeenCalled();
  });

  it('inserts a PENDING job with a lowercased output format', async () => {
    const file = makeFile({ fileName: 'abc.mov' });
    files.findOne!.mockResolvedValue(file);

    const insertedId = new ObjectId();
    jobs.insertOne!.mockResolvedValue({ acknowledged: true, insertedId });
    const storedJob = makeJob({ _id: insertedId, inputFileId: file._id });
    jobs.findOne!.mockResolvedValue(storedJob);

    const result = await ConversionService.createJob('user-1', file._id, 'MP4');

    expect(result).toBe(storedJob);
    expect(jobs.insertOne).toHaveBeenCalledOnce();
    expect(jobs.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.any(ObjectId),
        userId: 'user-1',
        inputFileId: file._id,
        inputFormat: 'mov',
        outputFormat: 'mp4',
        status: JobStatus.PENDING,
        progress: 0,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(jobs.findOne).toHaveBeenCalledWith({ _id: insertedId });
  });

  it('throws a 500 when the inserted job cannot be read back', async () => {
    files.findOne!.mockResolvedValue(makeFile());
    jobs.insertOne!.mockResolvedValue({ acknowledged: true, insertedId: new ObjectId() });
    jobs.findOne!.mockResolvedValue(null);

    await expect(
      ConversionService.createJob('user-1', new ObjectId(), 'mp4'),
    ).rejects.toMatchObject({ status: 500 });
  });
});

describe('ConversionService.getUserJobs', () => {
  it('wires sort/skip/limit and counts the user’s jobs', async () => {
    const page = [makeJob(), makeJob()];
    const cursor = {
      sort: vi.fn(),
      skip: vi.fn(),
      limit: vi.fn(),
      toArray: vi.fn().mockResolvedValue(page),
    };
    cursor.sort.mockReturnValue(cursor);
    cursor.skip.mockReturnValue(cursor);
    cursor.limit.mockReturnValue(cursor);

    const jobs = {
      find: vi.fn().mockReturnValue(cursor),
      countDocuments: vi.fn().mockResolvedValue(42),
    };
    mockCollections({ jobs });

    const result = await ConversionService.getUserJobs('user-1', 10, 20);

    expect(result).toEqual({ jobs: page, total: 42 });
    expect(jobs.find).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(cursor.skip).toHaveBeenCalledWith(20);
    expect(cursor.limit).toHaveBeenCalledWith(10);
    expect(jobs.countDocuments).toHaveBeenCalledWith({ userId: 'user-1' });
  });
});

describe('ConversionService.startConversion', () => {
  class FakeProcess extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
  }

  let unhandled: unknown[];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    unhandled = [];
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
  });

  // Regression: a failed progress update inside the ffmpeg stderr handler used to be an
  // unhandled promise rejection, which crashes the process (index.ts exits on it).
  it('does not produce an unhandled rejection when a progress update fails', async () => {
    const job = makeJob();
    const inputFile = makeFile({ _id: job.inputFileId });

    const jobsCollection = { findOneAndUpdate: vi.fn() };
    jobsCollection.findOneAndUpdate
      .mockResolvedValueOnce({ ...job, status: JobStatus.PROCESSING }) // claimJob
      .mockRejectedValueOnce(new Error('mongo went away')) // progress update
      .mockResolvedValue({ ...job, status: JobStatus.FAILED }); // final FAILED update
    mockCollections({
      jobs: jobsCollection,
      files: { findOne: vi.fn().mockResolvedValue(inputFile) },
    });
    vi.mocked(S3Service.downloadFile).mockResolvedValue(undefined);
    vi.mocked(FileService.removeOutput).mockResolvedValue(undefined);

    const ffmpeg = new FakeProcess();
    const ffprobe = new FakeProcess();
    vi.mocked(spawn).mockImplementation(((command: string) =>
      command === 'ffmpeg' ? ffmpeg : ffprobe) as unknown as typeof spawn);

    const conversion = ConversionService.startConversion(job);
    // Attach a handler now so the expected final rejection isn't reported as unhandled.
    const outcome = conversion.then(
      () => 'resolved',
      (err: Error) => err.message,
    );

    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    expect(vi.mocked(spawn).mock.calls[0]![1]).toContain(
      path.join(os.tmpdir(), 'simple-converter-test-nonexistent', '_uploads', inputFile.fileName),
    );

    ffprobe.stdout.emit('data', Buffer.from('10.0\n'));
    ffprobe.emit('close', 0);
    ffmpeg.stderr.emit('data', Buffer.from('out_time_ms=5000000\n'));

    await vi.waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: job._id.toString() }),
        'Failed to update conversion progress',
      ),
    );
    expect(jobsCollection.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { _id: job._id },
      { $set: expect.objectContaining({ progress: 50 }) },
      expect.anything(),
    );

    ffmpeg.emit('close', 1);

    expect(await outcome).toBe('Conversion failed with code 1');
    expect(jobsCollection.findOneAndUpdate).toHaveBeenLastCalledWith(
      { _id: job._id },
      {
        $set: expect.objectContaining({
          status: JobStatus.FAILED,
          errorMessage: 'FFmpeg process exited with code 1',
        }),
      },
      expect.anything(),
    );

    // Give any stray rejections a chance to surface.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(unhandled).toEqual([]);
  });
});
