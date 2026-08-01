import { onUnmounted, shallowRef, unref, watch, type Ref } from "vue";
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

function readValue<Value>(value: Value | Ref<Value> | (() => Value)): Value {
  return typeof value === "function"
    ? (value as () => Value)()
    : (unref(value) as Value);
}

/**
 * Create a debounced Vue callback and automatically cancel pending work when
 * the current component scope unmounts.
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
 * ```ts
 * const save = useDebounce(saveDraft, 300);
 * ```
 */
export function useDebounce<Args extends unknown[], Result>(
  fn: (...args: Args) => Result | PromiseLike<Result>,
  wait: number,
  options: DebounceOptions = {},
): DebouncedFunction<Args, Awaited<Result>> {
  const wrapped = debounce(fn, wait, options);
  onUnmounted(wrapped.cancel);
  return wrapped;
}

/**
 * Create a throttled Vue callback and automatically cancel pending work when
 * the current component scope unmounts.
 *
 * @param fn Callback to throttle. Sync and async return values are preserved.
 * @param wait Minimum interval between invocations in milliseconds.
 * @param options Leading, trailing, and cancellation settings.
 * @param options.leading Whether to invoke on the leading edge.
 * @param options.trailing Whether to invoke on the trailing edge.
 * @param options.signal Signal that cancels scheduled and future calls.
 * @returns A fully inferred throttled function with lifecycle methods.
 * @example
 * ```ts
 * const onScroll = useThrottle(updatePosition, 100);
 * ```
 */
export function useThrottle<Args extends unknown[], Result>(
  fn: (...args: Args) => Result | PromiseLike<Result>,
  wait: number,
  options: ThrottleOptions = {},
): DebouncedFunction<Args, Awaited<Result>> {
  const wrapped = throttle(fn, wait, options);
  onUnmounted(wrapped.cancel);
  return wrapped;
}

/**
 * Create a writable ref that follows a raw value, ref, computed value, or
 * getter only after it remains unchanged for the debounce interval. The
 * returned ref can be consumed anywhere a normal Vue ref is accepted.
 *
 * @param value Reactive or non-reactive value source to debounce.
 * @param wait Quiet period in milliseconds.
 * @param options Standard debounce timing and cancellation settings.
 * @param options.leading Whether to update on the leading edge.
 * @param options.trailing Whether to update on the trailing edge.
 * @param options.maxWait Maximum time repeated changes may postpone an update.
 * @param options.signal Signal that cancels scheduled updates.
 * @returns A writable ref containing the latest settled source value.
 * @example
 * ```ts
 * const query = useDebouncedRef(searchInput, 250);
 * ```
 */
export function useDebouncedRef<Value>(
  value: Value | Ref<Value> | (() => Value),
  wait: number,
  options: DebounceOptions = {},
): Ref<Value> {
  const debouncedValue = shallowRef(readValue(value)) as Ref<Value>;
  const update = useDebounce(
    (nextValue: Value) => {
      debouncedValue.value = nextValue;
    },
    wait,
    options,
  );
  const stop = watch(
    () => readValue(value),
    (nextValue) => {
      void update(nextValue).catch(ignoreAbort);
    },
    { flush: "sync" },
  );

  onUnmounted(stop);
  return debouncedValue;
}

/**
 * Create an animation-frame-throttled Vue callback and automatically cancel
 * its scheduled frame when the current component scope unmounts.
 *
 * @param fn Callback to coalesce to one invocation per animation frame.
 * @returns A void callback with a `cancel` method.
 * @example
 * ```ts
 * const onPointerMove = useRafThrottle(updatePointer);
 * ```
 */
export function useRafThrottle<Args extends unknown[]>(
  fn: (...args: Args) => void,
): RafThrottledFunction<Args> {
  const wrapped = rafThrottle(fn);
  onUnmounted(wrapped.cancel);
  return wrapped;
}
