import { abortError } from "./debounce";

/** Options that control batch timing, capacity, and cancellation. */
export interface BatchOptions {
  /** Fire immediately when this many calls are queued. Values below `1` become `1`. */
  maxSize?: number;
  /** Cancel queued work when this signal aborts and reject later calls. */
  signal?: AbortSignal;
}

/** A promise-returning batched function with queue lifecycle controls. */
export interface BatchedFunction<Args extends unknown[], Result> {
  /** Queue one argument tuple and resolve with the shared result for its batch. */
  (...args: Args): Promise<Result>;
  /** Reject every queued caller and clear the active batch timer. */
  cancel(): void;
  /** Immediately invoke the queued batch, returning its shared promise. */
  flush(): Promise<Result> | undefined;
  /** Return whether one or more calls are waiting in the current batch. */
  pending(): boolean;
  /** Return the number of argument tuples currently queued. */
  size(): number;
}

type Deferred<Result> = {
  resolve: (value: Result | PromiseLike<Result>) => void;
  reject: (reason?: unknown) => void;
};

/**
 * Collect calls made during a time window and invoke `fn` once with every
 * argument tuple. Each caller in that batch receives a separate promise, but
 * all of those promises settle with the same invocation result or error.
 *
 * @param fn Function that receives all queued argument tuples at once.
 * @param wait Collection window in milliseconds. Negative values become `0`.
 * @param options Maximum batch size and cancellation settings.
 * @returns A batched function with `cancel`, `flush`, `pending`, and `size`.
 */
export function batch<Args extends unknown[], Result>(
  fn: (calls: Args[]) => Result | PromiseLike<Result>,
  wait: number,
  options: BatchOptions = {},
): BatchedFunction<Args, Result> {
  const delay = Math.max(0, wait || 0);
  const maxSize = options.maxSize === undefined
    ? Infinity
    : Math.max(1, Math.floor(options.maxSize || 1));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let calls: Args[] = [];
  let waiters: Deferred<Result>[] = [];
  let lastResult: Promise<Result> | undefined;

  const invoke = (): Promise<Result> | undefined => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (calls.length === 0) return lastResult;
    const queuedCalls = calls;
    const queuedWaiters = waiters;
    calls = [];
    waiters = [];
    try {
      lastResult = Promise.resolve(fn(queuedCalls)) as Promise<Result>;
    } catch (error) {
      lastResult = Promise.reject(error);
    }
    for (const waiter of queuedWaiters) {
      lastResult.then(waiter.resolve, waiter.reject);
    }
    return lastResult;
  };

  const cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    calls = [];
    const error = abortError();
    for (const waiter of waiters.splice(0)) waiter.reject(error);
  };

  const batched = function (...args: Args): Promise<Result> {
    if (options.signal?.aborted) return Promise.reject(abortError());
    calls.push(args);
    const promise = new Promise<Result>((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
    if (calls.length >= maxSize) {
      invoke();
    } else if (timer === undefined) {
      timer = setTimeout(invoke, delay);
    }
    return promise;
  } as BatchedFunction<Args, Result>;

  batched.cancel = cancel;
  batched.flush = invoke;
  batched.pending = () => calls.length > 0;
  batched.size = () => calls.length;
  options.signal?.addEventListener("abort", cancel, { once: true });
  return batched;
}
