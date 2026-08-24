import { Motifuse } from "@motifuse/sdk";

const motifuse = new Motifuse({ apiKey: process.env.MOTIFUSE_API_KEY! });
const project = await motifuse.spectrace.projects.create({ name: "Supplier contract review" });
const comparison = await motifuse.spectrace.comparisons.create(
  project.id,
  { baseline_version_id: "stv_baseline_example", revised_version_id: "stv_revised_example" },
  { idempotencyKey: "supplier-contract-comparison-example" },
);
if (comparison.job) await motifuse.jobs.wait(comparison.job);
for await (const finding of motifuse.spectrace.findings.listAll({ comparisonId: comparison.id })) {
  console.log(finding.id, finding.primary_change_type);
}
