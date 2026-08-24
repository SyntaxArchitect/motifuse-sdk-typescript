import { Motifuse } from "@motifuse/sdk";

const motifuse = new Motifuse({ apiKey: process.env.MOTIFUSE_API_KEY! });

export async function handleWebhook(request: Request) {
  const rawBody = await request.text();
  return motifuse.webhooks.verify({
    payload: rawBody,
    signature: request.headers.get("motifuse-signature")!,
    secret: process.env.MOTIFUSE_WEBHOOK_SECRET!,
  });
}
