# Motifuse TypeScript SDK

Official TypeScript SDK for the Motifuse API.

**DocForge · Reconova · SpecTrace**

[![CI](https://github.com/SyntaxArchitect/motifuse-sdk-typescript/actions/workflows/ci.yml/badge.svg)](https://github.com/SyntaxArchitect/motifuse-sdk-typescript/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6.svg)](https://www.typescriptlang.org/)

> Release status: npm `latest` was `1.0.0-beta.2` and `beta` was `1.0.0-beta.3` when verified on 2026-09-04. Local unreleased changes are listed in CHANGELOG.md. The official GitHub release
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

Start with a safe read for your entitled product: `docforge.templates.list({ limit: 1 })`,
`reconova.files.list({ limit: 1 })`, or `spectrace.projects.list({ limit: 1 })`.
An empty page is successful. Reconova and SpecTrace require live keys; DocForge test evaluation
shares published template definitions while separating jobs, outputs and usage.

[Complete runnable workflows](./examples/README.md) create their own upload IDs and poll actual
returned jobs. DocForge requires your real published template and matching rows; it cannot publish
templates through an invented endpoint. SpecTrace uploads both versions and waits for
`available && comparison_eligible` before comparing. Reconova intake does not automatically clean data.

## Files

Reconova and SpecTrace use direct signed uploads. Their `files.upload` helpers perform the real
three-step flow: request authorization, upload bytes directly to the short-lived destination, and
complete the file. The SDK sends the bytes directly to signed storage; the Motifuse application server is not an
extra upload proxy hop. Pass a `Blob`, `Uint8Array`, `ArrayBuffer`, or compatible streaming `BodyInit`.

## Request logs

The local candidate adds `motifuse.logs.list({ limit: 20 })` and `logs.listAll()` for the implemented
`GET /logs` route. Requires `logs:read` plus a currently entitled product permission. Results remain
workspace/environment/product filtered and contain metadata, not API payloads. This addition is
not part of an already-published SDK release.

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
