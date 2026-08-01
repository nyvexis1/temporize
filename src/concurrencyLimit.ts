import { TemporizeAbortError } from "./errors";

/**
 * Options that control cancellation for a concurrency-limited function.
 *
 * @example
 * ```ts
 * const options: ConcurrencyLimitOptions = { signal: controller.signal };
 * ```
 */
export interface ConcurrencyLimitOptions {
  /** Reject queued and future calls when this signal aborts. */
  signal?: AbortSignal;
}

/**
 * An async function with concurrency and queue inspection controls.
 *
 * @example
 * ```ts
 * const limited: ConcurrencyLimitedFunction<[string], void> =
 *   concurrencyLimit(async (path) => upload(path), 3);
 * ```
 */
export interface ConcurrencyLimitedFunction<Args extends unknown[], Result> {
  /** Queue a call or start it immediately when a slot is available. */
  (...args: Args): Promise<Result>;
  /** Reject queued calls without interrupting calls already in flight. */
  cancel(): void;
  /** Return the number of calls currently running. */
  pending(): number;
  /** Return the number of calls waiting for a slot. */
  queued(): number;
}

type QueueItem<Args extends unknown[], Result> = {
  args: Args;
  thisArg: unknown;
  resolve: (value: Result | PromiseLike<Result>) => void;
  reject: (reason?: unknown) => void;
};

/**
 * Limit an async function to a maximum number of simultaneous invocations.
 * Excess calls wait in FIFO order. Cancellation rejects only calls that have
 * not started; work already in flight always settles naturally.
 *
 * @param fn Async function whose concurrency should be limited.
 * @param max Positive integer maximum number of calls allowed in flight.
 * @param options Cancellation settings for queued and future calls.
 * @param options.signal Signal that rejects queued and future calls when aborted.
 * @returns An inferred async function with `cancel`, `pending`, and `queued`.
 * @example
 * ```ts
 * const uploadThreeAtOnce = concurrencyLimit(uploadFile, 3);
 * await Promise.all(files.map(uploadThreeAtOnce));
 * ```
 */
export function concurrencyLimit<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  max: number,
  options: ConcurrencyLimitOptions = {},
): ConcurrencyLimitedFunction<Args, Result> {
  if (!Number.isInteger(max) || max < 1) {
    throw new TypeError("max must be a positive integer");
  }

  const queue: QueueItem<Args, Result>[] = [];
  let running = 0;
  let aborted = options.signal?.aborted ?? false;

  const drain = (): void => {
    while (!aborted && running < max && queue.length > 0) {
      const item = queue.shift()!;
      running += 1;
      let result: Promise<Result>;
      try {
        result = Promise.resolve(fn.apply(item.thisArg, item.args));
      } catch (error) {
        result = Promise.reject(error);
      }
      result.then(item.resolve, item.reject).finally(() => {
        running -= 1;
        drain();
      });
    }
  };

  const rejectQueued = (reason?: unknown): void => {
    const error = new TemporizeAbortError(reason);
    for (const item of queue.splice(0)) item.reject(error);
  };

  const limited = function (this: unknown, ...args: Args): Promise<Result> {
    if (aborted || options.signal?.aborted) {
      return Promise.reject(new TemporizeAbortError(options.signal?.reason));
    }
    const promise = new Promise<Result>((resolve, reject) => {
      queue.push({ args, thisArg: this, resolve, reject });
    });
    drain();
    return promise;
  } as ConcurrencyLimitedFunction<Args, Result>;

  limited.cancel = () => rejectQueued();
  limited.pending = () => running;
  limited.queued = () => queue.length;
  options.signal?.addEventListener(
    "abort",
    () => {
      aborted = true;
      rejectQueued(options.signal?.reason);
    },
    { once: true },
  );
  return limited;
}
