/**
 * Normalize a millisecond delay before it reaches a timer. Negative, missing,
 * and `NaN` values become `0`, and values above the 32-bit timer limit
 * (about 24.8 days) are capped instead of overflowing and firing immediately.
 *
 * @param ms Requested delay in milliseconds.
 * @returns A delay that `setTimeout` and `setInterval` honor as written.
 */
export const toDelay = (ms?: number): number =>
  Math.min(2_147_483_647, Math.max(0, ms || 0));
