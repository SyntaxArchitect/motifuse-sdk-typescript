import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const document = JSON.parse(
  await readFile(new URL("../openapi/motifuse.openapi.json", import.meta.url), "utf8"),
);

test("the vendored OpenAPI contract is the unified production v1 surface", () => {
  assert.equal(document.openapi, "3.1.2");
  assert.equal(document.info.version, "1.0.0");
  assert.equal(document.servers[0].url, "https://motifuse.com/api/v1");
  assert.equal(Object.keys(document.paths).length, 31);
  const operations = Object.values(document.paths).flatMap((item) =>
    ["get", "post", "patch", "delete"].flatMap((method) => (item[method] ? [item[method]] : [])),
  );
  assert.equal(operations.length, 41);
  assert.equal(new Set(operations.map((operation) => operation.operationId)).size, 41);
});

test("the contract includes only supported products and named typed collection responses", () => {
  for (const path of Object.keys(document.paths)) {
    assert.match(path, /^\/(docforge|reconova|spectrace|webhooks|usage)/);
  }
  assert.equal(
    document.paths["/spectrace/comparisons/{comparison_id}/findings"].get.responses[200].content[
      "application/json"
    ].schema.$ref,
    "#/components/schemas/FindingList",
  );
  assert.equal(
    document.paths["/docforge/templates"].get.responses[200].content["application/json"].schema
      .$ref,
    "#/components/schemas/DocForgeTemplateList",
  );
  assert.ok(document.components.schemas.Usage.properties.products.properties.spectrace);
});

test("every idempotent mutation declares Idempotency-Key", () => {
  for (const item of Object.values(document.paths)) {
    for (const method of ["post", "patch", "delete"]) {
      const operation = item[method];
      if (!operation) continue;
      if (operation.parameters.some((parameter) => parameter.$ref?.endsWith("/IdempotencyKey"))) {
        assert.ok(operation.operationId);
      }
    }
  }
  const comparison = document.paths["/spectrace/projects/{project_id}/comparisons"].post;
  assert.ok(comparison.parameters.some((parameter) => parameter.$ref?.endsWith("/IdempotencyKey")));
});
