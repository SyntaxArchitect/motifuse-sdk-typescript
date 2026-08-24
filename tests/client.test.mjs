import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  Motifuse,
  MotifuseError,
  MotifuseJobError,
  MotifuseWebhookVerificationError,
  getResponseMetadata,
  verifyWebhook,
} from "../dist/index.js";

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

test("client applies authentication, base URL, SDK identity, and query serialization", async () => {
  let received;
  const motifuse = new Motifuse({
    apiKey: "mf_test_fixture",
    baseUrl: "https://api.example.test/api/v1/",
    fetch: async (url, init) => {
      received = { url: String(url), init };
      return json({ data: [], has_more: false, next_cursor: null });
    },
  });
  await motifuse.docforge.templates.list({ limit: 25, cursor: "tpl_1" });
  assert.equal(
    received.url,
    "https://api.example.test/api/v1/docforge/templates?limit=25&cursor=tpl_1",
  );
  assert.equal(received.init.headers.get("authorization"), "Bearer mf_test_fixture");
  assert.match(received.init.headers.get("user-agent"), /^motifuse-typescript\//);
  assert.equal(
    received.init.headers.get("x-motifuse-client"),
    received.init.headers.get("user-agent"),
  );
});

test("invalid configuration is rejected before a request", () => {
  assert.throws(() => new Motifuse({ apiKey: "" }), /non-empty apiKey/);
  assert.throws(() => new Motifuse({ apiKey: "x", baseUrl: "http://api.example.com" }), /HTTPS/);
  assert.doesNotThrow(() => new Motifuse({ apiKey: "x", baseUrl: "http://localhost:3000/api/v1" }));
});

test("Problem Details become MotifuseError without losing request diagnostics", async () => {
  const motifuse = new Motifuse({
    apiKey: "mf_test_fixture",
    maxRetries: 0,
    fetch: async () =>
      json(
        {
          type: "https://motifuse.com/problems/insufficient-scope",
          title: "Insufficient scope",
          status: 403,
          detail: "The key lacks spectrace:read.",
          instance: "/api/v1/spectrace/projects",
          code: "insufficient_scope",
          request_id: "req_fixture_1",
          details: { required_scope: "spectrace:read" },
        },
        { status: 403, headers: { "X-Request-Id": "req_fixture_1" } },
      ),
  });
  await assert.rejects(
    motifuse.spectrace.projects.list(),
    (error) =>
      error instanceof MotifuseError &&
      error.status === 403 &&
      error.code === "insufficient_scope" &&
      error.requestId === "req_fixture_1" &&
      error.details.required_scope === "spectrace:read",
  );
});

test("response metadata exposes request and rate-limit headers unobtrusively", async () => {
  const motifuse = new Motifuse({
    apiKey: "mf_test_fixture",
    fetch: async () =>
      json(
        {
          id: "spj_1",
          object: "project",
          name: "Contract",
          status: "active",
          created_at: "2026-08-24T00:00:00Z",
        },
        {
          headers: {
            "X-Request-Id": "req_metadata",
            "RateLimit-Limit": "1000",
            "RateLimit-Remaining": "998",
            "RateLimit-Reset": "120",
            "Idempotent-Replay": "true",
          },
        },
      ),
  });
  const project = await motifuse.spectrace.projects.retrieve("spj_1");
  assert.deepEqual(getResponseMetadata(project), {
    requestId: "req_metadata",
    status: 200,
    rateLimit: { limit: 1000, remaining: 998, resetAfterSeconds: 120 },
    retryAfter: undefined,
    idempotentReplay: true,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(project, "metadata"), false);
});

test("GET retries 429 using Retry-After while unsafe POST does not retry", async () => {
  let getCalls = 0;
  const getClient = new Motifuse({
    apiKey: "mf_test_fixture",
    maxRetries: 2,
    fetch: async () => {
      getCalls += 1;
      return getCalls === 1
        ? json(
            { detail: "slow down", code: "rate_limit_exceeded" },
            { status: 429, headers: { "Retry-After": "0" } },
          )
        : json({ data: [], has_more: false, next_cursor: null });
    },
  });
  await getClient.spectrace.projects.list();
  assert.equal(getCalls, 2);

  let postCalls = 0;
  const postClient = new Motifuse({
    apiKey: "mf_test_fixture",
    maxRetries: 2,
    fetch: async () => {
      postCalls += 1;
      return json(
        { detail: "temporarily unavailable", code: "service_unavailable" },
        { status: 503 },
      );
    },
  });
  await assert.rejects(
    postClient.webhooks.create({ url: "https://example.com/hook", events: ["job.completed"] }),
  );
  assert.equal(postCalls, 1);
});

test("idempotent mutations receive a stable automatic key across retries", async () => {
  const keys = [];
  let calls = 0;
  const motifuse = new Motifuse({
    apiKey: "mf_test_fixture",
    fetch: async (_url, init) => {
      calls += 1;
      keys.push(init.headers.get("idempotency-key"));
      return calls === 1
        ? json({ detail: "unavailable", code: "service_unavailable" }, { status: 503 })
        : json({
            id: "job_1",
            object: "job",
            product: "docforge",
            operation: "generation",
            status: "queued",
            progress: 0,
          });
    },
  });
  await motifuse.docforge.generations.create({ template_id: "tpl_1", rows: [{ name: "Ada" }] });
  assert.equal(calls, 2);
  assert.match(keys[0], /^sdk_/);
  assert.equal(keys[0], keys[1]);
});

test("timeouts and caller aborts are distinguishable", async () => {
  const fetch = async (_url, init) =>
    new Promise((_resolve, reject) =>
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }),
    );
  const motifuse = new Motifuse({ apiKey: "mf_test_fixture", maxRetries: 0, timeout: 10, fetch });
  await assert.rejects(
    motifuse.usage.retrieve(),
    (error) => error instanceof MotifuseError && error.code === "request_timeout",
  );

  const controller = new AbortController();
  const request = motifuse.usage.retrieve({ signal: controller.signal, timeout: 1_000 });
  controller.abort(new Error("caller stopped"));
  await assert.rejects(request, /caller stopped/);
});

