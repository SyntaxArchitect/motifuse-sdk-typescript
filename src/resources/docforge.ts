import type { ApiClient, ListOptions, RequestOptions } from "../core/client.js";
import type {
  DocForgeDownloadInput,
  DocForgeGenerationInput,
  DocForgeTemplate,
  FileDownload,
  MotifuseJob,
  Page,
} from "../types.js";
import { paginate } from "./pagination.js";

function idempotency(options: RequestOptions = {}): RequestOptions {
  return { ...options, idempotencyKey: options.idempotencyKey ?? `sdk_${crypto.randomUUID()}` };
}

export class DocForgeTemplatesResource {
  constructor(private readonly client: ApiClient) {}

  list(options: ListOptions = {}): Promise<Page<DocForgeTemplate>> {
    return this.client.request("GET", "docforge/templates", {
      ...options,
      query: { limit: options.limit, cursor: options.cursor },
    });
  }

  listAll(options: ListOptions = {}): AsyncGenerator<DocForgeTemplate, void, undefined> {
    return paginate((cursor) => this.list({ ...options, cursor }));
  }
}

export class DocForgeGenerationsResource {
  constructor(private readonly client: ApiClient) {}

  list(options: ListOptions = {}): Promise<Page<MotifuseJob>> {
    return this.client.request("GET", "docforge/generations", {
      ...options,
      query: { limit: options.limit, cursor: options.cursor },
    });
  }

  listAll(options: ListOptions = {}): AsyncGenerator<MotifuseJob, void, undefined> {
    return paginate((cursor) => this.list({ ...options, cursor }));
  }

  create(input: DocForgeGenerationInput, options: RequestOptions = {}): Promise<MotifuseJob> {
    return this.client.request("POST", "docforge/generations", {
      ...idempotency(options),
      body: input,
    });
  }

  retrieve(generationId: string, options: RequestOptions = {}): Promise<MotifuseJob> {
    return this.client.request(
      "GET",
      `docforge/generations/${encodeURIComponent(generationId)}`,
      options,
    );
  }

  cancel(generationId: string, options: RequestOptions = {}): Promise<MotifuseJob> {
    return this.client.request(
      "POST",
      `docforge/generations/${encodeURIComponent(generationId)}/cancel`,
      options,
    );
  }

  download(
    generationId: string,
    input: DocForgeDownloadInput = { target: "archive" },
    options: RequestOptions = {},
  ): Promise<FileDownload> {
    return this.client.request(
      "POST",
      `docforge/generations/${encodeURIComponent(generationId)}/download`,
      { ...options, body: input },
    );
  }
}

export class DocForgeResource {
  readonly templates: DocForgeTemplatesResource;
  readonly generations: DocForgeGenerationsResource;

  constructor(client: ApiClient) {
    this.templates = new DocForgeTemplatesResource(client);
    this.generations = new DocForgeGenerationsResource(client);
  }
}
