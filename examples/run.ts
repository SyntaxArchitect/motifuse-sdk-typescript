import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Motifuse,
  MotifuseError,
  type DocForgeGenerationInput,
  type MotifuseProduct,
} from "@motifuse/sdk";
import {
  firstRequest,
  analyzeDataset,
  generateDocument,
  compareDocuments,
  waitForJob,
  idempotentProject,
  countProjects,
  readWithDiagnostics,
  cancellableRead,
} from "./workflows.js";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}; never put secrets in source.`);
  return value;
};
const product = (value: string): MotifuseProduct => {
  if (!["docforge", "reconova", "spectrace"].includes(value))
    throw new Error("Choose docforge, reconova or spectrace.");
  return value as MotifuseProduct;
};
const mode = process.argv[2] ?? "quickstart";
const processing = ["reconova", "files", "docforge", "spectrace", "idempotency"].includes(mode);
if (processing && !process.argv.includes("--confirm-mutation"))
  throw new Error(
    "This example creates resources and may consume quota. Add --confirm-mutation only when intended.",
  );
const client = new Motifuse({ apiKey: required("MOTIFUSE_API_KEY") });
const signal = AbortSignal.timeout(10 * 60_000);
try {
  if (mode === "quickstart") {
    const page = await firstRequest(client, product(process.env.MOTIFUSE_PRODUCT ?? "spectrace"));
    console.log({ count: page.data.length, hasMore: page.has_more });
  } else if (mode === "reconova" || mode === "files") {
    const file = await analyzeDataset(
      client,
      await readFile(resolve("examples/fixtures/quality.csv")),
      required("MOTIFUSE_OPERATION_KEY"),
      signal,
    );
    console.log({ id: file.id, status: file.status });
  } else if (mode === "docforge") {
    const source = await readFile(required("MOTIFUSE_ROWS_FILE"), "utf8");
    let rows: unknown;
    try {
      rows = JSON.parse(source);
    } catch {
      // Native JSON parser messages can include private input fragments.
      throw new Error("Rows file is not valid JSON.");
    }
    if (
      !Array.isArray(rows) ||
      rows.length === 0 ||
      rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))
    )
      throw new Error("Rows must be a nonempty JSON array matching your published template.");
    const input: DocForgeGenerationInput = {
      template_id: required("MOTIFUSE_TEMPLATE_ID"),
      rows,
      output_format: "pdf",
    };
    const download = await generateDocument(
      client,
      input,
      required("MOTIFUSE_OPERATION_KEY"),
      signal,
    );
    console.log({ downloadAvailable: Boolean(download.url), expiresAt: download.expires_at });
  } else if (mode === "spectrace")
    console.log(
      await compareDocuments(
        client,
        await readFile(resolve("examples/fixtures/baseline.pdf")),
        await readFile(resolve("examples/fixtures/revised.pdf")),
        required("MOTIFUSE_OPERATION_KEY"),
        signal,
      ),
    );
  else if (mode === "jobs") {
    const job = await waitForJob(
      client,
      { id: required("MOTIFUSE_JOB_ID"), product: product(required("MOTIFUSE_PRODUCT")) },
      signal,
    );
    console.log({ id: job.id, status: job.status });
  } else if (mode === "idempotency")
    console.log(await idempotentProject(client, required("MOTIFUSE_OPERATION_KEY")));
  else if (mode === "pagination") console.log({ count: await countProjects(client, 100, signal) });
  else if (mode === "errors") console.log(await readWithDiagnostics(client));
  else if (mode === "cancellation") {
    const abort = new AbortController();
    const pending = cancellableRead(client, abort.signal);
    abort.abort(new Error("Example cancelled locally"));
    try {
      await pending;
    } catch {
      console.log("Read cancelled; no server-job cancellation was requested.");
    }
  } else
    throw new Error(
      "Unknown mode. Webhook integration is the exported receiveWebhook function in examples/workflows.ts; test it offline.",
    );
} catch (error) {
  if (error instanceof MotifuseError) {
    console.error({ status: error.status, code: error.code, requestId: error.requestId });
    process.exitCode = 1;
  } else throw error;
}
