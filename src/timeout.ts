import { TemporizeAbortError, TemporizeTimeoutError } from "./errors";

/**
 * Options for a time-bounded async invocation.
 *
 * @example
 * ```ts
 * const options: TimeoutOptions = { signal: controller.signal };
 * ```
 */
export interface TimeoutOptions {
  /** Reject active and future calls when this signal aborts. */
  signal?: AbortSignal;
}

/**
 * Remove a final required or optional `AbortSignal` from a function's public arguments.
 *
 * @example
 * ```ts
 * type Args = TimeoutArguments<(url: string, signal?: AbortSignal) => Promise<Response>>;
 * ```
 */
export type TimeoutArguments<Fn extends (...args: never[]) => unknown> =
  Required<Parameters<Fn>> extends [...infer Args, infer Last]
    ? [Exclude<Last, undefined>] extends [never]
      ? Parameters<Fn>
      : Exclude<Last, undefined> extends AbortSignal
        ? Args
        : Parameters<Fn>
    : Parameters<Fn>;

/**
 * Apply a hard waiting budget to an async function. Expiration rejects with
 * `TemporizeTimeoutError`; external cancellation rejects with
 * `TemporizeAbortError`. The underlying operation continues unless it
 * cooperatively observes the internally supplied final `AbortSignal`.
 * `TemporizeTimeoutError.attempts` is undefined because only one invocation is
 * made.
 *
 * @param fn Async function, optionally declaring `AbortSignal` last.
 * @param ms Maximum time to wait in milliseconds. Negative values become `0`.
 * @param options External cancellation settings.
 * @param options.signal Signal that aborts caller waiting and the internal signal.
 * @returns An inferred async function with an injected signal omitted from its arguments.
 * @example
 * ```ts
 * const fetchQuickly = timeout(
 *   (url: string, signal?: AbortSignal) => fetch(url, { signal }),
 *   2_000,
 * );
 * const response = await fetchQuickly("/api/report");
 * ```
 */
export function timeout<Fn extends (...args: never[]) => Promise<unknown>>(
  fn: Fn,
  ms: number,
  options: TimeoutOptions = {},
): (...args: TimeoutArguments<Fn>) => Promise<Awaited<ReturnType<Fn>>> {
  const delay = Math.max(0, ms || 0);

  return function (
    this: unknown,
    ...args: TimeoutArguments<Fn>
  ): Promise<Awaited<ReturnType<Fn>>> {
    const signal = options.signal;
    if (signal?.aborted) {
      return Promise.reject(new TemporizeAbortError(signal.reason));
    }
    const controller = new AbortController();
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        callback();
      };
      const onAbort = (): void => {
        controller.abort(signal?.reason);
        finish(() => reject(new TemporizeAbortError(signal?.reason)));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (Number.isFinite(delay)) {
        timer = setTimeout(() => {
          const error = new TemporizeTimeoutError(
            `Operation timed out after ${delay} ms`,
          );
          controller.abort(error);
          finish(() => reject(error));
        }, delay);
      }
      let operation: Promise<Awaited<ReturnType<Fn>>>;
      try {
        operation = Promise.resolve(
          fn.apply(this, [...args, controller.signal] as Parameters<Fn>),
        ) as Promise<Awaited<ReturnType<Fn>>>;
      } catch (error) {
        operation = Promise.reject(error);
      }
      operation.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });
  };
}
