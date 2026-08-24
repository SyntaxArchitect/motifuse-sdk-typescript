import type { ApiClient, ListOptions, RequestOptions } from "../core/client.js";
import { MotifuseError } from "../core/errors.js";
import type {
  FileUploadOptions,
  FindingListInput,
  MotifuseFile,
  MotifuseJob,
  Page,
  SpectraceComparison,
  SpectraceComparisonInput,
  SpectraceFileInput,
  SpectraceFinding,
  SpectraceFindingReviewInput,
  SpectraceProject,
  SpectraceProjectInput,
} from "../types.js";
import { paginate } from "./pagination.js";

function idempotency(options: RequestOptions = {}): RequestOptions {
  return { ...options, idempotencyKey: options.idempotencyKey ?? `sdk_${crypto.randomUUID()}` };
}

export interface SpectraceExport {
  contentType: string;
  filename?: string | undefined;
  data: string | object;
}

export class SpectraceProjectsResource {
  constructor(private readonly client: ApiClient) {}

  list(options: ListOptions = {}): Promise<Page<SpectraceProject>> {
    return this.client.request("GET", "spectrace/projects", {
      ...options,
      query: { limit: options.limit, cursor: options.cursor },
    });
  }

  listAll(options: ListOptions = {}): AsyncGenerator<SpectraceProject, void, undefined> {
    return paginate((cursor) => this.list({ ...options, cursor }));
  }

  create(input: SpectraceProjectInput, options: RequestOptions = {}): Promise<SpectraceProject> {
    return this.client.request("POST", "spectrace/projects", {
      ...idempotency(options),
      body: input,
    });
  }

  retrieve(projectId: string, options: RequestOptions = {}): Promise<SpectraceProject> {
    return this.client.request(
      "GET",
      `spectrace/projects/${encodeURIComponent(projectId)}`,
      options,
    );
  }

  update(
    projectId: string,
    input: SpectraceProjectInput,
    options: RequestOptions = {},
  ): Promise<SpectraceProject> {
    return this.client.request("PATCH", `spectrace/projects/${encodeURIComponent(projectId)}`, {
      ...options,
      body: input,
    });
  }

  delete(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<{ deleted: true; project_id: string }> {
    return this.client.request(
      "DELETE",
      `spectrace/projects/${encodeURIComponent(projectId)}`,
      options,
    );
  }
}

export class SpectraceFilesResource {
  constructor(private readonly client: ApiClient) {}

  list(projectId: string, options: ListOptions = {}): Promise<Page<MotifuseFile>> {
    return this.client.request("GET", `spectrace/projects/${encodeURIComponent(projectId)}/files`, {
      ...options,
      query: { limit: options.limit, cursor: options.cursor },
    });
  }

  listAll(
    projectId: string,
    options: ListOptions = {},
  ): AsyncGenerator<MotifuseFile, void, undefined> {
    return paginate((cursor) => this.list(projectId, { ...options, cursor }));
  }

  createUpload(
    projectId: string,
    input: SpectraceFileInput,
    options: RequestOptions = {},
  ): Promise<MotifuseFile> {
    return this.client.request(
      "POST",
      `spectrace/projects/${encodeURIComponent(projectId)}/files`,
      {
        ...idempotency(options),
        body: input,
      },
    );
  }

  retrieve(fileId: string, options: RequestOptions = {}): Promise<MotifuseFile> {
    return this.client.request("GET", `spectrace/files/${encodeURIComponent(fileId)}`, options);
  }

  complete(fileId: string, options: RequestOptions = {}): Promise<MotifuseFile> {
    return this.client.request("POST", `spectrace/files/${encodeURIComponent(fileId)}/complete`, {
      ...idempotency(options),
    });
  }

  async downloadUrl(fileId: string, options: RequestOptions = {}): Promise<string> {
    const response = await this.client.requestRaw(
      "GET",
      `spectrace/files/${encodeURIComponent(fileId)}/download`,
      { ...options, redirect: "manual" },
    );
    const location = response.headers.get("location");
    if (!location) {
      throw new MotifuseError("The API did not return a download destination.", {
        code: "download_url_missing",
        requestId: response.headers.get("x-request-id") ?? undefined,
      });
    }
    return location;
  }

