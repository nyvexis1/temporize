/** Options that control when a debounced function is invoked. */
export interface DebounceOptions {
  /** Invoke on the leading edge of the wait window. Defaults to `false`. */
  leading?: boolean;
  /** Invoke on the trailing edge of the wait window. Defaults to `true`. */
  trailing?: boolean;
  /** Guarantee an invocation after this many milliseconds of repeated calls. */
  maxWait?: number;
  /** Cancel pending work when this signal aborts and reject later calls. */
  signal?: AbortSignal;
}

/** A promise-returning debounced function with lifecycle controls. */
export interface DebouncedFunction<Args extends unknown[], Result> {
  /** Schedule an invocation and resolve with the wrapped function's result. */
  (...args: Args): Promise<Result>;
  /** Reject all calls waiting for an invocation and clear active timers. */
  cancel(): void;
  /** Immediately run pending trailing work, returning its shared promise. */
  flush(): Promise<Result> | undefined;
  /** Return whether an invocation is currently scheduled. */
  pending(): boolean;
}

type Deferred<Result> = {
  resolve: (value: Result | PromiseLike<Result>) => void;
  reject: (reason?: unknown) => void;
};

/** Create a portable abort-shaped error for internal cancellation paths. @internal */
export function abortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("The operation was aborted", "AbortError");
  }
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

/**
 * Delay a function until calls stop for `wait` milliseconds while preserving
 * its inferred arguments, `this` value, return value, and errors. Calls that
 * belong to the same invocation share its result through separate promises.
 *
 * @param fn Function to debounce. It may return either a value or a promise.
 * @param wait Quiet period in milliseconds. Negative values are treated as `0`.
 * @param options Leading, trailing, maximum-wait, and cancellation settings.
 * @returns A promise-returning function with `cancel`, `flush`, and `pending`.
 */
export function debounce<Args extends unknown[], Result>(
  fn: (...args: Args) => Result | PromiseLike<Result>,
  wait: number,
  options: DebounceOptions = {},
): DebouncedFunction<Args, Awaited<Result>> {
  const delay = Math.max(0, wait || 0);
  const leading = options.leading ?? false;
  const trailing = options.trailing ?? true;
  const hasMaxWait = options.maxWait !== undefined;
  const maxWait = hasMaxWait ? Math.max(delay, options.maxWait ?? 0) : 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Args | undefined;
  let lastThis: unknown;
  let lastCallTime: number | undefined;
  let lastInvokeTime = 0;
  let waiters: Deferred<Awaited<Result>>[] = [];
  let lastResult: Promise<Awaited<Result>> | undefined;

  const settle = (
    deferred: Deferred<Awaited<Result>>[],
    promise: Promise<Awaited<Result>>,
  ): void => {
    for (const item of deferred) promise.then(item.resolve, item.reject);
  };

  const invoke = (time: number): Promise<Awaited<Result>> => {
    const args = lastArgs as Args;
    const thisArg = lastThis;
    const deferred = waiters;
    lastArgs = undefined;
    lastThis = undefined;
    waiters = [];
    lastInvokeTime = time;
    try {
      lastResult = Promise.resolve(fn.apply(thisArg, args)) as Promise<Awaited<Result>>;
    } catch (error) {
      lastResult = Promise.reject(error);
    }
    settle(deferred, lastResult);
    return lastResult;
  };

  const shouldInvoke = (time: number): boolean => {
    const sinceCall = time - (lastCallTime ?? time);
    const sinceInvoke = time - lastInvokeTime;
    return (
      lastCallTime === undefined ||
      sinceCall >= delay ||
      sinceCall < 0 ||
      (hasMaxWait && sinceInvoke >= maxWait)
    );
  };

  const remainingWait = (time: number): number => {
    const sinceCall = time - (lastCallTime ?? time);
    const normal = delay - sinceCall;
    return hasMaxWait ? Math.min(normal, maxWait - (time - lastInvokeTime)) : normal;
  };

  const trailingEdge = (time: number): Promise<Awaited<Result>> | undefined => {
    timer = undefined;
    if (trailing && lastArgs) return invoke(time);
    if (waiters.length && lastResult) settle(waiters.splice(0), lastResult);
    lastArgs = undefined;
    lastThis = undefined;
    return lastResult;
  };

  const timerExpired = (): void => {
    const time = Date.now();
    if (shouldInvoke(time)) {
      trailingEdge(time);
    } else {
      timer = setTimeout(timerExpired, Math.max(0, remainingWait(time)));
    }
  };

  const leadingEdge = (time: number): Promise<Awaited<Result>> | undefined => {
    lastInvokeTime = time;
    timer = setTimeout(timerExpired, delay);
    return leading ? invoke(time) : lastResult;
  };

  const cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    lastArgs = undefined;
    lastThis = undefined;
    lastCallTime = undefined;
    lastInvokeTime = 0;
    const error = abortError();
    for (const item of waiters.splice(0)) item.reject(error);
  };

  const debounced = function (this: unknown, ...args: Args): Promise<Awaited<Result>> {
    if (options.signal?.aborted) return Promise.reject(abortError());
    const time = Date.now();
    const invokeNow = shouldInvoke(time);
    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    const promise = new Promise<Awaited<Result>>((resolve, reject) => {
      waiters.push({ resolve, reject });
    });

    if (invokeNow) {
      if (timer === undefined) {
        leadingEdge(time);
      } else if (hasMaxWait) {
        clearTimeout(timer);
        timer = setTimeout(timerExpired, delay);
        invoke(time);
      }
    }
    if (timer === undefined) timer = setTimeout(timerExpired, delay);
    return promise;
  } as DebouncedFunction<Args, Awaited<Result>>;

  debounced.cancel = cancel;
  debounced.flush = () => {
    if (timer === undefined) return lastResult;
    clearTimeout(timer);
    return trailingEdge(Date.now());
  };
  debounced.pending = () => timer !== undefined && lastArgs !== undefined;
  options.signal?.addEventListener("abort", cancel, { once: true });
  return debounced;
}
