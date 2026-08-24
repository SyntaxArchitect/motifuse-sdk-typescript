import { Motifuse } from "@motifuse/sdk";

const motifuse = new Motifuse({ apiKey: process.env.MOTIFUSE_API_KEY! });
const generation = await motifuse.docforge.generations.create(
  {
    template_id: "tpl_example",
    rows: [{ customer_name: "Example Industries" }],
    output_format: "pdf",
  },
  { idempotencyKey: "invoice-batch-example-2026-08-24" },
);
const completed = await motifuse.jobs.wait(generation);
console.log(await motifuse.docforge.generations.download(completed.id));
