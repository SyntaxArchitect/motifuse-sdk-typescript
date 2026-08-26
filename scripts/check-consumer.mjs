import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "motifuse-sdk-consumer-"));
const packDirectory = join(temporary, "pack");
const consumerDirectory = join(temporary, "consumer");
const npm = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const node = process.execPath;

async function run(command, args, cwd, capture = false) {
  const commandArgs =
    process.platform === "win32" && command === npm ? ["/d", "/s", "/c", "npm.cmd", ...args] : args;
  const child = spawn(command, commandArgs, {
    cwd,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  let output = "";
  if (capture) child.stdout.on("data", (chunk) => (output += chunk));
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  if (exitCode !== 0) throw new Error(`${command} ${args.join(" ")} failed with ${exitCode}`);
  return output;
}

try {
  await import("node:fs/promises").then(({ mkdir }) =>
    Promise.all([mkdir(packDirectory), mkdir(consumerDirectory)]),
  );
  const packedOutput = JSON.parse(
    await run(npm, ["pack", "--json", "--pack-destination", packDirectory], root, true),
  );
  const packed = Array.isArray(packedOutput) ? packedOutput[0] : Object.values(packedOutput)[0];
  const tarball = join(packDirectory, packed.filename);
  await writeFile(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "motifuse-sdk-consumer", private: true, type: "module" }, null, 2)}\n`,
  );
  await writeFile(
    join(consumerDirectory, "index.mjs"),
    'import { Motifuse } from "@motifuse/sdk";\nconst client = new Motifuse({ apiKey: "mf_test_consumer_fixture" });\nif (!client.spectrace || !client.docforge || !client.reconova) process.exit(1);\n',
  );
  await writeFile(
    join(consumerDirectory, "index.ts"),
    'import { Motifuse, type SpectraceComparison } from "@motifuse/sdk";\nconst client = new Motifuse({ apiKey: "mf_test_type_fixture" });\nconst comparison: SpectraceComparison | undefined = undefined;\nconst bytes: Uint8Array<ArrayBufferLike> = new Uint8Array(8);\nvoid client.reconova.files.upload({ filename: "qa.csv", size: bytes.byteLength, content_type: "text/csv" }, { body: bytes });\nvoid client; void comparison;\n',
  );
  await writeFile(
    join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true }, include: ["index.ts"] }, null, 2)}\n`,
  );
  await run(
    npm,
    ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"],
    consumerDirectory,
  );
  await run(node, ["index.mjs"], consumerDirectory);
  const tsc = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
  await run(node, [tsc, "-p", "tsconfig.json"], consumerDirectory);
  const manifest = JSON.parse(
    await readFile(join(consumerDirectory, "node_modules/@motifuse/sdk/package.json"), "utf8"),
  );
  if (manifest.name !== "@motifuse/sdk")
    throw new Error("Installed package identity is incorrect.");
  console.log(
    `Consumer installed, imported, and typechecked ${manifest.name}@${manifest.version}.`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
