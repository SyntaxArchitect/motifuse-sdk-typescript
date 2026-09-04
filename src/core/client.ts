import { sleep as wait } from "./sleep.js";
import { MotifuseError, type MotifuseProblem } from "./errors.js";
import { attachResponseMetadata, type ResponseMetadata } from "./metadata.js";

export const SDK_VERSION = "1.0.0-beta.3";
export const DEFAULT_BASE_URL = "https://motifuse.com/api/v1";

export type FetchImplementation = typeof globalThis.fetch;

export interface MotifuseOptions {
  apiKey: string;
  baseUrl?: string | undefined;
  timeout?: number | undefined;
  maxRetries?: number | undefined;
  fetch?: FetchImplementation | undefined;
  headers?: Record<string, string> | undefined;
}

export interface RequestOptions {
  signal?: AbortSignal | undefined;
  timeout?: number | undefined;
  idempotencyKey?: string | undefined;
  headers?: Record<string, string> | undefined;
}

export interface ListOptions extends RequestOptions {
  limit?: number | undefined;
  cursor?: string | undefined;
}

interface RequestInput extends RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  redirect?: RequestRedirect;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const SAFE_METHODS = new Set(["GET", "HEAD"]);

function optionalNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

function responseMetadata(response: Response): ResponseMetadata {
  const retryAfter = retryAfterSeconds(response.headers.get("retry-after"));
  return {
    requestId: response.headers.get("x-request-id") ?? undefined,
    status: response.status,
    rateLimit: {
      limit: optionalNumber(
        response.headers.get("ratelimit-limit") ?? response.headers.get("x-ratelimit-limit"),
      ),
      remaining: optionalNumber(
        response.headers.get("ratelimit-remaining") ??
          response.headers.get("x-ratelimit-remaining"),
      ),
      resetAfterSeconds: optionalNumber(response.headers.get("ratelimit-reset")),
    },
    retryAfter,
    idempotentReplay: response.headers.get("idempotent-replay") === "true",
  };
}

function joinSignal(
  signal: AbortSignal | undefined,
  timeout: number,
): {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("The request timed out.", "TimeoutError"));
  }, timeout);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
    },
    didTimeout: () => timedOut,
  };
}

function retryDelay(attempt: number, response?: Response): number {
  const serverSeconds = response
    ? retryAfterSeconds(response.headers.get("retry-after"))
    : undefined;
  if (serverSeconds !== undefined) return Math.min(serverSeconds * 1000, 60_000);
  const exponential = Math.min(500 * 2 ** attempt, 8_000);
  return Math.round(exponential * (0.75 + Math.random() * 0.5));
}

async function parseProblem(response: Response): Promise<MotifuseProblem> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return { detail: await response.text() };
  try {
    return (await response.json()) as MotifuseProblem;
  } catch {
    return { detail: response.statusText };
  }
}

export class ApiClient {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly fetch: FetchImplementation;
  private readonly apiKey: string;
  private readonly defaultHeaders: Readonly<Record<string, string>>;