  async upload(
    projectId: string,
    input: SpectraceFileInput,
    uploadOptions: FileUploadOptions,
    requestOptions: RequestOptions = {},
  ): Promise<MotifuseFile> {
    const idempotencyKey = uploadOptions.idempotencyKey ?? `sdk_${crypto.randomUUID()}`;
    const file = await this.createUpload(projectId, input, { ...requestOptions, idempotencyKey });
    if (!file.upload?.url) {
      throw new MotifuseError("The API did not return an upload authorization.", {
        code: "upload_authorization_missing",
      });
    }
    await this.client.upload(
      file.upload.url,
      { method: file.upload.method, headers: file.upload.headers, body: uploadOptions.body },
      uploadOptions.signal,
    );
    return this.complete(file.id, {
      ...requestOptions,
      signal: uploadOptions.signal,
      idempotencyKey: `${idempotencyKey}_complete`,
    });
  }
}

export class SpectraceComparisonsResource {
  constructor(private readonly client: ApiClient) {}

  list(projectId: string, options: ListOptions = {}): Promise<Page<SpectraceComparison>> {
    return this.client.request(
      "GET",
      `spectrace/projects/${encodeURIComponent(projectId)}/comparisons`,
      { ...options, query: { limit: options.limit, cursor: options.cursor } },
    );
  }

  listAll(
    projectId: string,
    options: ListOptions = {},
  ): AsyncGenerator<SpectraceComparison, void, undefined> {
    return paginate((cursor) => this.list(projectId, { ...options, cursor }));
  }

  create(
    projectId: string,
    input: SpectraceComparisonInput,
    options: RequestOptions = {},
  ): Promise<SpectraceComparison> {
    return this.client.request(
      "POST",
      `spectrace/projects/${encodeURIComponent(projectId)}/comparisons`,
      { ...idempotency(options), body: input },
    );
  }

  retrieve(comparisonId: string, options: RequestOptions = {}): Promise<SpectraceComparison> {
    return this.client.request(
      "GET",
      `spectrace/comparisons/${encodeURIComponent(comparisonId)}`,
      options,
    );
  }

  async export(
    comparisonId: string,
    format: "csv" | "json" = "csv",
    options: RequestOptions = {},
  ): Promise<SpectraceExport> {
    const response = await this.client.requestRaw(
      "GET",
      `spectrace/comparisons/${encodeURIComponent(comparisonId)}/export`,
      { ...options, query: { format } },
    );
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
    const data = contentType.includes("json")
      ? ((await response.json()) as object)
      : await response.text();
    return { contentType, ...(filename ? { filename } : {}), data };
  }
}

export class SpectraceFindingsResource {
  constructor(private readonly client: ApiClient) {}

  list(input: FindingListInput, options: RequestOptions = {}): Promise<Page<SpectraceFinding>> {
    return this.client.request(
      "GET",
      `spectrace/comparisons/${encodeURIComponent(input.comparisonId)}/findings`,
      {
        ...options,
        query: {
          limit: input.limit,
          cursor: input.cursor,
          status: input.status,
          importance: input.importance,
          change_type: input.changeType,
        },
      },
    );
  }

  listAll(
    input: FindingListInput,
    options: RequestOptions = {},
  ): AsyncGenerator<SpectraceFinding, void, undefined> {
    return paginate((cursor) => this.list({ ...input, cursor }, options));
  }

  retrieve(findingId: string, options: RequestOptions = {}): Promise<SpectraceFinding> {
    return this.client.request(
      "GET",
      `spectrace/findings/${encodeURIComponent(findingId)}`,
      options,
    );
  }

  review(
    findingId: string,
    input: SpectraceFindingReviewInput,
    options: RequestOptions = {},
  ): Promise<SpectraceFinding> {
    return this.client.request("PATCH", `spectrace/findings/${encodeURIComponent(findingId)}`, {
      ...options,
      body: input,
    });
  }
}

export class SpectraceJobsResource {
  constructor(private readonly client: ApiClient) {}

  retrieve(jobId: string, options: RequestOptions = {}): Promise<MotifuseJob> {
    return this.client.request("GET", `spectrace/jobs/${encodeURIComponent(jobId)}`, options);
  }

  cancel(jobId: string, options: RequestOptions = {}): Promise<MotifuseJob> {
    return this.client.request(
      "POST",
      `spectrace/jobs/${encodeURIComponent(jobId)}/cancel`,
      options,
    );
  }
}

export class SpectraceResource {
  readonly projects: SpectraceProjectsResource;
  readonly files: SpectraceFilesResource;
  readonly comparisons: SpectraceComparisonsResource;
  readonly findings: SpectraceFindingsResource;
  readonly jobs: SpectraceJobsResource;

  constructor(client: ApiClient) {
    this.projects = new SpectraceProjectsResource(client);
    this.files = new SpectraceFilesResource(client);
    this.comparisons = new SpectraceComparisonsResource(client);
    this.findings = new SpectraceFindingsResource(client);
    this.jobs = new SpectraceJobsResource(client);
  }
}
