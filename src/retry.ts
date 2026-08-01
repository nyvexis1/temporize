import { abortError } from "./debounce";

/** Options that control retry limits, backoff, filtering, and cancellation. */
export interface RetryOptions {
  /** Maximum total invocation attempts, including the first. Defaults to `3`. */
  attempts?: number;
  /** Delay after the first failure in milliseconds. Defaults to `200`. */
  baseDelay?: number;
  /** Maximum delay between attempts in milliseconds. Defaults to `5000`. */
  maxDelay?: number;
  /** Exponential multiplier applied after each failed attempt. Defaults to `2`. */
  factor?: number;
  /** Randomize each delay between zero and its calculated value. Defaults to `true`. */
  jitter?: boolean;
  /** Return whether an error should be retried; `attempt` is one-based. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Stop active waiting and future attempts immediately when aborted. */
  signal?: AbortSignal;
}

function withAbort<Result>(
  operation: Promise<Result>,
  signal?: AbortSignal,
): Promise<Result> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<Result>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void => finish(() => reject(abortError()));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

function sleep(delay: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, delay);
    function done(): void {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Wrap an async function with bounded exponential-backoff retries. The wrapper
 * resolves on the first successful attempt and rejects with the most recent
 * error when attempts are exhausted. Aborting rejects immediately, including
 * while an invocation or backoff delay is active.
 *
 * @param fn Async function to invoke and retry after eligible failures.
 * @param options Attempt count, backoff, jitter, filtering, and cancellation.
 * @returns A fully inferred async function with the same arguments and result.
 */
export function retry<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  options: RetryOptions = {},
): (...args: Args) => Promise<Result> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3));
  const baseDelay = Math.max(0, options.baseDelay ?? 200);
  const maxDelay = Math.max(0, options.maxDelay ?? 5_000);
  const factor = Math.max(0, options.factor ?? 2);
  const jitter = options.jitter ?? true;
  const shouldRetry = options.shouldRetry ?? (() => true);

  return async (...args: Args): Promise<Result> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (options.signal?.aborted) throw abortError();
      let operation: Promise<Result>;
      try {
        operation = Promise.resolve(fn(...args));
      } catch (error) {
        operation = Promise.reject(error);
      }
      try {
        return await withAbort(operation, options.signal);
      } catch (error) {
        if (options.signal?.aborted) throw abortError();
        lastError = error;
        if (attempt === attempts || !shouldRetry(error, attempt)) throw error;
        const backoff = Math.min(maxDelay, baseDelay * factor ** (attempt - 1));
        const delay = jitter ? Math.random() * backoff : backoff;
        await sleep(delay, options.signal);
      }
    }
    throw lastError;
  };
}
