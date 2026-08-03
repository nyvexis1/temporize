import { TemporizeAbortError, TemporizeTimeoutError } from "./errors";

/**
 * Options controlling polling completion, limits, and cancellation.
 *
 * @example
 * ```ts
 * const options: PollOptions<Job> = {
 *   until: (job) => job.status === "done",
 *   attempts: 20,
 * };
 * ```
 */
export interface PollOptions<Result> {
  /** Stop when this predicate returns true. Defaults to result truthiness. */
  until?: (result: Result) => boolean;
  /** Maximum total calls. Defaults to unlimited; values below `1` become `1`. */
  attempts?: number;
  /** Overall wall-clock budget in milliseconds. Defaults to unlimited. */
  timeout?: number;
  /** Abort active waiting and future attempts. */
  signal?: AbortSignal;
}

function race<Result>(
  operation: Promise<Result>,
  remaining: number,
  signal: AbortSignal | undefined,
  expired: TemporizeTimeoutError,
): Promise<Result> {
  if (signal?.aborted) {
    return Promise.reject(new TemporizeAbortError(signal.reason));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = Number.isFinite(remaining)
      ? setTimeout(() => finish(() => reject(expired)), Math.max(0, remaining))
      : undefined;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void =>
      finish(() => reject(new TemporizeAbortError(signal?.reason)));
    signal?.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

function pause(
  delay: number,
  remaining: number,
  signal: AbortSignal | undefined,
  expired: TemporizeTimeoutError,
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new TemporizeAbortError(signal.reason));
  }
  return new Promise((resolve, reject) => {
    const timesOut = remaining <= delay;
    const timer = setTimeout(
      () => {
        signal?.removeEventListener("abort", onAbort);
        if (timesOut) reject(expired);
        else resolve();
      },
      Math.max(0, Math.min(delay, remaining)),
    );
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new TemporizeAbortError(signal?.reason));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Poll an async function until its result satisfies a condition. By default,
 * polling stops on the first truthy result. A rejected attempt counts toward
 * the limit and polling continues, allowing transient failures to recover.
 * Exhausting either attempts or the wall-clock budget rejects with
 * `TemporizeTimeoutError` and its completed attempt count.
 *
 * @param fn Async operation to call repeatedly with the original arguments.
 * @param interval Delay in milliseconds between attempts. Negative values become `0`.
 * @param options Completion predicate, limits, and cancellation settings.
 * @param options.until Predicate deciding whether a successful result is final.
 * @param options.attempts Maximum total calls, including failed calls.
 * @param options.timeout Overall wall-clock budget across calls and waits.
 * @param options.signal Signal that aborts active waiting and future attempts.
 * @returns An inferred async function resolving with the first accepted result.
 * @example
 * ```ts
 * const waitForJob = poll(fetchJob, 500, {
 *   until: (job) => job.status === "done",
 *   timeout: 30_000,
 * });
 * const job = await waitForJob("job_123");
 * ```
 */
export function poll<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  interval: number,
  options: PollOptions<Result> = {},
): (...args: Args) => Promise<Result> {
  const delay = Math.max(0, interval || 0);
  const maxAttempts =
    options.attempts === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.floor(options.attempts) || 1);
  const budget =
    options.timeout === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, options.timeout || 0);
  const until = options.until ?? ((result: Result) => Boolean(result));

  return async (...args: Args): Promise<Result> => {
    const deadline = Date.now() + budget;
    let attempts = 0;
    let lastError: unknown;

    while (true) {
      if (options.signal?.aborted) {
        throw new TemporizeAbortError(options.signal.reason);
      }
      if (Date.now() >= deadline) {
        throw new TemporizeTimeoutError("Polling timed out", {
          attempts,
          cause: lastError,
        });
      }
      attempts += 1;
      let operation: Promise<Result>;
      try {
        operation = Promise.resolve(fn(...args));
      } catch (error) {
        operation = Promise.reject(error);
      }
      const expired = new TemporizeTimeoutError("Polling timed out", {
        attempts,
        cause: lastError,
      });
      try {
        const result = await race(
          operation,
          deadline - Date.now(),
          options.signal,
          expired,
        );
        lastError = undefined;
        if (until(result)) return result;
      } catch (error) {
        if (options.signal?.aborted) {
          throw new TemporizeAbortError(options.signal.reason);
        }
        if (error === expired) throw error;
        lastError = error;
      }
      if (attempts >= maxAttempts) {
        throw new TemporizeTimeoutError("Polling attempts exhausted", {
          attempts,
          cause: lastError,
        });
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new TemporizeTimeoutError("Polling timed out", {
          attempts,
          cause: lastError,
        });
      }
      await pause(
        delay,
        remaining,
        options.signal,
        new TemporizeTimeoutError("Polling timed out", {
          attempts,
          cause: lastError,
        }),
      );
    }
  };
}
