/* eslint-disable prettier/prettier */
import {
  AWS_ACCESS_KEY_ID,
  AWS_REGION,
  AWS_S3_BUCKET_NAME,
  AWS_SECRET_ACCESS_KEY,
} from '@/config.js';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const s3 = new S3Client({
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
  region: AWS_REGION,
});

export class S3Service {
  static async generateUploadPresignedUrl(
    key: string,
    contentType: string,
    size: number,
    expiresIn: number = 180,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: AWS_S3_BUCKET_NAME,
      Key: key,
      ContentLength: size,
      ...(contentType && { ContentType: contentType }),
    });

    return getSignedUrl(s3, command, { expiresIn });
  }

  static async generateDownloadPresignedUrl(key: string, newFileName: string, expiresIn = 180): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: AWS_S3_BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${newFileName}"`
    });

    return getSignedUrl(s3, command, { expiresIn });
  }

  static async downloadFile(key: string, path: string): Promise<void> {
    const command = new GetObjectCommand({
      Bucket: AWS_S3_BUCKET_NAME,
      Key: key,
    });
    const response = await s3.send(command);

    if (response.Body) {
      await pipeline(response.Body as any, createWriteStream(path));
    } else {
      throw new Error('Failed to download file from S3: empty body');
    }
  }

  static async uploadFile(key: string, filePath: string, contentType?: string): Promise<void> {
    const fileStream = createReadStream(filePath);
    
    const command = new PutObjectCommand({
      Bucket: AWS_S3_BUCKET_NAME,
      Key: key,
      Body: fileStream,
      ...(contentType && { ContentType: contentType }),
    });

    await s3.send(command);
  }

  static async removeFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: AWS_S3_BUCKET_NAME,
      Key: key,
    });
    await s3.send(command);
  }
}
