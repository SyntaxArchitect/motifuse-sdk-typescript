import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getEventListeners } from "node:events";
import { createHmac } from "node:crypto";
import { Motifuse, verifyWebhook } from "../dist/index.js";
import { sleep } from "../dist/core/sleep.js";

test("invalid signed JSON errors do not echo payload fragments", () => {
  const payload = "private-document-fragment";
  const secret = "owned-fixture-secret";
  const now = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${now}.${payload}`).digest("hex");
  assert.throws(
    () => verifyWebhook({ payload, secret, signature: `t=${now},v1=${signature}` }),
    (error) => error.message === "The verified webhook body is not valid JSON.",
  );
});

test("SDK request identity matches the package version", async () => {
  const version = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ).version;
  const client = new Motifuse({
    apiKey: "synthetic-test-key",
    fetch: async (_url, init) => {
      assert.equal(
        new Headers(init.headers).get("X-Motifuse-Client"),
        `motifuse-typescript/${version}`,
      );
      return Response.json({ data: [], has_more: false, next_cursor: null });
    },
  });
  await client.spectrace.projects.list();
});

for (const product of ["reconova", "spectrace"]) {
  for (const signalSource of ["uploadOptions", "requestOptions"]) {
    test(`${product} ${signalSource} aborts during upload authorization before bytes or completion`, async () => {
      const abort = new AbortController();
      const reason = new Error("Synthetic cancellation");
      let calls = 0;
      const client = new Motifuse({
        apiKey: "synthetic-test-key",
        maxRetries: 0,
        fetch: async (_url, init) => {
          calls++;
          assert.equal(init.signal.aborted, false);
          abort.abort(reason);
          assert.equal(init.signal.aborted, true);
          throw init.signal.reason;
        },
      });
      const input = {
        filename: "synthetic.csv",
        size: 3,
        content_type: "text/csv",
        version_label: "baseline",
      };
      const upload = {
        body: "a\n1",
        ...(signalSource === "uploadOptions" ? { signal: abort.signal } : {}),
      };
      const options = signalSource === "requestOptions" ? { signal: abort.signal } : {};
      await assert.rejects(
        product === "spectrace"
          ? client.spectrace.files.upload("stp_synthetic", input, upload, options)
          : client.reconova.files.upload(input, upload, options),
        (error) => error === reason,
      );
      assert.equal(calls, 1);
    });
  }
}

test("completed backoffs remove listeners; cancellation clears the outstanding wait", async () => {
  const controller = new AbortController();
  for (let n = 0; n < 20; n++) await sleep(1, controller.signal);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  const pending = sleep(30_000, controller.signal);
  controller.abort(new Error("Synthetic stop"));
  await assert.rejects(pending, /Synthetic stop/);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
