import { TemporizeAbortError } from "./errors";

/**
 * Options for a resettable single invocation.
 *
 * @example
 * ```ts
 * const options: OnceOptions = { resetAfter: 60_000 };
 * ```
 */
export interface OnceOptions {
  /** Allow another invocation after this many milliseconds. */
  resetAfter?: number;
  /** Reject calls made after this signal aborts. */
  signal?: AbortSignal;
}

/**
 * A promise-returning once function with reset and state inspection controls.
 *
 * @example
 * ```ts
 * const initialize: OnceFunction<[], void> = once(loadApplication);
 * ```
 */
export interface OnceFunction<Args extends unknown[], Result> {
  /** Invoke once or adopt the current invocation's shared promise. */
  (...args: Args): Promise<Awaited<Result>>;
  /** Forget the current result so the next call invokes `fn` again. */
  reset(): void;
  /** Return whether an invocation has occurred and has not been reset. */
  invoked(): boolean;
}

/**
 * Invoke a function at most once until manually or automatically reset.
 * Concurrent and later calls share the first invocation's promise. A rejected
 * invocation resets automatically so a transient failure never permanently
 * locks out future calls. When configured, `resetAfter` starts counting when
 * the invocation begins.
 *
 * @param fn Function whose value or promise should be shared after one call.
 * @param options Automatic reset and cancellation settings.
 * @param options.resetAfter Milliseconds after invocation before reopening.
 * @param options.signal Signal that rejects calls made after it aborts.
 * @returns An inferred promise-returning function with `reset` and `invoked`.
 * @example
 * ```ts
 * const initialize = once(async () => loadConfiguration());
 * const config = await initialize();
 * ```
 */
export function once<Args extends unknown[], Result>(
  fn: (...args: Args) => Result | Promise<Result>,
  options: OnceOptions = {},
): OnceFunction<Args, Result> {
  let current: Promise<Awaited<Result>> | undefined;
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  const reset = (): void => {
    if (resetTimer !== undefined) clearTimeout(resetTimer);
    resetTimer = undefined;
    current = undefined;
  };

  const observe = (promise: Promise<Awaited<Result>>): Promise<Awaited<Result>> => {
    const signal = options.signal;
    if (!signal) return promise;
    if (signal.aborted) {
      return Promise.reject(new TemporizeAbortError(signal.reason));
    }
    return new Promise((resolve, reject) => {
      const finish = (callback: () => void): void => {
        signal.removeEventListener("abort", onAbort);
        callback();
      };
      const onAbort = (): void =>
        finish(() => reject(new TemporizeAbortError(signal.reason)));
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });
  };

  const wrapped = function (this: unknown, ...args: Args): Promise<Awaited<Result>> {
    if (options.signal?.aborted) {
      return Promise.reject(new TemporizeAbortError(options.signal.reason));
    }
    if (!current) {
      let invocation: Promise<Awaited<Result>>;
      try {
        invocation = Promise.resolve(fn.apply(this, args)) as Promise<Awaited<Result>>;
      } catch (error) {
        invocation = Promise.reject(error);
      }
      current = invocation.catch((error: unknown) => {
        if (current === shared) reset();
        throw error;
      });
      const shared = current;
      if (options.resetAfter !== undefined) {
        resetTimer = setTimeout(
          () => {
            if (current === shared) reset();
          },
          Math.max(0, options.resetAfter || 0),
        );
      }
    }
    return observe(current);
  } as OnceFunction<Args, Result>;

  wrapped.reset = reset;
  wrapped.invoked = () => current !== undefined;
  return wrapped;
}
