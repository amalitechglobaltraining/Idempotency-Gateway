export interface PaymentRequest {
  amount: number;
  currency: string;
}

export interface PaymentResponse {
  transactionId: string;
  status: 'SUCCESS';
  message: string;
  amount: number;
  currency: string;
}

export interface ProcessingRecord {
  key: string;
  hash: string;
  status: 'PROCESSING';
  createdAt: number;
}

export interface CompletedRecord {
  key: string;
  hash: string;
  status: 'COMPLETED';
  responseStatus: number;
  responseBody: unknown;
  createdAt: number;
  completedAt: number;
  expiresAt: number;
}

export type IdempotencyRecord = ProcessingRecord | CompletedRecord;

export interface OperationResult {
  statusCode: number;
  body: unknown;
  cacheHit: boolean;
}
