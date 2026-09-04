import type { ApiClient, ListOptions, RequestOptions } from "../core/client.js";
import { MotifuseError } from "../core/errors.js";
import type {
  FileDownload,
  FileUploadOptions,
  MotifuseFile,
  MotifuseJob,
  Page,
  ReconovaCleanInput,
  ReconovaFileInput,
} from "../types.js";
import { paginate } from "./pagination.js";

function idempotency(options: RequestOptions = {}): RequestOptions {
  return { ...options, idempotencyKey: options.idempotencyKey ?? `sdk_${crypto.randomUUID()}` };
}

export class ReconovaFilesResource {
  constructor(private readonly client: ApiClient) {}

  list(options: ListOptions = {}): Promise<Page<MotifuseFile>> {
    return this.client.request("GET", "reconova/files", {
      ...options,
      query: { limit: options.limit, cursor: options.cursor },
    });
  }

  listAll(options: ListOptions = {}): AsyncGenerator<MotifuseFile, void, undefined> {
    return paginate((cursor) => this.list({ ...options, cursor }));
  }

  createUpload(input: ReconovaFileInput, options: RequestOptions = {}): Promise<MotifuseFile> {
    return this.client.request("POST", "reconova/files", {
      ...idempotency(options),
      body: input,
    });
  }

  retrieve(fileId: string, options: RequestOptions = {}): Promise<MotifuseFile> {
    return this.client.request("GET", `reconova/files/${encodeURIComponent(fileId)}`, options);
  }

  complete(fileId: string, options: RequestOptions = {}): Promise<MotifuseFile> {
    return this.client.request("POST", `reconova/files/${encodeURIComponent(fileId)}/complete`, {
      ...idempotency(options),
    });
  }

  download(fileId: string, options: RequestOptions = {}): Promise<FileDownload> {
    return this.client.request(
      "POST",
      `reconova/files/${encodeURIComponent(fileId)}/download`,
      options,
    );
  }

  async upload(
    input: ReconovaFileInput,
    uploadOptions: FileUploadOptions,
    requestOptions: RequestOptions = {},
  ): Promise<MotifuseFile> {
    const signal = uploadOptions.signal ?? requestOptions.signal;
    const idempotencyKey = uploadOptions.idempotencyKey ?? `sdk_${crypto.randomUUID()}`;
    const file = await this.createUpload(input, { ...requestOptions, signal, idempotencyKey });
    if (!file.upload?.url) {
      throw new MotifuseError("The API did not return an upload authorization.", {
        code: "upload_authorization_missing",
      });
    }
    await this.client.upload(
      file.upload.url,
      {
        method: file.upload.method,
        headers: file.upload.headers,
        body: uploadOptions.body as BodyInit,
      },
      signal,
    );
    return this.complete(file.id, {
      ...requestOptions,
      signal,
      idempotencyKey: `${idempotencyKey}_complete`,
    });
  }
}

export class ReconovaJobsResource {
  constructor(private readonly client: ApiClient) {}

  list(options: ListOptions = {}): Promise<Page<MotifuseJob>> {
    return this.client.request("GET", "reconova/jobs", {
      ...options,
      query: { limit: options.limit, cursor: options.cursor },
    });
  }

  listAll(options: ListOptions = {}): AsyncGenerator<MotifuseJob, void, undefined> {
    return paginate((cursor) => this.list({ ...options, cursor }));
  }

  retrieve(jobId: string, options: RequestOptions = {}): Promise<MotifuseJob> {
    return this.client.request("GET", `reconova/jobs/${encodeURIComponent(jobId)}`, options);
  }

  cancel(jobId: string, options: RequestOptions = {}): Promise<MotifuseJob> {
    return this.client.request(
      "POST",
      `reconova/jobs/${encodeURIComponent(jobId)}/cancel`,
      options,
    );
  }
}

export class ReconovaOperationsResource {
  constructor(private readonly client: ApiClient) {}

  clean(input: ReconovaCleanInput, options: RequestOptions = {}): Promise<MotifuseJob> {
    return this.client.request("POST", "reconova/operations/clean", {
      ...idempotency(options),
      body: input,
    });
  }
}

export class ReconovaResource {
  readonly files: ReconovaFilesResource;
  readonly jobs: ReconovaJobsResource;
  readonly operations: ReconovaOperationsResource;

  constructor(client: ApiClient) {
    this.files = new ReconovaFilesResource(client);
    this.jobs = new ReconovaJobsResource(client);
    this.operations = new ReconovaOperationsResource(client);
  }
}
