export interface RateLimitMetadata {
  limit?: number | undefined;
  remaining?: number | undefined;
  resetAfterSeconds?: number | undefined;
}

export interface ResponseMetadata {
  requestId?: string | undefined;
  status: number;
  rateLimit: RateLimitMetadata;
  retryAfter?: number | undefined;
  idempotentReplay: boolean;
}

const metadata = new WeakMap<object, ResponseMetadata>();

export function attachResponseMetadata<T>(value: T, responseMetadata: ResponseMetadata): T {
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
    metadata.set(value, responseMetadata);
  }
  return value;
}

export function getResponseMetadata(value: object): ResponseMetadata | undefined {
  return metadata.get(value);
}
