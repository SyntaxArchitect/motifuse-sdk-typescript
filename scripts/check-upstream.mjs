import { readFile } from "node:fs/promises";

const upstreamUrl = process.env.MOTIFUSE_OPENAPI_URL || "https://motifuse.com/openapi.json";
const response = await fetch(upstreamUrl, { headers: { Accept: "application/json" } });
if (!response.ok) throw new Error(`Unable to read ${upstreamUrl}: HTTP ${response.status}`);

const upstream = await response.json();
const committed = JSON.parse(
  await readFile(new URL("../openapi/motifuse.openapi.json", import.meta.url), "utf8"),
);

const normalize = (document) => {
  const copy = structuredClone(document);
  copy.servers = [{ url: "https://motifuse.com/api/v1", description: "Motifuse production API" }];
  return JSON.stringify(copy);
};

if (normalize(upstream) !== normalize(committed)) {
  throw new Error(
    "The committed SDK contract differs from the production Motifuse OpenAPI document.",
  );
}
console.log(`SDK contract matches ${upstreamUrl}.`);
