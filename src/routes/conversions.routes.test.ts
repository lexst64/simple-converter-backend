import { ObjectId } from 'mongodb';
import request from 'supertest';
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { conversionQueue } from '@/queue.js';
import conversionsRouter from '@/routes/conversions.routes.js';
import { ConversionService } from '@/services/conversion.service.js';
import { buildTestApp } from '@/test/app.js';
import { Job, JobStatus } from '@/types.js';

vi.mock('@/db.js', () => ({ db: { collection: vi.fn() } }));
vi.mock('@/queue.js', () => ({ conversionQueue: { add: vi.fn() } }));
vi.mock('@/services/s3.service.js', () => ({
  S3Service: {
    removeFile: vi.fn(),
    downloadFile: vi.fn(),
    uploadFile: vi.fn(),
  },
}));
vi.mock('@/services/file.service.js', () => ({
  UPLOADS_DIR: '/nonexistent/_uploads',
  OUTPUTS_DIR: '/nonexistent/_outputs',
  FileService: {
    removeUpload: vi.fn(),
    removeOutput: vi.fn(),
    registerOutput: vi.fn(),
  },
}));

const app = buildTestApp('/conversions', conversionsRouter);

describe('POST /conversions/job', () => {
  let createJob: MockInstance<typeof ConversionService.createJob>;

  beforeEach(() => {
    createJob = vi.spyOn(ConversionService, 'createJob');
  });

  // Regression: a malformed id used to reach ObjectId.createFromHexString and produce a 500.
  it.each(['not-an-object-id', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz', 'aaaaaaaaaaaa'])(
    'responds 400 for malformed inputFileId %j',
    async (inputFileId) => {
      const res = await request(app)
        .post('/conversions/job')
        .send({ inputFileId, outputFormat: 'mp4' });

      expect(res.status).toBe(400);
      expect(createJob).not.toHaveBeenCalled();
      expect(conversionQueue.add).not.toHaveBeenCalled();
    },
  );

  it('responds 400 when the body is missing fields', async () => {
    const res = await request(app).post('/conversions/job').send({});

    expect(res.status).toBe(400);
  });

  it('responds 400 for an unsupported output format', async () => {
    const res = await request(app)
      .post('/conversions/job')
      .send({ inputFileId: new ObjectId().toHexString(), outputFormat: 'exe' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("'exe' is not supported");
    expect(createJob).not.toHaveBeenCalled();
  });

  it('passes through a 400 from createJob (e.g. file not owned by the user)', async () => {
    const { AppError } = await import('@/errors.js');
    createJob.mockRejectedValue(new AppError(400, 'Input file does not exist'));

    const res = await request(app)
      .post('/conversions/job')
      .send({ inputFileId: new ObjectId().toHexString(), outputFormat: 'mp4' });

    expect(res.status).toBe(400);
    expect(conversionQueue.add).not.toHaveBeenCalled();
  });

  it('creates the job, enqueues it and responds 201', async () => {
    const inputFileId = new ObjectId();
    const job: Job = {
      _id: new ObjectId(),
      userId: 'user-1',
      inputFileId,
      inputFormat: 'mov',
      outputFormat: 'mp4',
      progress: 0,
      status: JobStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    createJob.mockResolvedValue(job);

    const res = await request(app)
      .post('/conversions/job')
      .send({ inputFileId: inputFileId.toHexString(), outputFormat: 'MP4' });

    expect(res.status).toBe(201);
    expect(res.body._id).toBe(job._id.toHexString());
    expect(createJob).toHaveBeenCalledWith('user-1', inputFileId, 'MP4');
    expect(conversionQueue.add).toHaveBeenCalledWith(
      'convert',
      { jobId: job._id.toString() },
      expect.objectContaining({ jobId: job._id.toString(), attempts: 3 }),
    );
  });

  it('responds 401 when there is no authenticated user', async () => {
    const anonApp = buildTestApp('/conversions', conversionsRouter, null);

    const res = await request(anonApp)
      .post('/conversions/job')
      .send({ inputFileId: new ObjectId().toHexString(), outputFormat: 'mp4' });

    expect(res.status).toBe(401);
  });
});

describe('GET /conversions/job', () => {
  it('applies pagination and returns the page with total', async () => {
    const getUserJobs = vi
      .spyOn(ConversionService, 'getUserJobs')
      .mockResolvedValue({ jobs: [], total: 7 });

    const res = await request(app).get('/conversions/job?limit=500&offset=5');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ jobs: [], limit: 50, offset: 5, total: 7 });
    expect(getUserJobs).toHaveBeenCalledWith('user-1', 50, 5);
  });
});
