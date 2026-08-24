import { readFile } from "node:fs/promises";
import { Motifuse } from "@motifuse/sdk";

const motifuse = new Motifuse({ apiKey: process.env.MOTIFUSE_API_KEY! });
const bytes = await readFile("quality-example.csv");
const file = await motifuse.reconova.files.upload(
  { filename: "quality-example.csv", size: bytes.byteLength, content_type: "text/csv" },
  { body: bytes, idempotencyKey: "quality-example-upload" },
);
if (file.job) await motifuse.jobs.wait(file.job);
const cleaning = await motifuse.reconova.operations.clean(
  { source_asset_id: file.id },
  { idempotencyKey: "quality-example-clean" },
);
console.log(cleaning.id);
