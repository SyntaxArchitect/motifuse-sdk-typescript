import type { ApiClient, ListOptions } from "../core/client.js";
import type { ApiRequest, ApiRequestList } from "../types.js";
import { paginate } from "./pagination.js";

/** Requires logs:read plus a currently entitled product scope. */
export class LogsResource {
  constructor(private readonly client: ApiClient) {}

  list(options: ListOptions = {}): Promise<ApiRequestList> {
    return this.client.request("GET", "logs", {
      ...options,
      query: { limit: options.limit, cursor: options.cursor },
    });
  }

  listAll(options: ListOptions = {}): AsyncGenerator<ApiRequest, void, undefined> {
    return paginate((cursor) => this.list({ ...options, cursor }));
  }
}
