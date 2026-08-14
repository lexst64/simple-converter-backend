import { Router, Response, Request } from 'express';
import { randomUUID } from 'crypto';
import { getFilenameExt } from '@/utils.js';
import { FileService } from '@/services/file.service.js';
import { ConversionService } from '@/services/conversion.service.js';
import { AppError } from '@/errors.js';
import { ObjectId } from 'mongodb';
import { S3Service } from '@/services/s3.service.js';
import z from 'zod';
import path from 'path';

const router = Router();
const MAX_FILE_SIZE = 1073741824;

const UploadRequestSchema = z.object({
  fileName: z.string(),
  contentType: z.string(),
  // limit max size
  size: z.number().min(1).max(MAX_FILE_SIZE),
});

/**
 * POST /api/v1/files/upload-request
 * Requests an upload URL to the S3 bucket
 */
router.post('/upload-request', async (req: Request, res: Response) => {
  const userId = req.user?.googleId;
  if (!userId) {
    throw new AppError(401, 'User not authenticated');
  }

  const validation = UploadRequestSchema.safeParse(req.body);
  if (!validation.success) {
    throw new AppError(400, validation.error.message);
  }

  const { fileName, contentType, size } = validation.data;

  const filenameExt = getFilenameExt(fileName);
  if (filenameExt === '') {
    throw new AppError(400, 'File should have an extension');
  }
  if (!ConversionService.isFormatSupported(filenameExt)) {
    throw new AppError(400, 'File format is not supported');
  }

  const userFile = await FileService.registerUpload({
    fileName: `${randomUUID()}.${getFilenameExt(fileName)}`,
    originalFileName: fileName,
    size: size,
    userId: userId,
  });

  if (!userFile) {
    return new AppError(500, 'File upload failed');
  }

  const presignedPutUrl = await S3Service.generateUploadPresignedUrl(
    userFile._id.toString(),
    contentType,
    size,
  );

  return res.status(201).json({ id: userFile._id.toString(), url: presignedPutUrl });
});

/**
 * GET /api/v1/files/:fileId
 * Generates file's download link from S3
 */
router.get('/:fileId', async (req: Request, res: Response) => {
  const userId = req.user?.googleId;
  if (!userId) {
    throw new AppError(401, 'User not authenticated');
  }

  const fileId = typeof req.params.fileId === 'string' ? req.params.fileId : req.params.fileId[0];

  const userFile = await FileService.getUserFile(userId, ObjectId.createFromHexString(fileId));

  if (!userFile) {
    throw new AppError(404, `File with ID '${fileId}' not found`);
  }

  const newFileName = `${path.parse(userFile.originalFileName || 'file').name}${path.extname(userFile.fileName)}`;
  const presignedGetUrl = await S3Service.generateDownloadPresignedUrl(fileId, newFileName);
  return res.status(200).json({ url: presignedGetUrl });
});

/**
 * GET /api/v1/files/:fileId/details
 * Retrieves the metadata of a registered file
 */
router.get('/:fileId/details', async (req, res) => {
  const userId = req.user?.googleId;
  if (!userId) {
    throw new AppError(401, 'User not authenticated');
  }

  const fileId = typeof req.params.fileId === 'string' ? req.params.fileId : req.params.fileId[0];

  const userFile = await FileService.getUserFile(userId, ObjectId.createFromHexString(fileId));

  if (!userFile) {
    throw new AppError(404, `File details with ID '${fileId}' not found`);
  }

  return res.json({ id: userFile._id, ...userFile });
});

export default router;