test("pagination iterator fetches one bounded page at a time", async () => {
  const urls = [];
  const motifuse = new Motifuse({
    apiKey: "mf_test_fixture",
    fetch: async (url) => {
      urls.push(String(url));
      const cursor = new URL(url).searchParams.get("cursor");
      return cursor
        ? json({
            data: [
              {
                id: "p2",
                object: "project",
                name: "Two",
                status: "active",
                created_at: "2026-08-24T00:00:00Z",
              },
            ],
            has_more: false,
            next_cursor: null,
          })
        : json({
            data: [
              {
                id: "p1",
                object: "project",
                name: "One",
                status: "active",
                created_at: "2026-08-24T00:00:00Z",
              },
            ],
            has_more: true,
            next_cursor: "cursor_2",
          });
    },
  });
  const ids = [];
  for await (const project of motifuse.spectrace.projects.listAll({ limit: 1 }))
    ids.push(project.id);
  assert.deepEqual(ids, ["p1", "p2"]);
  assert.match(urls[1], /cursor=cursor_2/);
});

test("job wait backs off, returns success, and throws a typed terminal error", async () => {
  let calls = 0;
  const motifuse = new Motifuse({
    apiKey: "mf_test_fixture",
    fetch: async () => {
      calls += 1;
      return json({
        id: "job_1",
        object: "job",
        product: "spectrace",
        operation: "comparison",
        status: calls < 2 ? "processing" : "succeeded",
        progress: calls < 2 ? 50 : 100,
      });
    },
  });
  const completed = await motifuse.jobs.wait(
    { id: "job_1", product: "spectrace" },
    { pollInterval: 1, maxPollInterval: 250, waitTimeout: 1_000 },
  );
  assert.equal(completed.status, "succeeded");

  const failed = new Motifuse({
    apiKey: "mf_test_fixture",
    fetch: async () =>
      json({
        id: "job_2",
        object: "job",
        product: "reconova",
        operation: "clean",
        status: "failed",
        progress: 20,
        error: { code: "invalid_workbook", detail: "Workbook validation failed." },
      }),
  });
  await assert.rejects(
    failed.jobs.wait({ id: "job_2", product: "reconova" }),
    (error) =>
      error instanceof MotifuseJobError &&
      error.jobId === "job_2" &&
      error.code === "invalid_workbook",
  );
});

