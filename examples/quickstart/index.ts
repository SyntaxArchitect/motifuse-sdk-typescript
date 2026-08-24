import { Motifuse } from "@motifuse/sdk";

const motifuse = new Motifuse({ apiKey: process.env.MOTIFUSE_API_KEY! });
const projects = await motifuse.spectrace.projects.list({ limit: 20 });
console.log(projects.data);
