import { ObjectId } from 'mongodb';

export interface User {
  _id: string; // googleId
  email: string;
  name: string;
  picture: string;
  createdAt: Date;
}

export interface UserPayload {
  googleId: string;
  email: string;
  name: string;
}

export interface UserFile {
  _id: string;
  userId: string;
  type: 'upload' | 'output';
  originalName?: string;
  mimeType?: string;
  size: number;
  createdAt: Date;
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface Job {
  _id: ObjectId;
  userId: string;
  inputFileId: string;
  outputFormat: string;
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  outputFileId?: string;
}

export interface JobRequest {
  inputFileId: string;
  outputFormat: string;
}

export interface FileUploadResponse {
  id: string;
  userId: string;
  type: 'upload' | 'output';
  originalName?: string;
  mimeType?: string;
  size: number;
  createdAt: Date;
}

export interface FileResponse {
  id: string;
}

export interface JobStatusResponse {
  id: string;
  status: JobStatus;
  errorMessage?: string;
  outputFileId?: string;
  completedAt?: Date;
}
