import { debounce, type DebounceOptions, type DebouncedFunction } from "./debounce";
import { TemporizeAbortError } from "./errors";

/**
 * Policy used when a debounced async invocation overlaps active work.
 *
 * @example
 * ```ts
 * const overlap: AsyncOverlap = "cancel-previous";
 * ```
 */
export type AsyncOverlap = "queue" | "drop" | "cancel-previous";

/**
 * Options for async debouncing with explicit overlap handling.
 *
 * @example
 * ```ts
 * const options: DebounceAsyncOptions = { overlap: "queue" };
 * ```
 */
export interface DebounceAsyncOptions extends DebounceOptions {
  /** How to handle a firing while earlier async work is running. Defaults to `queue`. */
  overlap?: AsyncOverlap;
}

/**
 * Remove a required trailing `AbortSignal` from a function's public call arguments.
 *
 * @example
 * ```ts
 * type Args = DebounceAsyncArguments<(query: string, signal: AbortSignal) => Promise<void>>;
 * ```
 */
export type DebounceAsyncArguments<Fn extends (...args: never[]) => unknown> =
  Parameters<Fn> extends [...infer Args, AbortSignal] ? Args : Parameters<Fn>;

/**
 * Promise-returning async debouncer with standard debounce lifecycle controls.
 *
 * @example
 * ```ts
 * type Search = DebouncedAsyncFunction<(query: string) => Promise<string[]>>;
 * ```
 */
export type DebouncedAsyncFunction<Fn extends (...args: never[]) => unknown> =
  DebouncedFunction<DebounceAsyncArguments<Fn>, Awaited<ReturnType<Fn>>>;

type Queued<Result> = {
  run: () => Promise<Result>;
  resolve: (value: Result | PromiseLike<Result>) => void;
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
 * @param options.leading Whether to invoke on the leading edge.
 * @param options.trailing Whether to invoke on the trailing edge.
 * @param options.maxWait Maximum time repeated calls may postpone invocation.
 * @param options.signal Signal that rejects scheduled, queued, and future calls.
 * @param options.overlap Policy used when a firing overlaps active work.
 * @returns An inferred promise-returning function with lifecycle controls.
 * @example
 * ```ts
 * const search = debounceAsync(fetchResults, 250, { overlap: "queue" });
 * const results = await search("temporize");
 * ```
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
      const callArgs =
        overlap === "cancel-previous" ? [...args, controller.signal] : args;
      return Promise.resolve(
        fn.apply(thisArg, callArgs as Parameters<Fn>),
      ) as Promise<Result>;
    } catch (error) {
      return Promise.reject(error);
    }
  };

  // Mark `current` as the active job and start the next queued job once it settles.
  const track = (current: Promise<Result>): Promise<Result> => {
    active = current;
    const complete = (): void => {
      if (active !== current) return;
      active = undefined;
      const item = queued.shift();
      if (!item) return;
      item.resolve(track(item.run()));
    };
    current.then(complete, complete);
    return current;
  };

  const dispatch = function (this: unknown, ...args: Args): Promise<Result> {
    if (active && overlap === "drop") return active;
    if (active && overlap === "queue") {
      return new Promise<Result>((resolve) => {
        queued.push({ run: () => start(args, this), resolve });
      });
    }
    if (active) controller?.abort();
    return track(start(args, this));
  };

  const scheduled = debounce(dispatch, wait, options) as DebouncedAsyncFunction<Fn>;
  const cancelScheduled = scheduled.cancel;
  scheduled.cancel = () => {
    cancelScheduled();
    const error = new TemporizeAbortError(options.signal?.reason);
    for (const item of queued.splice(0)) item.resolve(Promise.reject(error));
  };
  return scheduled;
}
