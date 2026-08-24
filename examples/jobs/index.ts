import { Motifuse } from "@motifuse/sdk";

const motifuse = new Motifuse({ apiKey: process.env.MOTIFUSE_API_KEY! });
const current = await motifuse.jobs.retrieve("spectrace", "spj_example");
const completed = await motifuse.jobs.wait(current, { waitTimeout: 10 * 60_000 });
console.log(completed.output_ids);
