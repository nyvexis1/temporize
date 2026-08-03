/**
 * Options for fixed-interval sampling and cancellation.
 *
 * @example
 * ```ts
 * const options: SampleOptions = { signal: controller.signal };
 * ```
 */
export interface SampleOptions {
  /** Stop scheduled sampling when this signal aborts. */
  signal?: AbortSignal;
}

/**
 * A void sampling function with lifecycle controls.
 *
 * @example
 * ```ts
 * const sampled: SampledFunction<[number], void> = sample(renderPrice, 100);
 * ```
 */
export interface SampledFunction<Args extends unknown[], Result> {
  /** Store the latest arguments for the next sampling tick. */
  (...args: Args): void;
  /** Clear the sampling clock and discard arguments waiting for a tick. */
  cancel(): void;
  /** Immediately invoke work waiting for the next tick. */
  flush(): Promise<Awaited<Result>> | undefined;
  /** Return whether new arguments are waiting for the next tick. */
  pending(): boolean;
}

/**
 * Sample the latest call arguments on a fixed clock. The clock starts lazily
 * with the first call. Each tick invokes `fn` only when new arguments arrived
 * since the previous tick, avoiding stale duplicate values. Calls return
 * `void` because most sampled calls are intentionally discarded; `flush`
 * exposes the result of an immediate pending invocation.
 *
 * @param fn Function invoked with the latest arguments available on a tick.
 * @param interval Sampling interval in milliseconds. Negative values become `0`.
 * @param options Cancellation settings for the sampling clock.
 * @param options.signal Signal that clears the clock and pending arguments.
 * @returns A void function with `cancel`, `flush`, and `pending` controls.
 * @example
 * ```ts
 * const renderPrice = sample((price: number) => updateChart(price), 100);
 * socket.addEventListener("message", (event) => renderPrice(event.data.price));
 * ```
 */
export function sample<Args extends unknown[], Result>(
  fn: (...args: Args) => Result | Promise<Result>,
  interval: number,
  options: SampleOptions = {},
): SampledFunction<Args, Result> {
  const delay = Math.max(0, interval || 0);
  let timer: ReturnType<typeof setInterval> | undefined;
  let latestArgs: Args | undefined;
  let latestThis: unknown;

  const invoke = (): Promise<Awaited<Result>> | undefined => {
    if (!latestArgs) return undefined;
    const args = latestArgs;
    const thisArg = latestThis;
    latestArgs = undefined;
    latestThis = undefined;
    try {
      return Promise.resolve(fn.apply(thisArg, args)) as Promise<Awaited<Result>>;
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const tick = (): void => {
    void invoke()?.catch(() => undefined);
  };

  const sampled = function (this: unknown, ...args: Args): void {
    if (options.signal?.aborted) return;
    latestArgs = args;
    latestThis = this;
    timer ??= setInterval(tick, delay);
  } as SampledFunction<Args, Result>;

  sampled.cancel = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    latestArgs = undefined;
    latestThis = undefined;
  };
  sampled.flush = invoke;
  sampled.pending = () => latestArgs !== undefined;
  options.signal?.addEventListener("abort", sampled.cancel, { once: true });
  return sampled;
}
