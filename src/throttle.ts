import { debounce, type DebouncedFunction } from "./debounce";
import { TemporizeAbortError } from "./errors";

/**
 * Options that control standard throttling behavior.
 *
 * @example
 * ```ts
 * const options: ThrottleOptions = { leading: true, trailing: true };
 * ```
 */
export interface ThrottleOptions {
  /** Invoke immediately at the start of a window. Defaults to `true`. */
  leading?: boolean;
  /** Invoke once more with the latest arguments at the end. Defaults to `true`. */
  trailing?: boolean;
  /** Cancel queued work when this signal aborts and reject later calls. */
  signal?: AbortSignal;
}

/**
 * A frame-coalesced function that can discard its scheduled invocation.
 *
 * @example
 * ```ts
 * const draw: RafThrottledFunction<[number]> = rafThrottle(renderAt);
 * ```
 */
export interface RafThrottledFunction<Args extends unknown[]> {
  /** Schedule the latest arguments for the next animation frame. */
  (...args: Args): void;
  /** Discard the currently scheduled frame invocation. */
  cancel(): void;
}

/**
 * Options for a promise queue that drains at a fixed rate.
 *
 * @example
 * ```ts
 * const options: ThrottlePromiseOptions = { leading: false };
 * ```
 */
export interface ThrottlePromiseOptions {
  /** Run the first queued call immediately. Defaults to `true`. */
  leading?: boolean;
  /** Reject queued work when this signal aborts and reject later calls. */
  signal?: AbortSignal;
}

/**
 * A rate-limited promise queue with lifecycle and queue inspection methods.
 *
 * @example
 * ```ts
 * const send: ThrottledPromiseFunction<[Event], void> =
 *   throttlePromise(postEvent, 100);
 * ```
 */
export interface ThrottledPromiseFunction<Args extends unknown[], Result> {
  /** Add a call to the FIFO queue and resolve with that call's own result. */
  (...args: Args): Promise<Result>;
  /** Reject every call that has not started and clear the drain timer. */
  cancel(): void;
  /** Immediately start the next queued call, if any. */
  flush(): Promise<Result> | undefined;
  /** Return whether calls are queued or a drain timer is active. */
  pending(): boolean;
  /** Return the number of calls waiting to start, excluding active work. */
  queued(): number;
}

type QueueItem<Args extends unknown[], Result> = {
  args: Args;
  thisArg: unknown;
  resolve: (value: Result | PromiseLike<Result>) => void;
  reject: (reason?: unknown) => void;
};

/**
 * Limit a function to at most one invocation per `wait` milliseconds. Promise
 * results preserve the wrapped function's inferred value and error types.
 *
 * @param fn Function to throttle. It may return either a value or a promise.
 * @param wait Minimum interval between invocations in milliseconds.
 * @param options Leading, trailing, and cancellation settings.
 * @param options.leading Whether to invoke on the leading edge.
 * @param options.trailing Whether to invoke on the trailing edge.
 * @param options.signal Signal that cancels scheduled and future calls.
 * @returns A promise-returning function with `cancel`, `flush`, and `pending`.
 * @example
 * ```ts
 * const save = throttle(saveDraft, 500, { trailing: true });
 * await save(document);
 * ```
 */
export function throttle<Args extends unknown[], Result>(
  fn: (...args: Args) => Result | PromiseLike<Result>,
  wait: number,
  options: ThrottleOptions = {},
): DebouncedFunction<Args, Awaited<Result>> {
  const delay = Math.max(0, wait || 0);
  return debounce(fn, delay, {
    leading: options.leading ?? true,
    trailing: options.trailing ?? true,
    maxWait: delay,
    signal: options.signal,
  });
}

/**
 * Coalesce repeated calls into one invocation per animation frame using the
 * latest arguments. Environments without animation frames use `setTimeout`
 * with a 16 ms delay, making the helper safe during SSR and in Node.
 *
 * @param fn Function to invoke once per frame.
 * @returns A void function with a `cancel` method.
 * @example
 * ```ts
 * const draw = rafThrottle((x: number) => renderAt(x));
 * window.addEventListener("pointermove", (event) => draw(event.clientX));
 * ```
 */
