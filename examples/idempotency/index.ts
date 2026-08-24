import { Motifuse } from "@motifuse/sdk";

const motifuse = new Motifuse({ apiKey: process.env.MOTIFUSE_API_KEY! });
const project = await motifuse.spectrace.projects.create(
  { name: "Repeat-safe project", reference: "example-283" },
  { idempotencyKey: "project-import-283" },
);
console.log(project.id);
