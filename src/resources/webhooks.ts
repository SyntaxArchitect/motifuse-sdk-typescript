import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApiClient, ListOptions, RequestOptions } from "../core/client.js";
import { MotifuseWebhookVerificationError } from "../core/errors.js";
import type {
  Page,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEndpointInput,
  WebhookEndpointUpdateInput,
  WebhookEvent,
} from "../types.js";

export interface VerifyWebhookInput {
  payload: string | Uint8Array;
  signature: string;
  secret: string;
  tolerance?: number | undefined;
  now?: number | undefined;
}

export interface ReplayedWebhookDelivery {
  id: string;
  object: "webhook_delivery";
  event_id: string;
  status: "pending";
  replayed_from: string;
}

function parseSignature(header: string): { timestamp: number; signatures: string[] } {
  const parts = header.split(",").map((value) => value.trim());
  const timestamp = Number(parts.find((value) => value.startsWith("t="))?.slice(2));
  const signatures = parts
    .filter((value) => value.startsWith("v1="))
    .map((value) => value.slice(3));
  if (!Number.isFinite(timestamp) || !signatures.length) {
    throw new MotifuseWebhookVerificationError("The Motifuse-Signature header is malformed.");
  }
  return { timestamp, signatures };
}

export function verifyWebhook(input: VerifyWebhookInput): WebhookEvent {
  const tolerance = input.tolerance ?? 300;
  const { timestamp, signatures } = parseSignature(input.signature);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    throw new MotifuseWebhookVerificationError(
      "The webhook timestamp is outside the allowed tolerance.",
    );
  }
  const body =
    typeof input.payload === "string"
      ? Buffer.from(input.payload, "utf8")
      : Buffer.from(input.payload);
  const expected = createHmac("sha256", input.secret)
    .update(Buffer.from(`${timestamp}.`, "utf8"))
    .update(body)
    .digest();
  const valid = signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const supplied = Buffer.from(signature, "hex");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
  if (!valid)
    throw new MotifuseWebhookVerificationError(
      "The webhook signature does not match the raw body.",
    );
  try {
    return JSON.parse(body.toString("utf8")) as WebhookEvent;
  } catch {
    throw new MotifuseWebhookVerificationError("The verified webhook body is not valid JSON.");
  }
}

export class WebhooksResource {
  constructor(private readonly client: ApiClient) {}

  list(options: RequestOptions = {}): Promise<Page<WebhookEndpoint>> {
    return this.client.request("GET", "webhooks", options);
  }

  create(input: WebhookEndpointInput, options: RequestOptions = {}): Promise<WebhookEndpoint> {
    return this.client.request("POST", "webhooks", { ...options, body: input });
  }

  update(
    endpointId: string,
    input: WebhookEndpointUpdateInput,
    options: RequestOptions = {},
  ): Promise<WebhookEndpoint> {
    return this.client.request("PATCH", `webhooks/${encodeURIComponent(endpointId)}`, {
      ...options,
      body: input,
    });
  }

  delete(endpointId: string, options: RequestOptions = {}): Promise<void> {
    return this.client.request("DELETE", `webhooks/${encodeURIComponent(endpointId)}`, options);
  }

  deliveries(options: ListOptions = {}): Promise<Page<WebhookDelivery>> {
    return this.client.request("GET", "webhooks/deliveries", {
      ...options,
      query: { limit: options.limit, cursor: options.cursor },
    });
  }

  resend(deliveryId: string, options: RequestOptions = {}): Promise<ReplayedWebhookDelivery> {
    return this.client.request(
      "POST",
      `webhooks/deliveries/${encodeURIComponent(deliveryId)}/resend`,
      options,
    );
  }

  verify(input: VerifyWebhookInput): WebhookEvent {
    return verifyWebhook(input);
  }
}
