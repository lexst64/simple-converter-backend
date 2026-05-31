import { Router, Response, Request } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { getFilenameExt } from '../utils';
import { FilesService, UPLOADS_DIR } from '../services/files.service';
import { ConversionService } from '../services/conversion.service';
import { FileResponse, FileUploadResponse } from '../types';

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

    const filenameExt = getFilenameExt(file.originalname);

    if (filenameExt === '') {
      FilesService.removeUpload(file.filename); 
      return res.status(400).json({ message: 'File should have an extension' })
    }
    if (!ConversionService.isFormatSupported(filenameExt)) {
      FilesService.removeUpload(file.filename); 
      return res.status(400).json({ message: 'File format is not supported' })
    }

    // TODO: save file's meta to the database and link it to the user

    const response: FileUploadResponse = {
      id: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };

    return res.status(201).json(response);
  });
});

router.get('/:fileId', (req: Request, res: Response) => {
  const fileId = typeof req.params.fileId === 'string' ? req.params.fileId : req.params.fileId[0];
  const response: FileResponse = { id: fileId };
  return res.json(response);
});

export default router;
