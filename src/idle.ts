/**
 * Options passed to idle-period scheduling.
 *
 * @example
 * ```ts
 * const options: IdleOptions = { timeout: 1_000 };
 * ```
 */
export interface IdleOptions {
  /** Maximum milliseconds to wait before the idle callback must run. */
  timeout?: number;
}

/**
 * An idle-coalesced void function that can discard scheduled work.
 *
 * @example
 * ```ts
 * const persist: IdleFunction<[State]> = idle(saveState);
 * ```
 */
export interface IdleFunction<Args extends unknown[]> {
  /** Schedule the latest arguments for the next idle period. */
  (...args: Args): void;
  /** Discard the currently scheduled idle invocation. */
  cancel(): void;
}

type IdleHost = typeof globalThis & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Coalesce repeated calls into one invocation during the next browser idle
 * period, using the latest arguments. Safari, Node, and other environments
 * without `requestIdleCallback` fall back to a 1 ms `setTimeout`.
 *
 * @param fn Non-critical function to invoke when the environment is idle.
 * @param options Optional native idle-callback timeout setting.
 * @param options.timeout Maximum wait passed to native `requestIdleCallback`.
 * @returns A void function with a `cancel` method.
 * @example
 * ```ts
 * const saveWhenIdle = idle(saveDraft, { timeout: 2_000 });
 * saveWhenIdle(draft);
 * ```
 */
export function idle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  options: IdleOptions = {},
): IdleFunction<Args> {
  const host = globalThis as IdleHost;
  const hasIdleCallback =
    typeof host.requestIdleCallback === "function" &&
    typeof host.cancelIdleCallback === "function";
  let handle: number | ReturnType<typeof setTimeout> | undefined;
  let args: Args;
  let thisArg: unknown;
  const schedule: (callback: () => void) => number | ReturnType<typeof setTimeout> =
    hasIdleCallback
      ? (callback) => host.requestIdleCallback!(callback, { timeout: options.timeout })
      : (callback) => setTimeout(callback, 1);
  const unschedule: (value: number | ReturnType<typeof setTimeout>) => void =
    hasIdleCallback
      ? (value) => host.cancelIdleCallback!(value as number)
      : (value) => clearTimeout(value);

  const wrapped = function (this: unknown, ...nextArgs: Args): void {
    args = nextArgs;
    thisArg = this;
    if (handle !== undefined) return;
    handle = schedule(() => {
      handle = undefined;
      fn.apply(thisArg, args);
    });
  } as IdleFunction<Args>;

  wrapped.cancel = () => {
    if (handle !== undefined) unschedule(handle);
    handle = undefined;
  };
  return wrapped;
}
