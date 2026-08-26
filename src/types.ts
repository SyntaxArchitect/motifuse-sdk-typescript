import type { components, operations } from "./generated/schema.js";

type Schemas = components["schemas"];

export type MotifuseProblem = Schemas["Problem"];
export type MotifuseJob = Schemas["Job"];
export type MotifuseJobStatus = MotifuseJob["status"];
export type MotifuseProduct = MotifuseJob["product"];
export type MotifuseFile = Schemas["File"];
export type FileUploadAuthorization = Schemas["UploadAuthorization"];
export type FileDownload = Schemas["FileDownload"];
export type DocForgeTemplate = Schemas["DocForgeTemplate"];
export type DocForgeGenerationInput = Schemas["DocForgeGenerationRequest"];
export type DocForgeDownloadInput = Schemas["DocForgeDownloadRequest"];
export type ReconovaFileInput = Schemas["ReconovaFileRequest"];
export type ReconovaCleanInput = Schemas["ReconovaCleanRequest"];
export type SpectraceProject = Schemas["Project"];
export type SpectraceProjectInput = Schemas["SpectraceProjectRequest"];
export type SpectraceFileInput = Schemas["SpectraceFileRequest"];
export type SpectraceComparison = Schemas["Comparison"];
export type SpectraceComparisonInput = Schemas["SpectraceComparisonRequest"];
export type SpectraceFinding = Schemas["Finding"];
export type SpectraceFindingReviewInput = Schemas["FindingReviewRequest"];
export type WebhookEndpoint = Schemas["WebhookEndpoint"];
export type WebhookEndpointInput = Schemas["WebhookEndpointRequest"];
export type WebhookEndpointUpdateInput =
  operations["updateWebhookEndpoint"]["requestBody"]["content"]["application/json"];
export type WebhookDelivery = Schemas["WebhookDelivery"];
export type WebhookEvent = Schemas["WebhookEvent"];
export type WebhookEventType = WebhookEvent["type"];
export type Usage = Schemas["Usage"];
export type UsageMetric = Schemas["UsageMetric"];

export interface Page<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface PaginationInput {
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface FindingListInput extends PaginationInput {
  comparisonId: string;
  status?: string | undefined;
  importance?: string | undefined;
  changeType?: string | undefined;
}

export interface FileUploadOptions {
  /** Bytes accepted by Node's native fetch. The explicit typed-array branch
   * keeps consumers on newer TypeScript DOM declarations from losing the
   * Node Buffer/Uint8Array upload path to ArrayBufferLike variance. */
  body: BodyInit | Uint8Array<ArrayBufferLike>;
  signal?: AbortSignal | undefined;
  idempotencyKey?: string | undefined;
}
