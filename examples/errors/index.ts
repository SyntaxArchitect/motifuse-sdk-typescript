import { Motifuse, MotifuseError } from "@motifuse/sdk";

const motifuse = new Motifuse({ apiKey: process.env.MOTIFUSE_API_KEY! });
try {
  await motifuse.usage.retrieve();
} catch (error) {
  if (error instanceof MotifuseError) {
    console.error(error.code, error.status, error.requestId, error.retryAfter);
  }
}
