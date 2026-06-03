import path from 'path';
import fs from 'fs';
import { db } from '@/index.js';
import { UserFile } from '@/types.js';

const storageRoot = process.env.NODE_ENV === 'prod' ? '/var/tmp' : process.cwd();

export const UPLOADS_DIR = path.join(storageRoot, '_uploads');
export const OUTPUTS_DIR = path.join(storageRoot, '_outputs');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

if (!fs.existsSync(OUTPUTS_DIR)) {
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
}

interface FileInfo {
  fileName: string;
  userId: string;
  originalName?: string;
  mimeType?: string;
  size: number;
}

export class FileService {
  static async registerUpload(fileInfo: FileInfo): Promise<UserFile | undefined> {
    const files = db.collection<UserFile>('files');
    const result = await files.insertOne({
      _id: fileInfo.fileName,
      userId: fileInfo.userId,
      type: 'upload',
      originalName: fileInfo.originalName,
      mimeType: fileInfo.mimeType,
      size: fileInfo.size,
      createdAt: new Date(),
    });
    const userFile = await files.findOne({ _id: result.insertedId });
    if (!userFile) return undefined;
    return userFile;
  }

  static async registerOutput(fileInfo: FileInfo): Promise<UserFile | undefined> {
    const files = db.collection<UserFile>('files');
    const result = await files.insertOne({
      _id: fileInfo.fileName,
      userId: fileInfo.userId,
      type: 'output',
      size: fileInfo.size,
      createdAt: new Date(),
    });
    const userFile = await files.findOne({ _id: result.insertedId });
    if (!userFile) return undefined;
    return userFile;
  }

  static async removeUpload(fileId: string): Promise<void> {
    const files = db.collection<UserFile>('files');
    const file = await files.findOne({ _id: fileId });
    if (!file) {
      // If no db record, still try to delete from filesystem if it exists
      const filePath = path.join(UPLOADS_DIR, fileId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return;
    }

    const res = await files.deleteOne({ _id: fileId });

    if (res.deletedCount === 1) {
      const filePath = path.join(UPLOADS_DIR, fileId);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          // If file deletion fails, re-insert the record into the database
          await files.insertOne(file);
          throw new Error(
            `Failed to delete file ${fileId} from filesystem, database record restored.`,
          );
        }
      }
    }
  }

  static async removeOutput(fileId: string): Promise<void> {
    const files = db.collection<UserFile>('files');
    const file = await files.findOne({ _id: fileId });
    if (!file) {
      // If no db record, still try to delete from filesystem if it exists
      const filePath = path.join(OUTPUTS_DIR, fileId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return;
    }

    const res = await files.deleteOne({ _id: fileId });

    if (res.deletedCount === 1) {
      const filePath = path.join(OUTPUTS_DIR, fileId);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          // If file deletion fails, re-insert the record into the database
          await files.insertOne(file);
          throw new Error(
            `Failed to delete file ${fileId} from filesystem, database record restored.`,
          );
        }
      }
    }
  }

  static async getUserFile(userId: string, fileId: string): Promise<UserFile | undefined> {
    const files = db.collection<UserFile>('files');
    const userFile = await files.findOne({ _id: fileId, userId: userId });
    if (!userFile) return undefined;
    return userFile;
  }
}
