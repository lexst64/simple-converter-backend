import path from 'path';
import fs from 'fs';
import { db } from '@/db.js';
import { UserFile } from '@/types.js';
import { ObjectId } from 'mongodb';

const storageRoot = ['prod', 'production'].includes(process.env.NODE_ENV || '')
  ? '/var/tmp'
  : process.cwd();

/**
 * Path to the directory where uploaded source files are stored
 */
export const UPLOADS_DIR = path.join(storageRoot, '_uploads');

/**
 * Path to the directory where converted output files are stored
 */
export const OUTPUTS_DIR = path.join(storageRoot, '_outputs');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

if (!fs.existsSync(OUTPUTS_DIR)) {
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
}

/**
 * Metadata info for registering a file
 */
interface FileInfo {
  fileName: string;
  userId: string;
  originalFileName: string;
  mimeType?: string;
  size: number;
}

/**
 * Service to manage uploading, registering, and deleting files
 */
export class FileService {
  /**
   * Registers a user upload in the files collection
   */
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

  /**
   * Registers a conversion output in the files collection
   */
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

  /**
   * Deletes a file from both the database and the specified directory
   */
  private static async removeFile(param: string | ObjectId, directory: string): Promise<void> {
    const files = db.collection<UserFile>('files');
    let file: UserFile | null = null;
    let fileName: string | undefined;

    if (param instanceof ObjectId) {
      file = await files.findOne({ _id: param });
      fileName = file?.fileName;
    } else {
      fileName = param;
      file = await files.findOne({ fileName });
    }

    if (!file) {
      // If no db record, still try to delete from filesystem if it exists
      if (fileName) {
        const filePath = path.join(directory, fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      return;
    }

    const oldDeletedAt = file.deletedAt;
    const res = await files.deleteOne({ _id: file._id });

    if (res.deletedCount === 1) {
      const filePath = path.join(directory, file.fileName);
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

  /**
   * Deletes an upload file by its filename or database ID
   */
  static async removeUpload(fileName: string): Promise<void>;
  static async removeUpload(fileId: ObjectId): Promise<void>;
  static async removeUpload(param: string | ObjectId): Promise<void> {
    return this.removeFile(param, UPLOADS_DIR);
  }

  /**
   * Deletes an output file by its filename or database ID
   */
  static async removeOutput(fileName: string): Promise<void>;
  static async removeOutput(fileId: ObjectId): Promise<void>;
  static async removeOutput(param: string | ObjectId): Promise<void> {
    return this.removeFile(param, OUTPUTS_DIR);
  }

  /**
   * Retrieves a file by its ID, validating ownership by the user ID
   */
  static async getUserFile(userId: string, fileId: ObjectId): Promise<UserFile | undefined> {
    const files = db.collection<UserFile>('files');
    const userFile = await files.findOne({ _id: fileId, userId });
    if (!userFile) return undefined;
    return userFile;
  }
}
