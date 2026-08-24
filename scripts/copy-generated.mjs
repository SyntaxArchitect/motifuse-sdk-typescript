import { copyFile, mkdir } from "node:fs/promises";

const destination = new URL("../dist/generated/", import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(
  new URL("../src/generated/schema.d.ts", import.meta.url),
  new URL("schema.d.ts", destination),
);
