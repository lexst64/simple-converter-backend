import { Router, Response, Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const router = Router();
const MAX_FILE_SIZE = 1073741824;
const uploadsDir = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, _file, cb) => cb(null, randomUUID()),
});

const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });

router.post('/', (req: Request, res: Response) => {
  // TODO: multer writes the file to the disk until it realizes that it is over MAX_FILE_SIZE
  // after which it deletes the file. Need to look at "content-length" header.
  upload.single('file')(req, res, (err: any) => {
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

    // TODO: save file's meta to the database and link it to the user

    return res.status(201).json({
      id: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    });
  });
});

router.get('/:fileId', (req: Request, res: Response) => {
  return res.json({ id: req.params.fileId });
});

export default router;
