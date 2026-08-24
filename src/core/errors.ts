export interface MotifuseProblem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  request_id?: string;
  required_scope?: string | null;
  details?: unknown;
}

export interface MotifuseErrorOptions {
  status?: number | undefined;
  code?: string | undefined;
  requestId?: string | undefined;
  type?: string | undefined;
  details?: unknown;
  retryAfter?: number | undefined;
  cause?: unknown;
}

export class MotifuseError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  readonly type: string | undefined;
  readonly details: unknown;
  readonly retryAfter: number | undefined;

  constructor(message: string, options: MotifuseErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "MotifuseError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.type = options.type;
    this.details = options.details;
    this.retryAfter = options.retryAfter;
  }
}

export class MotifuseJobError extends MotifuseError {
  readonly jobId: string;
  readonly jobStatus: "failed" | "cancelled";

  constructor(jobId: string, status: "failed" | "cancelled", message: string, code?: string) {
    super(message, { code });
    this.name = "MotifuseJobError";
    this.jobId = jobId;
    this.jobStatus = status;
  }
}

export class MotifuseWebhookVerificationError extends MotifuseError {
  constructor(message: string) {
    super(message, { code: "webhook_signature_invalid" });
    this.name = "MotifuseWebhookVerificationError";
  }
}
