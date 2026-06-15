import { Router, Response, Request, NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { getFilenameExt } from '@/utils.js';
import { FileService, OUTPUTS_DIR, UPLOADS_DIR } from '@/services/file.service.js';
import { ConversionService } from '@/services/conversion.service.js';
import { FileUploadResponse } from '@/types.js';
import { AppError } from '@/errors.js';
import path from 'path';
import fs from 'fs';
import { ObjectId } from 'mongodb';

const router = Router();
const MAX_FILE_SIZE = 1073741824;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, _file, cb) => cb(null, `${randomUUID()}.${getFilenameExt(_file.originalname)}`),
});

const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });

router.post('/', (req: Request, res: Response) => {
  // TODO: multer writes the file to the disk until it realizes that it is over MAX_FILE_SIZE
  // after which it deletes the file. Need to look at "content-length" header.
  upload.single('file')(req, res, async (err: any) => {
    if (err) {
      // multer reports a file-too-large error with code "LIMIT_FILE_SIZE"
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res
          .status(413)
          .json({ message: `File too large. Max size is ${MAX_FILE_SIZE} bytes` });
      }
      return res.status(400).json({ message: err.message || 'Upload error' });
    }

    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const userId = req.loggedInUser?.googleId;
    if (!userId) {
      await FileService.removeUpload(file.filename);
      throw new AppError(401, 'User not authenticated');
    }

    const userFile = await FileService.registerUpload({
      fileName: file.filename,
      mimeType: file.mimetype,
      originalFileName: file.originalname,
      size: file.size,
      userId: userId,
    });

    if (!userFile) {
      // file database registration failed, abort
      await FileService.removeUpload(file.filename);
      return res.status(500).json({ message: 'File upload failed' });
    }

    const filenameExt = getFilenameExt(file.originalname);

    if (filenameExt === '') {
      await FileService.removeUpload(file.filename);
      return res.status(400).json({ message: 'File should have an extension' });
    }
    if (!ConversionService.isFormatSupported(filenameExt)) {
      await FileService.removeUpload(file.filename);
      return res.status(400).json({ message: 'File format is not supported' });
    }

    const response: FileUploadResponse = {
      id: userFile._id.toString(),
      ...userFile,
    };

    return res.status(201).json(response);
  });
});

router.get('/:fileId', async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.loggedInUser?.googleId;
  if (!userId) {
    throw new AppError(401, 'User not authenticated');
  }

  const fileId = typeof req.params.fileId === 'string' ? req.params.fileId : req.params.fileId[0];

  const userFile = await FileService.getUserFile(userId, ObjectId.createFromHexString(fileId));

  if (!userFile) {
    throw new AppError(404, `File with ID '${fileId}' not found`);
  }

  let filePath = path.join(OUTPUTS_DIR, userFile.fileName);

  if (!fs.existsSync(filePath)) {
    throw new AppError(404, `File with ID '${fileId}' not found`);
  }

  return res.download(filePath);
});

router.get('/:fileId/details', async (req, res) => {
  const userId = req.loggedInUser?.googleId;
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
