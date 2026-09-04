import { sleep } from "../core/sleep.js";
import type { ApiClient, RequestOptions } from "../core/client.js";
import { MotifuseJobError } from "../core/errors.js";
import type { MotifuseJob, MotifuseProduct } from "../types.js";

export interface JobReference {
  id: string;
  product: MotifuseProduct;
}

export interface WaitForJobOptions extends RequestOptions {
  waitTimeout?: number | undefined;
  pollInterval?: number | undefined;
  maxPollInterval?: number | undefined;
}

export class JobsResource {
  constructor(private readonly client: ApiClient) {}

  retrieve(
    product: MotifuseProduct,
    jobId: string,
    options: RequestOptions = {},
  ): Promise<MotifuseJob> {
    const resource = product === "docforge" ? "generations" : "jobs";
    return this.client.request(
      "GET",
      `${product}/${resource}/${encodeURIComponent(jobId)}`,
      options,
    );
  }

  cancel(
    product: MotifuseProduct,
    jobId: string,
    options: RequestOptions = {},
  ): Promise<MotifuseJob> {
    const resource = product === "docforge" ? "generations" : "jobs";
    return this.client.request(
      "POST",
      `${product}/${resource}/${encodeURIComponent(jobId)}/cancel`,
      options,
    );
  }

  async wait(
    jobOrReference: MotifuseJob | JobReference,
    options: WaitForJobOptions = {},
  ): Promise<MotifuseJob> {
    const {
      waitTimeout = 10 * 60_000,
      pollInterval = 1_000,
      maxPollInterval = 10_000,
      ...request
    } = options;
    const reference = { id: jobOrReference.id, product: jobOrReference.product };
    const deadline = Date.now() + waitTimeout;
    let delay = Math.max(250, pollInterval);

    while (true) {
      const job = await this.retrieve(reference.product, reference.id, request);
      if (job.status === "succeeded") return job;
      if (job.status === "failed" || job.status === "cancelled") {
        throw new MotifuseJobError(
          job.id,
          job.status,
          job.error?.detail ?? job.message ?? `Motifuse job ${job.status}.`,
          job.error?.code,
        );
      }
      if (Date.now() + delay > deadline) {
        throw new MotifuseJobError(
          job.id,
          "failed",
          `Timed out waiting ${waitTimeout}ms for the job.`,
          "job_wait_timeout",
        );
      }
      await sleep(delay, options.signal);
      delay = Math.min(Math.round(delay * 1.5), maxPollInterval);
    }
  }
}
