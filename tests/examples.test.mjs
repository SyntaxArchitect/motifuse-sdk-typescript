import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Motifuse, MotifuseJobError } from "../dist/index.js";
import {
  firstRequest,
  analyzeDataset,
  generateDocument,
  compareDocuments,
  waitForComparableFile,
  idempotentProject,
  countProjects,
  readWithDiagnostics,
  cancellableRead,
  receiveWebhook,
} from "../.examples-build/examples/workflows.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const page = (data = []) => ({ data, has_more: false, next_cursor: null });
function mock(handler) {
  const calls = [];
  const client = new Motifuse({
    apiKey: "mf_live_synthetic_test_only",
    maxRetries: 0,
    fetch: async (url, init) => {
      const call = {
        url: new URL(url),
        init,
        body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      };
      calls.push(call);
      return handler(call, calls.length);
    },
  });
  return { client, calls };
}
const job = (product, status = "succeeded") => ({
  id: "job_owned",
  object: "job",
  product,
  status,
});
const authorization = (id) => ({
  id,
  object: "file",
  product: "spectrace",
  status: "pending",
  upload: {
    url: `https://storage.example.test/${id}`,
    method: "PUT",
    headers: { "content-type": "application/pdf" },
  },
});

test("three first requests use real read endpoints and an empty success envelope", async () => {
  const { client, calls } = mock(() => json(page()));
  for (const product of ["reconova", "docforge", "spectrace"])
    assert.deepEqual(await firstRequest(client, product), page());
  assert.deepEqual(
    calls.map((c) => c.url.pathname + c.url.search),
    [
      "/api/v1/reconova/files?limit=1",
      "/api/v1/docforge/templates?limit=1",
      "/api/v1/spectrace/projects?limit=1",
    ],
  );
});

test("Reconova completes an owned CSV upload and polls intake without automatic cleaning", async () => {
  const bytes = readFileSync(new URL("../examples/fixtures/quality.csv", import.meta.url));
  const { client, calls } = mock((call, n) => {
    if (n === 1) {
      assert.equal(call.body.size, bytes.length);
      return json(authorization("file_owned"), 201);
    }
    if (n === 2) {
      assert.equal(new Headers(call.init.headers).has("authorization"), false);
      assert.deepEqual(call.body, bytes);
      return new Response(null);
    }
    if (n === 3) return json({ id: "file_owned", job: job("reconova", "queued") });
    if (n === 4) return json(job("reconova"));
    return json({ id: "file_owned", object: "file", product: "reconova", status: "ready" });
  });
  assert.equal((await analyzeDataset(client, bytes, "owned-intake")).status, "ready");
  assert.deepEqual(
    calls.map((c) => c.url.pathname),
    [
      "/api/v1/reconova/files",
      "/file_owned",
      "/api/v1/reconova/files/file_owned/complete",
      "/api/v1/reconova/jobs/job_owned",
      "/api/v1/reconova/files/file_owned",
    ],
  );
});

test("DocForge generation uses caller template/rows and only authorizes output after success", async () => {
  const input = {
    template_id: "template_owned",
    rows: [{ label: "Owned fixture" }],
    output_format: "pdf",
  };
  const { client, calls } = mock((call, n) => {
    if (n === 1) {
      assert.deepEqual(call.body, input);
      return json(job("docforge", "queued"), 202);
    }
    if (n === 2) return json(job("docforge"));
    assert.deepEqual(call.body, { target: "archive" });
    return json({ url: "https://storage.example.test/output", expires_in: 600 });
  });
  assert.equal((await generateDocument(client, input, "owned-generation")).expires_in, 600);
  assert.equal(calls[2].url.pathname, "/api/v1/docforge/generations/job_owned/download");
  const failed = mock((_, n) => json(job("docforge", n === 1 ? "queued" : "failed")));
  await assert.rejects(generateDocument(failed.client, input, "owned-failed"), MotifuseJobError);
  assert.equal(failed.calls.length, 2);
});

