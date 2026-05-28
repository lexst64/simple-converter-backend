export interface UserPayload {
  googleId: string;
  email: string;
  name: string;
}

export enum ConversionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface ConversionJob {
  id: string;
  userId: string;
  inputFileId: string;
  outputFormat: string;
  status: ConversionStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  outputFileId?: string;
}

export interface ConversionJobRequest {
  inputFileId: string;
  outputFormat: string;
}
