# Motifuse TypeScript SDK

Official TypeScript SDK for the Motifuse API.

**DocForge · Reconova · Spectrace**

[![CI](https://github.com/SyntaxArchitect/motifuse-sdk-typescript/actions/workflows/ci.yml/badge.svg)](https://github.com/SyntaxArchitect/motifuse-sdk-typescript/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6.svg)](https://www.typescriptlang.org/)

> Release status: `1.0.0-beta.2` is published publicly on npm. The official GitHub release
> workflow is authorized as an npm Trusted Publisher and uses short-lived OIDC credentials for
> subsequent releases.

## Installation

Install the current public beta:

```bash
npm install @motifuse/sdk
```

Use `npm install @motifuse/sdk@beta` when you want to follow the prerelease channel explicitly.
The package targets Node.js 20 or newer and uses native `fetch`. It is ESM-first and has zero
runtime dependencies.

## Quickstart

```ts
import { Motifuse } from "@motifuse/sdk";

const motifuse = new Motifuse({
  apiKey: process.env.MOTIFUSE_API_KEY!,
});

const projects = await motifuse.spectrace.projects.list({ limit: 20 });
console.log(projects.data);
```

Motifuse API keys are server-side secrets. Never put them in browser JavaScript, mobile bundles,
public repositories, logs, or analytics. The SDK refuses construction in a browser environment.

## Products

### DocForge

```ts
const generation = await motifuse.docforge.generations.create(
  {
    template_id: "tpl_example",
    rows: [{ customer_name: "Example Industries" }],
    output_format: "pdf",
  },
  { idempotencyKey: "invoice-batch-2026-08-24" },
);

const completed = await motifuse.jobs.wait(generation);
const download = await motifuse.docforge.generations.download(completed.id);
```

### Reconova

```ts
const file = await motifuse.reconova.files.upload(
  { filename: "quality.csv", size: bytes.byteLength, content_type: "text/csv" },
  { body: bytes, idempotencyKey: "quality-upload-2026-08-24" },
);

const profile = file.job ? await motifuse.jobs.wait(file.job) : undefined;
const cleaned = await motifuse.reconova.operations.clean({ source_asset_id: file.id });
```

### Spectrace

```ts
const project = await motifuse.spectrace.projects.create({
  name: "Supplier contract review",
});

const comparison = await motifuse.spectrace.comparisons.create(project.id, {
  baseline_version_id: "stv_baseline_example",
  revised_version_id: "stv_revised_example",
});

if (comparison.job) await motifuse.jobs.wait(comparison.job);

for await (const finding of motifuse.spectrace.findings.listAll({
  comparisonId: comparison.id,
  limit: 50,
})) {
  console.log(finding.id, finding.primary_change_type);
}
```

## Files

Reconova and Spectrace use direct signed uploads. Their `files.upload` helpers perform the real
three-step flow: request authorization, upload bytes directly to the short-lived destination, and
complete the file. Document bytes never pass through the SDK or Motifuse application server as an
extra proxy hop. Pass a `Blob`, `Uint8Array`, `ArrayBuffer`, or compatible streaming `BodyInit`.

## Async jobs

Use product-specific `retrieve` methods or the shared helper:

```ts
const job = await motifuse.jobs.retrieve("spectrace", "spj_example");
const completed = await motifuse.jobs.wait(job, {
  waitTimeout: 10 * 60_000,
  signal: abortController.signal,
});
```

Polling backs off to a bounded interval and stops on `succeeded`, `failed`, or `cancelled`.
`MotifuseJobError` exposes the job ID, terminal status, and safe processing code.

## Pagination

Every list keeps normal page access. `listAll` returns an async iterator and requests one bounded
page at a time; it never accumulates an unbounded collection in memory.

## Errors and request metadata

```ts
import { MotifuseError, getResponseMetadata } from "@motifuse/sdk";

try {
  const project = await motifuse.spectrace.projects.retrieve("spj_example");
  console.log(getResponseMetadata(project)?.requestId);
} catch (error) {
  if (error instanceof MotifuseError) {
    console.error(error.code, error.status, error.requestId, error.retryAfter);
  }
}
```

`MotifuseError` preserves RFC 9457 problem type, API code, status, request ID, details, and
`Retry-After`. Successful object responses can be inspected with `getResponseMetadata` for request
and rate-limit information without changing normal resource shapes.

## Retries and idempotency

The SDK retries network failures, `408`, `429`, and selected `5xx` responses with exponential
backoff, jitter, and `Retry-After`. GET/HEAD requests are safe to retry. Mutations are retried only
when they carry `Idempotency-Key`.

SDK methods for API-declared idempotent operations generate one key per logical call. Supply your
own stable key when a process restart must repeat the same operation. Motifuse retains keys for 24
hours, replays equivalent requests, and returns `409 idempotency_conflict` if the method, path, or
body changes.

## Webhooks

Verify the exact, unmodified raw request body before parsing it:

```ts
const rawBody = await request.text();
const event = motifuse.webhooks.verify({
  payload: rawBody,
  signature: request.headers.get("motifuse-signature")!,
  secret: process.env.MOTIFUSE_WEBHOOK_SECRET!,
});
```

Verification uses HMAC-SHA256 over `timestamp + "." + raw_body`, constant-time comparison, and a
five-minute default tolerance. The returned `WebhookEvent` type is generated from the actual event
catalog in Motifuse OpenAPI.

## Configuration

```ts
new Motifuse({
  apiKey: process.env.MOTIFUSE_API_KEY!,
  timeout: 30_000,
  maxRetries: 2,
  baseUrl: "https://motifuse.com/api/v1",
  fetch: globalThis.fetch,
  headers: { "X-Integration-Name": "billing-worker" },
});
```

Custom base URLs must use HTTPS, except localhost for testing. Per-request options support timeout,
`AbortSignal`, safe additional headers, and explicit idempotency keys. The SDK sends
`motifuse-typescript/<version>` client identification and no personal telemetry.

## OpenAPI synchronization

`openapi/motifuse.openapi.json` is a snapshot of the canonical public contract. Generated models
live in `src/generated` and must never be edited manually.

```bash
npm run openapi:generate
npm run openapi:check
npm run openapi:upstream
```

CI fails if generated declarations drift from the committed contract. A scheduled upstream check
also compares the snapshot with `https://motifuse.com/openapi.json`.

## Examples and API reference

- [Tested examples](./examples)
- [Developer documentation](https://motifuse.com/developers)
- [Interactive API reference](https://motifuse.com/developers/api-reference)
- [OpenAPI JSON](https://motifuse.com/openapi.json)
- [OpenAPI YAML](https://motifuse.com/openapi.yaml)
- [API changelog](https://motifuse.com/developers/changelog)
- [SDK changelog](./CHANGELOG.md)

The SDK is a convenience layer over the canonical REST API. Developers may use REST, OpenAPI, or
the SDK independently.

## Contributing, security, and license

See [CONTRIBUTING.md](./CONTRIBUTING.md). Report vulnerabilities privately as described in
[SECURITY.md](./SECURITY.md); never include keys or customer documents in a public issue.

Licensed under the [MIT License](./LICENSE).
