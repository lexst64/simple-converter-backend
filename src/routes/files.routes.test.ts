import { ObjectId } from 'mongodb';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import filesRouter from '@/routes/files.routes.js';
import { FileService } from '@/services/file.service.js';
import { S3Service } from '@/services/s3.service.js';
import { buildTestApp } from '@/test/app.js';
import { UserFile } from '@/types.js';

vi.mock('@/db.js', () => ({ db: { collection: vi.fn() } }));
vi.mock('@/services/s3.service.js', () => ({
  S3Service: {
    generateUploadPresignedUrl: vi.fn(),
    generateDownloadPresignedUrl: vi.fn(),
  },
}));
vi.mock('@/services/file.service.js', () => ({
  UPLOADS_DIR: '/nonexistent/_uploads',
  OUTPUTS_DIR: '/nonexistent/_outputs',
  FileService: {
    registerUpload: vi.fn(),
    getUserFile: vi.fn(),
  },
}));

const app = buildTestApp('/files', filesRouter);

function makeFile(overrides: Partial<UserFile> = {}): UserFile {
  return {
    _id: new ObjectId(),
    userId: 'user-1',
    fileName: '5f0c-uuid.mov',
    originalFileName: 'holiday.mov',
    type: 'upload',
    size: 1234,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('GET /files/:fileId and /files/:fileId/details', () => {
  describe.each(['', '/details'])('GET /files/:fileId%s', (suffix) => {
    // Regression: malformed ids used to throw inside `new ObjectId()` and produce a 500.
    it.each(['not-an-id', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz'])(
      'responds 400 for malformed id %j',
      async (id) => {
        const res = await request(app).get(`/files/${id}${suffix}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invalid ID format');
        expect(FileService.getUserFile).not.toHaveBeenCalled();
      },
    );

    it('responds 404 when the file is not found for the user', async () => {
      vi.mocked(FileService.getUserFile).mockResolvedValue(undefined);
      const id = new ObjectId();

      const res = await request(app).get(`/files/${id.toHexString()}${suffix}`);

      expect(res.status).toBe(404);
      expect(FileService.getUserFile).toHaveBeenCalledWith('user-1', id);
    });
  });

  it('returns a presigned download url named after the original file', async () => {
    const file = makeFile();
    vi.mocked(FileService.getUserFile).mockResolvedValue(file);
    vi.mocked(S3Service.generateDownloadPresignedUrl).mockResolvedValue('https://s3/download');

    const res = await request(app).get(`/files/${file._id.toHexString()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: 'https://s3/download' });
    expect(S3Service.generateDownloadPresignedUrl).toHaveBeenCalledWith(
      file._id.toHexString(),
      'holiday.mov',
    );
  });

  it('returns file details', async () => {
    const file = makeFile();
    vi.mocked(FileService.getUserFile).mockResolvedValue(file);

    const res = await request(app).get(`/files/${file._id.toHexString()}/details`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: file._id.toHexString(),
      fileName: file.fileName,
      originalFileName: 'holiday.mov',
    });
  });
});

describe('POST /files/upload-request', () => {
  const validBody = { fileName: 'holiday.mov', contentType: 'video/quicktime', size: 1234 };

  // Regression: the route used to `return` the AppError instead of throwing it, so the
  // request never got a response and hung until the client timed out.
  it('responds 500 (instead of hanging) when registerUpload returns undefined', async () => {
    vi.mocked(FileService.registerUpload).mockResolvedValue(undefined);

    const res = await request(app)
      .post('/files/upload-request')
      .send(validBody)
      .timeout({ response: 2000, deadline: 3000 });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ status: 'error', code: 500 });
    expect(S3Service.generateUploadPresignedUrl).not.toHaveBeenCalled();
  });

  it('responds 400 when the file name has no extension', async () => {
    const res = await request(app)
      .post('/files/upload-request')
      .send({ ...validBody, fileName: 'holiday' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('File should have an extension');
    expect(FileService.registerUpload).not.toHaveBeenCalled();
  });

  it('responds 400 for an unsupported file format', async () => {
    const res = await request(app)
      .post('/files/upload-request')
      .send({ ...validBody, fileName: 'malware.exe' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('File format is not supported');
    expect(FileService.registerUpload).not.toHaveBeenCalled();
  });

  it.each([
    ['missing size', { fileName: 'a.mp4', contentType: 'video/mp4' }],
    ['zero size', { fileName: 'a.mp4', contentType: 'video/mp4', size: 0 }],
    ['size over 1GiB', { fileName: 'a.mp4', contentType: 'video/mp4', size: 1073741825 }],
  ])('responds 400 for an invalid body (%s)', async (_label, body) => {
    const res = await request(app).post('/files/upload-request').send(body);

    expect(res.status).toBe(400);
    expect(FileService.registerUpload).not.toHaveBeenCalled();
  });

  it('registers the upload and responds 201 with a presigned url', async () => {
    const file = makeFile();
    vi.mocked(FileService.registerUpload).mockResolvedValue(file);
    vi.mocked(S3Service.generateUploadPresignedUrl).mockResolvedValue('https://s3/upload');

    const res = await request(app).post('/files/upload-request').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: file._id.toHexString(), url: 'https://s3/upload' });
    expect(FileService.registerUpload).toHaveBeenCalledWith({
      fileName: expect.stringMatching(/^[0-9a-f-]{36}\.mov$/),
      originalFileName: 'holiday.mov',
      size: 1234,
      userId: 'user-1',
    });
    expect(S3Service.generateUploadPresignedUrl).toHaveBeenCalledWith(
      file._id.toHexString(),
      'video/quicktime',
      1234,
    );
  });
});
