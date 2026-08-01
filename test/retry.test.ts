import { afterEach, describe, expect, it, vi } from "vitest";
import { retry, TemporizeAbortError, TemporizeTimeoutError } from "../src";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("retry", () => {
  it("succeeds after failures and preserves inferred arguments", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn<(value: number) => Promise<number>>()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValue(8);
    const wrapped = retry(fn, { attempts: 3, baseDelay: 10, jitter: false });
    const result = wrapped(4);

    await vi.advanceTimersByTimeAsync(30);
    await expect(result).resolves.toBe(8);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenNthCalledWith(1, 4);
  });

  it("rejects with a timeout error carrying the last failure after exhausting attempts", async () => {
    vi.useFakeTimers();
    const errors = [new Error("first"), new Error("second"), new Error("last")];
    const fn = vi
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(errors[0])
      .mockRejectedValueOnce(errors[1])
      .mockRejectedValueOnce(errors[2]);
    const wrapped = retry(fn, { attempts: 3, baseDelay: 1, jitter: false });
    const result = wrapped();
    const rejection = expect(result).rejects.toMatchObject({
      name: "TemporizeTimeoutError",
      attempts: 3,
      cause: errors[2],
    });

    await vi.advanceTimersByTimeAsync(3);
    await rejection;
    await expect(result).rejects.toBeInstanceOf(TemporizeTimeoutError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses shouldRetry to stop early", async () => {
    const error = new Error("permanent");
    const shouldRetry = vi.fn(() => false);
    const fn = vi.fn(() => Promise.reject(error));
    const wrapped = retry(fn, { attempts: 5, shouldRetry });

    await expect(wrapped()).rejects.toBe(error);
    expect(fn).toHaveBeenCalledOnce();
    expect(shouldRetry).toHaveBeenCalledWith(error, 1);
  });

  it("aborts immediately during a backoff delay", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fn = vi.fn(() => Promise.reject(new Error("temporary")));
    const wrapped = retry(fn, {
      attempts: 5,
      baseDelay: 1_000,
      jitter: false,
      signal: controller.signal,
    });
    const result = wrapped();
    const rejection = expect(result).rejects.toBeInstanceOf(TemporizeAbortError);
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    await rejection;
    expect(fn).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses exponentially growing delays capped by maxDelay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const starts: number[] = [];
    const fn = vi.fn(async () => {
      starts.push(Date.now());
      if (starts.length < 5) throw new Error("retry");
      return "ok";
    });
    const wrapped = retry(fn, {
      attempts: 5,
      baseDelay: 100,
      maxDelay: 250,
      factor: 2,
      jitter: false,
    });
    const result = wrapped();

    await vi.advanceTimersByTimeAsync(800);
    await expect(result).resolves.toBe("ok");
    expect(starts).toEqual([0, 100, 300, 550, 800]);
  });

  it("rejects immediately when its signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn(async () => 1);
    const wrapped = retry(fn, { signal: controller.signal });

    await expect(wrapped()).rejects.toBeInstanceOf(TemporizeAbortError);
    expect(fn).not.toHaveBeenCalled();
  });
});