test("Reconova upload uses the signed destination directly and then finalizes", async () => {
  const calls = [];
  const motifuse = new Motifuse({
    apiKey: "mf_test_fixture",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url) === "https://uploads.example.test/object")
        return new Response(null, { status: 200 });
      if (String(url).endsWith("/complete"))
        return json({
          id: "file_1",
          object: "file",
          product: "reconova",
          status: "processing",
          job: {
            id: "job_1",
            object: "job",
            product: "reconova",
            operation: "profile",
            status: "queued",
            progress: 0,
          },
        });
      return json(
        {
          id: "file_1",
          object: "file",
          product: "reconova",
          status: "uploading",
          upload: {
            url: "https://uploads.example.test/object",
            method: "PUT",
            headers: { "Content-Type": "text/csv", "X-Upload-Token": "fixture" },
            expires_at: "2026-08-24T00:05:00Z",
          },
        },
        { status: 201 },
      );
    },
  });
  const result = await motifuse.reconova.files.upload(
    { filename: "input.csv", size: 3, content_type: "text/csv" },
    { body: new Uint8Array([1, 2, 3]), idempotencyKey: "upload_fixture_1" },
  );
  assert.equal(result.job.id, "job_1");
  assert.equal(calls.length, 3);
  assert.equal(calls[1].init.headers.Authorization, undefined);
  assert.equal(calls[1].init.headers["X-Upload-Token"], "fixture");
  assert.equal(calls[2].init.headers.get("idempotency-key"), "upload_fixture_1_complete");
});

test("webhook verification authenticates the exact raw body and enforces tolerance", () => {
  const payload = JSON.stringify({
    id: "evt_1",
    type: "spectrace.comparison.completed",
    api_version: "v1",
    created: 1787558400,
    workspace_id: "ws_1",
    data: { comparison_id: "spc_1" },
  });
  const timestamp = 1787558400;
  const secret = "whsec_fixture";
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const event = verifyWebhook({
    payload,
    signature: `t=${timestamp},v1=${signature}`,
    secret,
    now: timestamp,
  });
  assert.equal(event.type, "spectrace.comparison.completed");
  assert.throws(
    () =>
      verifyWebhook({
        payload: `${payload} `,
        signature: `t=${timestamp},v1=${signature}`,
        secret,
        now: timestamp,
      }),
    MotifuseWebhookVerificationError,
  );
  assert.throws(
    () =>
      verifyWebhook({
        payload,
        signature: `t=${timestamp},v1=${signature}`,
        secret,
        now: timestamp + 301,
      }),
    /tolerance/,
  );
});

test("product namespaces map to real public paths and request fields", async () => {
  const requests = [];
  const motifuse = new Motifuse({
    apiKey: "mf_test_fixture",
    maxRetries: 0,
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body && JSON.parse(init.body),
      });
      if (String(url).includes("operations/clean"))
        return json(
          {
            id: "job_r",
            object: "job",
            product: "reconova",
            operation: "clean",
            status: "queued",
            progress: 0,
          },
          { status: 202 },
        );
      if (String(url).includes("comparisons"))
        return json(
          {
            id: "cmp_1",
            object: "comparison",
            project_id: "prj_1",
            baseline_version_id: "v1",
            revised_version_id: "v2",
            status: "queued",
          },
          { status: 201 },
        );
      return json(
        {
          id: "prj_1",
          object: "project",
          name: "Supplier contract",
          status: "active",
          created_at: "2026-08-24T00:00:00Z",
        },
        { status: 201 },
      );
    },
  });
  await motifuse.spectrace.projects.create({ name: "Supplier contract" });
  await motifuse.spectrace.comparisons.create("prj_1", {
    baseline_version_id: "v1",
    revised_version_id: "v2",
  });
  await motifuse.reconova.operations.clean({ source_asset_id: "file_1" });
  assert.deepEqual(
    requests.map(({ url, method }) => [method, new URL(url).pathname]),
    [
      ["POST", "/api/v1/spectrace/projects"],
      ["POST", "/api/v1/spectrace/projects/prj_1/comparisons"],
      ["POST", "/api/v1/reconova/operations/clean"],
    ],
  );
  assert.deepEqual(requests[1].body, { baseline_version_id: "v1", revised_version_id: "v2" });
});
