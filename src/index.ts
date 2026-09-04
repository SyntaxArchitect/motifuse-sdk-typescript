import { ApiClient, type MotifuseOptions } from "./core/client.js";
import { DocForgeResource } from "./resources/docforge.js";
import { JobsResource } from "./resources/jobs.js";
import { LogsResource } from "./resources/logs.js";
import { ReconovaResource } from "./resources/reconova.js";
import { SpectraceResource } from "./resources/spectrace.js";
import { UsageResource } from "./resources/usage.js";
import { WebhooksResource } from "./resources/webhooks.js";

export class Motifuse {
  readonly docforge: DocForgeResource;
  readonly reconova: ReconovaResource;
  readonly spectrace: SpectraceResource;
  readonly jobs: JobsResource;
  readonly logs: LogsResource;
  readonly webhooks: WebhooksResource;
  readonly usage: UsageResource;

  constructor(options: MotifuseOptions) {
    const client = new ApiClient(options);
    this.docforge = new DocForgeResource(client);
    this.reconova = new ReconovaResource(client);
    this.spectrace = new SpectraceResource(client);
    this.jobs = new JobsResource(client);
    this.logs = new LogsResource(client);
    this.webhooks = new WebhooksResource(client);
    this.usage = new UsageResource(client);
  }
}

export {
  DEFAULT_BASE_URL,
  SDK_VERSION,
  type FetchImplementation,
  type ListOptions,
  type MotifuseOptions,
  type RequestOptions,
} from "./core/client.js";
export {
  MotifuseError,
  MotifuseJobError,
  MotifuseWebhookVerificationError,
} from "./core/errors.js";
export {
  getResponseMetadata,
  type RateLimitMetadata,
  type ResponseMetadata,
} from "./core/metadata.js";
export {
  verifyWebhook,
  type ReplayedWebhookDelivery,
  type VerifyWebhookInput,
} from "./resources/webhooks.js";
export type { JobReference, WaitForJobOptions } from "./resources/jobs.js";
export type { SpectraceExport } from "./resources/spectrace.js";
export type * from "./types.js";
