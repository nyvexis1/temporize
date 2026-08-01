import { useEffect, useMemo, useRef, useState } from "react";
import {
  debounce,
  type DebounceOptions,
  type DebouncedFunction,
} from "../debounce";
import {
  rafThrottle,
  throttle,
  type RafThrottledFunction,
  type ThrottleOptions,
} from "../throttle";

function ignoreAbort(error: unknown): void {
  if (!(typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")) {
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
 * @returns A fully inferred debounced function with lifecycle methods.
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
    () => debounce((...args: Args) => fnRef.current(...args), wait, {
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
 * @returns A fully inferred throttled function with lifecycle methods.
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
    () => throttle((...args: Args) => fnRef.current(...args), wait, {
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
 * @returns The latest value whose debounce interval has completed.
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
