/** Abortable backoff without retaining one listener per completed delay. */
export function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      // AbortSignal permits arbitrary caller reasons; preserve the platform value.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      reject(signal?.reason ?? new DOMException("The request was aborted.", "AbortError"));
    };
    if (signal?.aborted) {
      // Preserve the same reason as request cancellation, even when it is not Error.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      reject(signal.reason ?? new DOMException("The request was aborted.", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
