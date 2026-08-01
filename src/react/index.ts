import { useEffect, useMemo, useRef, useState } from "react";
import { TemporizeAbortError } from "../errors";
import { debounce, type DebounceOptions, type DebouncedFunction } from "../debounce";
import {
  rafThrottle,
  throttle,
  type RafThrottledFunction,
  type ThrottleOptions,
} from "../throttle";

function ignoreAbort(error: unknown): void {
  if (!(error instanceof TemporizeAbortError)) {
    throw error;
  }
}

/**
 * Create a stable debounced callback that always invokes the latest `fn` and
 * automatically cancels pending work on unmount. Its identity changes only
 * when `wait` or a semantic debounce option changes.
 *
 * @param fn Callback to debounce. Sync and async return values are preserved.
 * @param wait Quiet period in milliseconds.
 * @param options Leading, trailing, maximum-wait, and cancellation settings.
 * @param options.leading Whether to invoke on the leading edge.
 * @param options.trailing Whether to invoke on the trailing edge.
 * @param options.maxWait Maximum time repeated calls may postpone invocation.
 * @param options.signal Signal that cancels scheduled and future calls.
 * @returns A fully inferred debounced function with lifecycle methods.
 * @example
 * ```tsx
 * const save = useDebounce(saveDraft, 300);
 * ```
 */
export function useDebounce<Args extends unknown[], Result>(
  fn: (...args: Args) => Result | PromiseLike<Result>,
  wait: number,
  options: DebounceOptions = {},
): DebouncedFunction<Args, Awaited<Result>> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const { leading, trailing, maxWait, signal } = options;
  const wrapped = useMemo(
    () =>
      debounce((...args: Args) => fnRef.current(...args), wait, {
        leading,
        trailing,
        maxWait,
        signal,
      }),
    [wait, leading, trailing, maxWait, signal],
  );

  useEffect(() => () => wrapped.cancel(), [wrapped]);
  return wrapped;
}

/**
 * Create a stable throttled callback that always invokes the latest `fn` and
 * automatically cancels pending work on unmount. Its identity changes only
 * when `wait` or a semantic throttle option changes.
 *
 * @param fn Callback to throttle. Sync and async return values are preserved.
 * @param wait Minimum interval between invocations in milliseconds.
 * @param options Leading, trailing, and cancellation settings.
 * @param options.leading Whether to invoke on the leading edge.
 * @param options.trailing Whether to invoke on the trailing edge.
 * @param options.signal Signal that cancels scheduled and future calls.
 * @returns A fully inferred throttled function with lifecycle methods.
 * @example
 * ```tsx
 * const onScroll = useThrottle(updatePosition, 100);
 * ```
 */
export function useThrottle<Args extends unknown[], Result>(
  fn: (...args: Args) => Result | PromiseLike<Result>,
  wait: number,
  options: ThrottleOptions = {},
): DebouncedFunction<Args, Awaited<Result>> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const { leading, trailing, signal } = options;
  const wrapped = useMemo(
    () =>
      throttle((...args: Args) => fnRef.current(...args), wait, {
        leading,
        trailing,
        signal,
      }),
    [wait, leading, trailing, signal],
  );

  useEffect(() => () => wrapped.cancel(), [wrapped]);
  return wrapped;
}

/**
 * Return a value that follows `value` only after it remains unchanged for the
 * debounce interval. The initial value is available immediately, making this
 * suitable for search inputs and effects that should ignore rapid updates.
 *
 * @param value Value to debounce.
 * @param wait Quiet period in milliseconds.
 * @param options Standard debounce timing and cancellation settings.
 * @param options.leading Whether to update on the leading edge.
 * @param options.trailing Whether to update on the trailing edge.
 * @param options.maxWait Maximum time repeated changes may postpone an update.
 * @param options.signal Signal that cancels scheduled updates.
 * @returns The latest value whose debounce interval has completed.
 * @example
 * ```tsx
 * const query = useDebouncedValue(input, 250);
 * ```
 */
export function useDebouncedValue<Value>(
  value: Value,
  wait: number,
  options: DebounceOptions = {},
): Value {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const update = useDebounce(
    (nextValue: Value) => setDebouncedValue(() => nextValue),
    wait,
    options,
  );

  useEffect(() => {
    void update(value).catch(ignoreAbort);
  }, [value, update]);

  return debouncedValue;
}

/**
 * Create a stable animation-frame-throttled callback that invokes the latest
 * `fn` and automatically cancels a scheduled frame on unmount.
 *
 * @param fn Callback to coalesce to one invocation per animation frame.
 * @returns A stable void callback with a `cancel` method.
 * @example
 * ```tsx
 * const onPointerMove = useRafThrottle(updatePointer);
 * ```
 */
export function useRafThrottle<Args extends unknown[]>(
  fn: (...args: Args) => void,
): RafThrottledFunction<Args> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const wrapped = useMemo(
    () => rafThrottle((...args: Args) => fnRef.current(...args)),
    [],
  );

  useEffect(() => () => wrapped.cancel(), [wrapped]);
  return wrapped;
}
