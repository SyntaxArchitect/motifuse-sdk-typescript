import { setTimeout as delay } from "node:timers/promises";
import {
  Motifuse,
  MotifuseError,
  verifyWebhook,
  type DocForgeGenerationInput,
  type MotifuseFile,
  type MotifuseJob,
  type MotifuseProduct,
  type WebhookEvent,
} from "@motifuse/sdk";

export async function firstRequest(client: Motifuse, product: MotifuseProduct) {
  if (product === "docforge") return client.docforge.templates.list({ limit: 1 });
  if (product === "reconova") return client.reconova.files.list({ limit: 1 });
  return client.spectrace.projects.list({ limit: 1 });
}

export async function analyzeDataset(
  client: Motifuse,
  bytes: Uint8Array,
  operationKey: string,
  signal?: AbortSignal,
) {
  const file = await client.reconova.files.upload(
    { filename: "owned-quality-sample.csv", content_type: "text/csv", size: bytes.byteLength },
    { body: bytes, idempotencyKey: `${operationKey}-upload`, signal },
    { signal },
  );
  if (!file.job)
    throw new Error(
      "Upload completion did not return an intake job; inspect the file before starting more work.",
    );
  await client.jobs.wait(file.job, { signal });
  return client.reconova.files.retrieve(file.id, { signal });
}

export async function generateDocument(
  client: Motifuse,
  input: DocForgeGenerationInput,
  operationKey: string,
  signal?: AbortSignal,
) {
  const job = await client.docforge.generations.create(input, {
    idempotencyKey: operationKey,
    signal,
  });
  const completed = await client.jobs.wait(job, { signal });
  return client.docforge.generations.download(completed.id, { target: "archive" }, { signal });
}

export async function waitForComparableFile(
  client: Motifuse,
  id: string,
  signal?: AbortSignal,
  waitTimeout = 10 * 60_000,
): Promise<MotifuseFile> {
  const deadline = Date.now() + waitTimeout;
  let pause = 1_000;
  while (Date.now() < deadline) {
    const file = await client.spectrace.files.retrieve(id, {
      signal,
      timeout: Math.max(1, Math.min(30_000, deadline - Date.now())),
    });
    if (file.available === true && file.comparison_eligible === true) return file;
    if (
      ["rejected", "quarantined", "deleted"].includes(file.status) ||
      file.extraction_status === "failed"
    ) {
      throw new Error(
        `File cannot be compared (${file.status}); inspect its scanning and extraction status.`,
      );
    }
    await delay(Math.min(pause, Math.max(1, deadline - Date.now())), undefined, { signal });
    pause = Math.min(10_000, Math.round(pause * 1.5));
  }
  throw new Error(
    "File readiness timed out. A ready upload alone does not mean scanning and extraction completed.",
  );
}

export async function compareDocuments(
  client: Motifuse,
  baseline: Uint8Array,
  revised: Uint8Array,
  operationKey: string,
  signal?: AbortSignal,
) {
  const project = await client.spectrace.projects.create(
    { name: "Owned SDK comparison example" },
    { idempotencyKey: `${operationKey}-project`, signal },
  );
  const first = await client.spectrace.files.upload(
    project.id,
    {
      filename: "baseline.pdf",
      content_type: "application/pdf",
      size: baseline.byteLength,
      version_label: "baseline",
    },
    { body: baseline, idempotencyKey: `${operationKey}-baseline`, signal },
    { signal },
  );
  if (!first.document_id)
    throw new Error(
      "Upload did not return a document_id; do not invent one for the revised version.",
    );
  const second = await client.spectrace.files.upload(
    project.id,
    {
      filename: "revised.pdf",
      content_type: "application/pdf",
      size: revised.byteLength,
      version_label: "revised",
      document_id: first.document_id,
    },
    { body: revised, idempotencyKey: `${operationKey}-revised`, signal },
    { signal },
  );
  await Promise.all([
    waitForComparableFile(client, first.id, signal),
    waitForComparableFile(client, second.id, signal),
  ]);
  const comparison = await client.spectrace.comparisons.create(
    project.id,
    { baseline_version_id: first.id, revised_version_id: second.id, include_furniture: false },
    { idempotencyKey: `${operationKey}-comparison`, signal },
  );
  if (comparison.job) await client.jobs.wait(comparison.job, { signal });
  else if (comparison.status !== "complete")
    throw new Error("Comparison returned no job; inspect its status before requesting results.");
  const findings = await client.spectrace.findings.list(
    { comparisonId: comparison.id, limit: 20 },
    { signal },
  );
  return { comparisonId: comparison.id, count: findings.data.length, hasMore: findings.has_more };
}

export const waitForJob = (
  client: Motifuse,
  job: Pick<MotifuseJob, "id" | "product">,
  signal?: AbortSignal,
) => client.jobs.wait(job, { signal });

export async function idempotentProject(client: Motifuse, operationKey: string) {
  const input = { name: "Owned idempotency example" };
  const first = await client.spectrace.projects.create(input, { idempotencyKey: operationKey });
  const replay = await client.spectrace.projects.create(input, { idempotencyKey: operationKey });
  return { firstId: first.id, replayId: replay.id };
}

export async function countProjects(client: Motifuse, maximum = 100, signal?: AbortSignal) {
  if (!Number.isInteger(maximum) || maximum < 1)
    throw new Error("maximum must be a positive integer.");
  let count = 0;
  for await (const _project of client.spectrace.projects.listAll({
    limit: Math.min(20, maximum),
    signal,
  })) {
    count++;
    if (count >= maximum) break;
  }
  return count;
}

export async function readWithDiagnostics(client: Motifuse) {
  try {
    return {
      ok: true as const,
      count: (await client.spectrace.projects.list({ limit: 1 })).data.length,
    };
  } catch (error) {
    if (error instanceof MotifuseError)
      return {
        ok: false as const,
        status: error.status,
        code: error.code,
        requestId: error.requestId,
        retryAfter: error.retryAfter,
      };
    throw error;
  }
}

export const cancellableRead = (client: Motifuse, signal: AbortSignal) =>
  client.spectrace.projects.list({ limit: 1, signal });

/** enqueueOnce must atomically persist/deduplicate event.id and enqueue work.
 * Returning before durable persistence can lose events. This is not an in-memory
 * production deduplication store. Do not log the payload or signing secret. */
export async function receiveWebhook(
  request: Request,
  secret: string,
  enqueueOnce: (event: WebhookEvent) => Promise<void>,
): Promise<Response> {
  const payload = new Uint8Array(await request.arrayBuffer());
  let event: WebhookEvent;
  try {
    event = verifyWebhook({
      payload,
      signature: request.headers.get("motifuse-signature") ?? "",
      secret,
    });
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }
  try {
    await enqueueOnce(event);
  } catch {
    return new Response("Temporary queue failure", { status: 503 });
  }
  return new Response(null, { status: 204 });
}
