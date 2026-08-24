import type { ApiClient, RequestOptions } from "../core/client.js";
import type { Usage } from "../types.js";

export class UsageResource {
  constructor(private readonly client: ApiClient) {}

  retrieve(options: RequestOptions = {}): Promise<Usage> {
    return this.client.request("GET", "usage", options);
  }
}
