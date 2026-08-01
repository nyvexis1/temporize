import {
  abortError,
  debounce,
  type DebounceOptions,
  type DebouncedFunction,
} from "./debounce";

/** Policy used when a debounced async invocation overlaps active work. */
export type AsyncOverlap = "queue" | "drop" | "cancel-previous";

/** Options for async debouncing with explicit overlap handling. */
export interface DebounceAsyncOptions extends DebounceOptions {
  /** How to handle a firing while earlier async work is running. Defaults to `queue`. */
  overlap?: AsyncOverlap;
}

/** Remove a required trailing `AbortSignal` from a function's public call arguments. */
export type DebounceAsyncArguments<Fn extends (...args: never[]) => unknown> =
  Parameters<Fn> extends [...infer Args, AbortSignal] ? Args : Parameters<Fn>;

/** Promise-returning async debouncer with standard debounce lifecycle controls. */
export type DebouncedAsyncFunction<Fn extends (...args: never[]) => unknown> =
  DebouncedFunction<DebounceAsyncArguments<Fn>, Awaited<ReturnType<Fn>>>;

type Queued<Result> = {
  run: () => Promise<Result>;
  resolve: (value: Result | PromiseLike<Result>) => void;
  reject: (reason?: unknown) => void;
};

/**
 * Debounce an async function and control what happens when a new invocation
 * fires before the previous one settles. With `cancel-previous`, declare a
 * required `AbortSignal` as the wrapped function's final parameter; the public
 * debounced function omits it and supplies an internally managed signal.
 * Functions without that parameter may also use the mode because extra
 * JavaScript arguments are ignored.
 *
 * @param fn Async function to debounce, optionally ending in `AbortSignal`.
 * @param wait Quiet period in milliseconds.
 * @param options Standard debounce settings plus an overlap policy.
 * @returns An inferred promise-returning function with lifecycle controls.
 */
export function debounceAsync<Fn extends (...args: never[]) => unknown>(
  fn: Fn,
  wait: number,
  options: DebounceAsyncOptions = {},
): DebouncedAsyncFunction<Fn> {
  type Args = DebounceAsyncArguments<Fn>;
  type Result = Awaited<ReturnType<Fn>>;
  const overlap = options.overlap ?? "queue";
  const queued: Queued<Result>[] = [];
  let active: Promise<Result> | undefined;
  let controller: AbortController | undefined;

  const start = (args: Args, thisArg: unknown): Promise<Result> => {
    controller = new AbortController();
    try {
      const callArgs = overlap === "cancel-previous"
        ? [...args, controller.signal]
        : args;
      return Promise.resolve(fn.apply(thisArg, callArgs as Parameters<Fn>)) as Promise<Result>;
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const runNext = (): void => {
    const item = queued.shift();
    if (!item) {
      active = undefined;
      controller = undefined;
      return;
    }
    const current = item.run();
    active = current;
    current.then(item.resolve, item.reject);
    monitor(current);
  };

  const monitor = (current: Promise<Result>): void => {
    const complete = (): void => {
      if (active === current) runNext();
    };
    current.then(complete, complete);
  };

  const dispatch = function (this: unknown, ...args: Args): Promise<Result> {
    const thisArg = this;
    if (!active) {
      const current = start(args, thisArg);
      active = current;
      monitor(current);
      return current;
    }
    if (overlap === "drop") return active;
    if (overlap === "cancel-previous") {
      controller?.abort();
      const current = start(args, thisArg);
      active = current;
      monitor(current);
      return current;
    }
    return new Promise<Result>((resolve, reject) => {
      queued.push({ run: () => start(args, thisArg), resolve, reject });
    });
  };

  const scheduled = debounce(dispatch, wait, options) as DebouncedAsyncFunction<Fn>;
  const cancelScheduled = scheduled.cancel;
  scheduled.cancel = () => {
    cancelScheduled();
    const error = abortError();
    for (const item of queued.splice(0)) item.reject(error);
  };
  return scheduled;
}
