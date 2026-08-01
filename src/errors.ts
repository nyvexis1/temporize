/**
 * An error raised when Temporize cancels queued or scheduled work.
 *
 * @example
 * ```ts
 * if (error instanceof TemporizeAbortError) console.log(error.reason);
 * ```
 */
export class TemporizeAbortError extends Error {
  /** The value supplied to `AbortController.abort()`, when available. */
  readonly reason: unknown;

  /** The original abort reason, exposed using the standard error-cause shape. */
  readonly cause?: unknown;

  /**
   * Create an error for a cancelled Temporize operation.
   *
   * @param reason Original reason supplied by an `AbortSignal`.
   * @returns A `TemporizeAbortError` carrying the optional abort reason.
   * @example
   * ```ts
   * const error = new TemporizeAbortError("navigation");
   * ```
   */
  constructor(reason?: unknown) {
    super("Aborted");
    this.name = "TemporizeAbortError";
    this.reason = this.cause = reason;
  }
}

/**
 * Configuration accepted when constructing a `TemporizeTimeoutError`.
 *
 * @example
 * ```ts
 * const options: TemporizeTimeoutErrorOptions = { attempts: 3, cause: error };
 * ```
 */
export interface TemporizeTimeoutErrorOptions {
  /** Number of attempts made before the operation was exhausted. */
  attempts?: number;
  /** Most recent error that caused the timed operation to fail. */
  cause?: unknown;
}

/**
 * An error raised when a retry or other time-bounded Temporize operation expires.
 *
 * @example
 * ```ts
 * if (error instanceof TemporizeTimeoutError) console.log(error.attempts);
 * ```
 */
export class TemporizeTimeoutError extends Error {
  /** Number of attempts made before failure, when relevant. */
  readonly attempts?: number;

  /** Most recent underlying failure, when available. */
  readonly cause?: unknown;

  /**
   * Create an error for an exhausted time-bounded operation.
   *
   * @param message Human-readable explanation of the timeout.
   * @param options Attempt count and underlying error details.
   * @param options.attempts Number of attempts made before failure.
   * @param options.cause Most recent underlying failure.
   * @returns A `TemporizeTimeoutError` with optional retry metadata.
   * @example
   * ```ts
   * const error = new TemporizeTimeoutError("Retry attempts exhausted", {
   *   attempts: 3,
   * });
   * ```
   */
  constructor(
    message = "The operation timed out",
    options: TemporizeTimeoutErrorOptions = {},
  ) {
    super(message);
    this.name = "TemporizeTimeoutError";
    this.attempts = options.attempts;
    this.cause = options.cause;
  }
}
