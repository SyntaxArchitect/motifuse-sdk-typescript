# Executable API workflows

These examples are local release candidates. Tests inject synthetic HTTP responses; they do
not prove production worker availability or consume paid quota. Node.js 20+ is required.

From a repository checkout, run `npm ci`, `npm run build`, then `npm run examples:test`.
The offline tests compile and exercise the same exported functions used by the runner.
Set `MOTIFUSE_API_KEY` through your server secret store or shell; never commit it.

## First request

Set `MOTIFUSE_PRODUCT` to `reconova`, `docforge`, or `spectrace`, then run:

```bash
npm run examples:run -- quickstart
```

This lists one file, published template, or project respectively. An empty page is success.
Reconova needs `reconova:read` and `files:read`; DocForge needs `docforge:read`;
SpecTrace needs `spectrace:read`. Each also needs current workspace API entitlement.
Reconova/SpecTrace require live keys. The template list can include drafts; choose a non-null `published_version` before generation.
DocForge test mode separates jobs/output/usage but shares
published template definitions; it is an evaluation mode, not a fully isolated sandbox.

## Processing and operational examples

All mutations require `--confirm-mutation` and a stable `MOTIFUSE_OPERATION_KEY` chosen by you.
Reuse that key only for the same logical operation and input. These runs create resources and may
consume quota. They do not automatically delete inputs or outputs. Use workspace retention controls.

| Command after `npm run examples:run --` | Prerequisites and behavior                                                                                                                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reconova --confirm-mutation`           | Owned CSV upload, completion, intake job and file retrieval; no automatic cleaning. Needs `reconova:write`, `reconova:read`, `files:write`, `files:read`, `jobs:read`.                                                                               |
| `files --confirm-mutation`              | Same direct-upload workflow; bearer key is never forwarded to storage.                                                                                                                                                                               |
| `docforge --confirm-mutation`           | Set `MOTIFUSE_TEMPLATE_ID` to an actual published template and `MOTIFUSE_ROWS_FILE` to a JSON array matching it. Needs `docforge:read`, `docforge:generate`, `jobs:read`, `files:read`. No API for publishing templates is assumed.                  |
| `spectrace --confirm-mutation`          | Creates one project and uploads two owned PDF versions of one document; waits for scanning/extraction, compares, polls and reads findings. Needs `spectrace:write`, `spectrace:read`, `spectrace:compare`, `files:write`, `files:read`, `jobs:read`. |
| `jobs`                                  | Set `MOTIFUSE_PRODUCT` and a real `MOTIFUSE_JOB_ID`; corresponding product read permission and `jobs:read`.                                                                                                                                          |
| `idempotency --confirm-mutation`        | Creates/replays one project with identical body/key; needs `spectrace:write`.                                                                                                                                                                        |
| `pagination`                            | Counts at most 100 projects using lazy cursor iteration; needs `spectrace:read`.                                                                                                                                                                     |
| `errors`                                | Reads projects and reports only status/code/request ID/retry hint.                                                                                                                                                                                   |
| `cancellation`                          | Aborts a local project read; does not cancel server work already accepted.                                                                                                                                                                           |

The runner accepts an outer ten-minute abort signal for processing. A poll wait timeout is checked
between requests; supply an outer signal when a strict caller deadline is needed. Treat failed or
cancelled jobs as terminal; retries of transport requests do not retry failed processing jobs.
For SpecTrace, `status: ready` alone is insufficient: both `available` and `comparison_eligible`
must be true. Extraction can remain unavailable or reject an input; inspect the file instead of
creating repeated comparison jobs.

## Webhook receiver

Import `receiveWebhook` from `workflows.ts` into your server, passing a native Request, your
managed signing secret, and an `enqueueOnce(event)` implementation that atomically deduplicates
`event.id` and durably queues work. It verifies exact raw bytes and five-minute timestamp tolerance,
returns 400 for bad signatures, 503 if persistence fails, and 204 after persistence succeeds.
The in-memory set in the test is only a test double, not production storage.

Payload version is `2026-07-20`; subscribe to exact names from OpenAPI. Delivery retries are bounded
to eight attempts; acknowledge duplicates successfully. Rotation overlaps signing secrets for 24
hours. No generic test-event API is promised: use offline signed fixtures and delivery diagnostics
for actual events. Do not log payloads, signed URLs, secrets or document contents.

## Fixtures and reproducibility

[Fixture provenance](fixtures/README.md): original synthetic CSV and PDFs, dedicated CC0-1.0.
Recreate the PDF bytes with `node scripts/create-example-fixtures.mjs`. TypeScript and test code
remain MIT under the repository license. No customer data, downloaded dataset or external font
file is included. The PDFs are deliberately tiny input examples, not extraction benchmarks.