export function rafThrottle<Args extends unknown[]>(
  fn: (...args: Args) => void,
): RafThrottledFunction<Args> {
  let handle: number | ReturnType<typeof setTimeout> | undefined;
  let args: Args;
  let thisArg: unknown;
  const hasRaf = typeof globalThis.requestAnimationFrame === "function";
  const schedule: (
    callback: FrameRequestCallback,
  ) => number | ReturnType<typeof setTimeout> = hasRaf
    ? (callback) => globalThis.requestAnimationFrame(callback)
    : (callback: FrameRequestCallback): ReturnType<typeof setTimeout> =>
        setTimeout(() => callback(Date.now()), 16);
  const unschedule: (id: number | ReturnType<typeof setTimeout>) => void = hasRaf
    ? (id) => globalThis.cancelAnimationFrame(id as number)
    : (id) => clearTimeout(id);

  const throttled = function (this: unknown, ...nextArgs: Args): void {
    args = nextArgs;
    thisArg = this;
    if (handle !== undefined) return;
    handle = schedule(() => {
      handle = undefined;
      fn.apply(thisArg, args);
    });
  } as RafThrottledFunction<Args>;

  throttled.cancel = () => {
    if (handle !== undefined) unschedule(handle);
    handle = undefined;
  };
  return throttled;
}

/**
 * Queue every call and start one per `wait` millisecond window. Unlike regular
 * throttling, no call is coalesced or dropped, which suits API rate limiting.
 * Async calls may remain in flight concurrently; only their start times are
 * rate-limited.
 *
 * @param fn Function whose calls should be rate-limited.
 * @param wait Minimum interval between call start times in milliseconds.
 * @param options Initial timing and cancellation settings.
 * @param options.leading Whether the first queued call starts immediately.
 * @param options.signal Signal that rejects queued and future calls.
 * @returns A FIFO promise queue with `cancel`, `flush`, `pending`, and `queued`.
 * @example
 * ```ts
 * const send = throttlePromise(postEvent, 100);
 * await Promise.all(events.map(send));
 * ```
 */
export function throttlePromise<Args extends unknown[], Result>(
  fn: (...args: Args) => Result | PromiseLike<Result>,
  wait: number,
  options: ThrottlePromiseOptions = {},
): ThrottledPromiseFunction<Args, Awaited<Result>> {
  const delay = Math.max(0, wait || 0);
  const queue: QueueItem<Args, Awaited<Result>>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastStart = 0;

  const schedule = (): void => {
    if (timer !== undefined || queue.length === 0) return;
    const remaining = Math.max(0, delay - (Date.now() - lastStart));
    timer = setTimeout(drain, remaining);
  };

  const drain = (): Promise<Awaited<Result>> | undefined => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const item = queue.shift();
    if (!item) return undefined;
    lastStart = Date.now();
    let result: Promise<Awaited<Result>>;
    try {
      result = Promise.resolve(fn.apply(item.thisArg, item.args)) as Promise<
        Awaited<Result>
      >;
    } catch (error) {
      result = Promise.reject(error);
    }
    result.then(item.resolve, item.reject);
    schedule();
    return result;
  };

  const cancel = (reason?: unknown): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const error = new TemporizeAbortError(reason);
    for (const item of queue.splice(0)) item.reject(error);
  };

  const throttled = function (this: unknown, ...args: Args): Promise<Awaited<Result>> {
    if (options.signal?.aborted) {
      return Promise.reject(new TemporizeAbortError(options.signal.reason));
    }
    const firstCall = lastStart === 0 && timer === undefined && queue.length === 0;
    const promise = new Promise<Awaited<Result>>((resolve, reject) => {
      queue.push({ args, thisArg: this, resolve, reject });
    });
    if (firstCall && (options.leading ?? true)) drain();
    else {
      if (firstCall) lastStart = Date.now();
      schedule();
    }
    return promise;
  } as ThrottledPromiseFunction<Args, Awaited<Result>>;

  throttled.cancel = () => cancel();
  throttled.flush = drain;
  throttled.pending = () => queue.length > 0 || timer !== undefined;
  throttled.queued = () => queue.length;
  options.signal?.addEventListener("abort", () => cancel(options.signal?.reason), {
    once: true,
  });
  return throttled;
}
