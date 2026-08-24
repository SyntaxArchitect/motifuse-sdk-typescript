import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "motifuse-sdk-pack-"));
const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const args =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd", "pack", "--json", "--pack-destination", temporary]
    : ["pack", "--json", "--pack-destination", temporary];

try {
  const child = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "inherit"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  if (exitCode !== 0) process.exit(exitCode ?? 1);
  const parsed = JSON.parse(output);
  const result = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  const names = result.files.map((file) => file.path).sort();
  const forbidden = names.filter((name) =>
    /^(src|tests|scripts|examples|openapi|\.github)\//.test(name),
  );
  if (forbidden.length) throw new Error(`Forbidden package files: ${forbidden.join(", ")}`);
  for (const required of [
    "dist/index.js",
    "dist/index.d.ts",
    "dist/generated/schema.d.ts",
    "README.md",
    "LICENSE",
  ]) {
    if (!names.includes(required)) throw new Error(`Packed package is missing ${required}`);
  }
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  if (manifest.name !== "@motifuse/sdk" || manifest.publishConfig?.access !== "public") {
    throw new Error("Package identity or public publish configuration is incorrect.");
  }
  console.log(`Package contains ${names.length} files (${result.size} bytes compressed).`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
