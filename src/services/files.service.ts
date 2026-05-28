import path from 'path';
import fs from 'fs';

const storageRoot = process.env.NODE_ENV === 'prod' ? '/var/tmp' : process.cwd();

export const UPLOADS_DIR = path.join(storageRoot, '_uploads');
export const OUTPUTS_DIR = path.join(storageRoot, '_outputs');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

if (!fs.existsSync(OUTPUTS_DIR)) {
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
}

export class FilesService {
  static removeUpload(fileId: string) {
    const filePath = path.join(UPLOADS_DIR, fileId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  static removeOutput(fileId: string) {
    const filePath = path.join(OUTPUTS_DIR, fileId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
