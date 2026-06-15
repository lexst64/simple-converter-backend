import path from 'path';
import fs from 'fs';
import { db } from '@/db.js';
import { UserFile } from '@/types.js';
import { ObjectId } from 'mongodb';

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
  originalFileName: string;
  mimeType?: string;
  size: number;
}

export class FileService {
  static async registerUpload(fileInfo: FileInfo): Promise<UserFile | undefined> {
    const files = db.collection<UserFile>('files');
    const result = await files.insertOne({
      _id: new ObjectId(),
      userId: fileInfo.userId,
      type: 'upload',
      fileName: fileInfo.fileName,
      originalFileName: fileInfo.originalFileName,
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
      _id: new ObjectId(),
      userId: fileInfo.userId,
      type: 'output',
      fileName: fileInfo.fileName,
      originalFileName: fileInfo.originalFileName,
      size: fileInfo.size,
      createdAt: new Date(),
    });
    const userFile = await files.findOne({ _id: result.insertedId });
    if (!userFile) return undefined;
    return userFile;
  }

  static async removeUpload(fileName: string): Promise<void> {
    const files = db.collection<UserFile>('files');
    const file = await files.findOne({ fileName });
    if (!file) {
      // If no db record, still try to delete from filesystem if it exists
      const filePath = path.join(UPLOADS_DIR, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return;
    }

    const oldDeletedAt = file.deletedAt;
    const res = await files.deleteOne({ _id: file._id });

    if (res.deletedCount === 1) {
      const filePath = path.join(UPLOADS_DIR, fileName);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          // If file deletion fails, restore the previous status
          await files.updateOne({ _id: file._id }, { $set: { deletedAt: oldDeletedAt } });
          throw new Error(
            `Failed to delete file ${file.fileName} from filesystem, database status restored.`,
          );
        }
      }
    }
  }

  static async removeOutput(fileName: string): Promise<void> {
    const files = db.collection<UserFile>('files');
    const file = await files.findOne({ fileName });
    if (!file) {
      // If no db record, still try to delete from filesystem if it exists
      const filePath = path.join(OUTPUTS_DIR, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return;
    }

    const oldDeletedAt = file.deletedAt;
    const res = await files.deleteOne({ _id: file._id });

    if (res.deletedCount === 1) {
      const filePath = path.join(OUTPUTS_DIR, fileName);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          // If file deletion fails, restore the previous status
          await files.updateOne({ _id: file._id }, { $set: { deletedAt: oldDeletedAt } });
          throw new Error(
            `Failed to delete file ${file.fileName} from filesystem, database status restored.`,
          );
        }
      }
    }
  }

  static async getUserFile(userId: string, fileId: ObjectId): Promise<UserFile | undefined> {
    const files = db.collection<UserFile>('files');
    const userFile = await files.findOne({ _id: fileId, userId });
    if (!userFile) return undefined;
    return userFile;
  }
}