test("SpecTrace uploads owned versions of one document and requires extraction readiness", async () => {
  const baseline = readFileSync(new URL("../examples/fixtures/baseline.pdf", import.meta.url));
  const revised = readFileSync(new URL("../examples/fixtures/revised.pdf", import.meta.url));
  let uploads = 0;
  let firstReads = 0;
  let comparisons = 0;
  const { client, calls } = mock((call) => {
    const path = call.url.pathname;
    if (call.url.hostname === "storage.example.test") {
      assert.equal(new Headers(call.init.headers).has("authorization"), false);
      return new Response(null);
    }
    if (path === "/api/v1/spectrace/projects") return json({ id: "project_owned" }, 201);
    if (path.endsWith("/files") && call.init.method === "POST") {
      uploads++;
      if (uploads === 2) assert.equal(call.body.document_id, "document_owned");
      return json(authorization(uploads === 1 ? "baseline_owned" : "revised_owned"), 201);
    }
    if (path.endsWith("/complete"))
      return json({
        id: path.includes("baseline") ? "baseline_owned" : "revised_owned",
        document_id: "document_owned",
        status: "ready",
        comparison_eligible: false,
      });
    if (path.includes("/files/")) {
      const ready = !path.endsWith("baseline_owned") || ++firstReads > 1;
      return json({
        id: path.split("/").at(-1),
        status: "ready",
        available: true,
        comparison_eligible: ready,
      });
    }
    if (path.endsWith("/comparisons")) {
      comparisons++;
      assert.ok(firstReads >= 2);
      assert.equal(call.body.baseline_version_id, "baseline_owned");
      assert.equal(call.body.revised_version_id, "revised_owned");
      return json({ id: "comparison_owned", job: job("spectrace", "queued") }, 202);
    }
    if (path.includes("/jobs/")) return json(job("spectrace"));
    return json(page([{ id: "finding_owned" }]));
  });
  assert.deepEqual(await compareDocuments(client, baseline, revised, "owned-compare"), {
    comparisonId: "comparison_owned",
    count: 1,
    hasMore: false,
  });
  assert.equal(comparisons, 1);
  assert.equal(calls.filter((c) => c.url.hostname === "storage.example.test").length, 2);
  const quarantined = mock(() =>
    json({ status: "quarantined", available: false, comparison_eligible: false }),
  );
  await assert.rejects(waitForComparableFile(quarantined.client, "owned"), /cannot be compared/);
});

test("idempotent example preserves key/body and pagination stops at the caller bound", async () => {
  const replay = mock(() => json({ id: "project_owned" }));
  assert.deepEqual(await idempotentProject(replay.client, "owned-op"), {
    firstId: "project_owned",
    replayId: "project_owned",
  });
  assert.deepEqual(
    replay.calls.map((c) => c.init.headers.get("idempotency-key")),
    ["owned-op", "owned-op"],
  );
  assert.deepEqual(replay.calls[0].body, replay.calls[1].body);
  const paging = mock((call, n) => {
    if (n === 2) assert.equal(call.url.searchParams.get("cursor"), "cursor_owned");
    return json(
      n === 1
        ? { data: [{ id: "a" }], has_more: true, next_cursor: "cursor_owned" }
        : { data: [{ id: "b" }, { id: "c" }], has_more: true, next_cursor: "cursor_more" },
    );
  });
  assert.equal(await countProjects(paging.client, 2), 2);
  assert.equal(paging.calls.length, 2);
});

test("diagnostic projection excludes payloads and pre-aborted requests never send", async () => {
  const { client } = mock(() =>
    json(
      {
        status: 402,
        code: "developer_plan_required",
        request_id: "req_owned",
        detail: "private context",
      },
      402,
    ),
  );
  const result = await readWithDiagnostics(client);
  assert.equal(result.status, 402);
  assert.equal(JSON.stringify(result).includes("private context"), false);
  const cancelled = mock(() => {
    throw new Error("must not send");
  });
  await assert.rejects(cancellableRead(cancelled.client, AbortSignal.abort()));
  assert.equal(cancelled.calls.length, 0);
});

test("webhook integration verifies raw bytes, durable enqueue failure and event deduplication", async () => {
  const secret = "owned_synthetic_secret";
  const payload = JSON.stringify({
    id: "evt_owned",
    type: "spectrace.comparison.completed",
    api_version: "2026-07-20",
    data: { object: { id: "comparison_owned" } },
  });
  function request(body = payload, age = 0) {
    const timestamp = Math.floor(Date.now() / 1000) - age;
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    return new Request("https://receiver.example.test/webhook", {
      method: "POST",
      body,
      headers: { "motifuse-signature": `t=${timestamp},v1=${signature}` },
    });
  }
  const persisted = new Set(); // Test double only; production requires a durable atomic store/queue.
  const enqueueOnce = async (event) => {
    persisted.add(event.id);
  };
  assert.equal((await receiveWebhook(request(), secret, enqueueOnce)).status, 204);
  assert.equal((await receiveWebhook(request(), secret, enqueueOnce)).status, 204);
  assert.equal(persisted.size, 1);
  assert.equal((await receiveWebhook(request(payload + " "), secret, enqueueOnce)).status, 400);
  assert.equal((await receiveWebhook(request(payload, 301), secret, enqueueOnce)).status, 400);
  assert.equal(
    (
      await receiveWebhook(request(), secret, async () => {
        throw new Error("queue offline");
      })
    ).status,
    503,
  );
});

test("request-log SDK resource preserves cursor and server entitlement metadata", async () => {
  const { client, calls } = mock(() =>
    json({ ...page(), authorized_products: ["spectrace"], retention_days: 30 }),
  );
  assert.equal((await client.logs.list({ limit: 10, cursor: "owned_cursor" })).retention_days, 30);
  assert.equal(
    calls[0].url.pathname + calls[0].url.search,
    "/api/v1/logs?limit=10&cursor=owned_cursor",
  );
});