  constructor(options: MotifuseOptions) {
    if (typeof window !== "undefined" && typeof window.document !== "undefined") {
      throw new MotifuseError("Secret Motifuse API keys must not be used in browser JavaScript.", {
        code: "browser_usage_forbidden",
      });
    }
    if (!options?.apiKey?.trim()) throw new TypeError("Motifuse requires a non-empty apiKey.");
    const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    const parsed = new URL(baseUrl);
    if (
      parsed.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
    ) {
      throw new TypeError("baseUrl must use HTTPS unless it targets localhost.");
    }
    const timeout = options.timeout ?? 30_000;
    if (!Number.isFinite(timeout) || timeout <= 0) throw new TypeError("timeout must be positive.");
    const maxRetries = options.maxRetries ?? 2;
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
      throw new TypeError("maxRetries must be an integer from 0 to 5.");
    }
    this.apiKey = options.apiKey.trim();
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    this.maxRetries = maxRetries;
    this.fetch = options.fetch ?? globalThis.fetch;
    if (!this.fetch) throw new TypeError("A fetch implementation is required.");
    this.defaultHeaders = Object.freeze({ ...(options.headers ?? {}) });
  }

  async request<T>(method: string, path: string, input: RequestInput = {}): Promise<T> {
    const response = await this.requestRaw(method, path, input);
    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get("content-type") ?? "";
    const value = contentType.includes("json")
      ? ((await response.json()) as T)
      : ((await response.text()) as T);
    return attachResponseMetadata(value, responseMetadata(response));
  }

  async requestRaw(methodInput: string, path: string, input: RequestInput = {}): Promise<Response> {
    const method = methodInput.toUpperCase();
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, "")}`);
    for (const [name, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
    }
    const headers = new Headers(this.defaultHeaders);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    headers.set("User-Agent", `motifuse-typescript/${SDK_VERSION}`);
    headers.set("X-Motifuse-Client", `motifuse-typescript/${SDK_VERSION}`);
    for (const [name, value] of Object.entries(input.headers ?? {})) headers.set(name, value);
    if (input.idempotencyKey) headers.set("Idempotency-Key", input.idempotencyKey);
    let body: BodyInit | undefined;
    if (input.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(input.body);
    }
    const retrySafe = SAFE_METHODS.has(method) || Boolean(input.idempotencyKey);

    for (let attempt = 0; ; attempt += 1) {
      input.signal?.throwIfAborted();
      const combined = joinSignal(input.signal, input.timeout ?? this.timeout);
      try {
        const response = await this.fetch(url, {
          method,
          headers,
          signal: combined.signal,
          ...(body === undefined ? {} : { body }),
          ...(input.redirect === undefined ? {} : { redirect: input.redirect }),
        });
        if (response.ok || response.status === 302) return response;
        if (retrySafe && attempt < this.maxRetries && RETRYABLE_STATUS.has(response.status)) {
          await response.body?.cancel();
          await wait(retryDelay(attempt, response), input.signal);
          continue;
        }
        const problem = await parseProblem(response);
        throw new MotifuseError(
          problem.detail || problem.title || `Motifuse API request failed (${response.status}).`,
          {
            status: response.status,
            code: problem.code,
            requestId: problem.request_id ?? response.headers.get("x-request-id") ?? undefined,
            type: problem.type,
            details: problem.details,
            retryAfter: retryAfterSeconds(response.headers.get("retry-after")),
          },
        );
      } catch (error) {
        if (error instanceof MotifuseError) throw error;
        if (input.signal?.aborted) throw input.signal.reason;
        if (combined.didTimeout()) {
          throw new MotifuseError(
            `Motifuse request timed out after ${input.timeout ?? this.timeout}ms.`,
            {
              code: "request_timeout",
              cause: error,
            },
          );
        }
        if (retrySafe && attempt < this.maxRetries) {
          await wait(retryDelay(attempt), input.signal);
          continue;
        }
        throw new MotifuseError("Unable to reach the Motifuse API.", {
          code: "network_error",
          cause: error,
        });
      } finally {
        combined.cleanup();
      }
    }
  }

  async upload(url: string, init: RequestInit, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const combined = joinSignal(signal, this.timeout);
    try {
      const response = await this.fetch(url, {
        ...init,
        signal: combined.signal,
        redirect: "error",
      });
      if (!response.ok) {
        throw new MotifuseError(`Direct upload failed (${response.status}).`, {
          status: response.status,
          code: "upload_failed",
          requestId: response.headers.get("x-request-id") ?? undefined,
        });
      }
    } catch (error) {
      if (error instanceof MotifuseError) throw error;
      if (signal?.aborted) throw signal.reason;
      throw new MotifuseError("Unable to upload the file to the signed destination.", {
        code: "upload_failed",
        cause: error,
      });
    } finally {
      combined.cleanup();
    }
  }
}
