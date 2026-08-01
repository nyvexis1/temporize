import { afterEach, describe, expect, it, vi } from "vitest";
import { debounce, TemporizeAbortError } from "../src";

afterEach(() => {
  vi.useRealTimers();
});

describe("debounce", () => {
  it("coalesces calls, uses the latest arguments, and shares the actual result", async () => {
    vi.useFakeTimers();
    const fn = vi.fn((value: number) => value * 2);
    const wrapped = debounce(fn, 20);
    const first = wrapped(2);
    const second = wrapped(4);

    expect(wrapped.pending()).toBe(true);
    await vi.advanceTimersByTimeAsync(20);

    await expect(first).resolves.toBe(8);
    await expect(second).resolves.toBe(8);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(4);
    expect(wrapped.pending()).toBe(false);
  });

  it("preserves async values and propagates synchronous and async errors", async () => {
    vi.useFakeTimers();
    const asyncWrapped = debounce(async (value: string) => value.toUpperCase(), 5);
    const asyncResult = asyncWrapped("ok");
    await vi.advanceTimersByTimeAsync(5);
    await expect(asyncResult).resolves.toBe("OK");

    const syncError = debounce(() => {
      throw new Error("sync failure");
    }, 5);
    const syncResult = syncError();
    const syncExpectation = expect(syncResult).rejects.toThrow("sync failure");
    await vi.advanceTimersByTimeAsync(5);
    await syncExpectation;

    const asyncError = debounce(() => Promise.reject(new Error("async failure")), 5);
    const asyncFailure = asyncError();
    const asyncExpectation = expect(asyncFailure).rejects.toThrow("async failure");
    await vi.advanceTimersByTimeAsync(5);
    await asyncExpectation;
  });

  it("supports leading-only and leading-plus-trailing behavior", async () => {
    vi.useFakeTimers();
    const leadingOnlyFn = vi.fn((value: number) => value);
    const leadingOnly = debounce(leadingOnlyFn, 10, { leading: true, trailing: false });
    await expect(leadingOnly(1)).resolves.toBe(1);
    const suppressed = leadingOnly(2);
    await vi.advanceTimersByTimeAsync(10);
    await expect(suppressed).resolves.toBe(1);
    expect(leadingOnlyFn).toHaveBeenCalledOnce();

    const bothFn = vi.fn((value: number) => value);
    const both = debounce(bothFn, 10, { leading: true, trailing: true });
    await expect(both(1)).resolves.toBe(1);
    const trailing = both(2);
    await vi.advanceTimersByTimeAsync(10);
    await expect(trailing).resolves.toBe(2);
    expect(bothFn).toHaveBeenCalledTimes(2);
  });

  it("enforces maxWait during a continuous stream", async () => {
    vi.useFakeTimers();
    const fn = vi.fn((value: number) => value);
    const wrapped = debounce(fn, 50, { maxWait: 120 });
    const promises = [wrapped(0)];
    for (let value = 1; value <= 3; value += 1) {
      await vi.advanceTimersByTimeAsync(40);
      promises.push(wrapped(value));
    }
    expect(fn).toHaveBeenCalledOnce();
    await expect(Promise.all(promises.slice(0, 3))).resolves.toEqual([2, 2, 2]);
    await vi.advanceTimersByTimeAsync(50);
    await expect(promises[3]).resolves.toBe(3);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("can flush and cancel pending calls", async () => {
    vi.useFakeTimers();
    const wrapped = debounce((value: number) => value + 1, 100);
    const flushed = wrapped(4);
    expect(wrapped.pending()).toBe(true);
    await expect(wrapped.flush()).resolves.toBe(5);
    await expect(flushed).resolves.toBe(5);
    expect(wrapped.pending()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    const cancelled = wrapped(9);
    wrapped.cancel();
    await expect(cancelled).rejects.toBeInstanceOf(TemporizeAbortError);
    expect(wrapped.pending()).toBe(false);
  });

  it("honors AbortSignal, including a signal already aborted at call time", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const wrapped = debounce((value: number) => value, 10, {
      signal: controller.signal,
    });
    const pending = wrapped(1);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(TemporizeAbortError);
    await expect(wrapped(2)).rejects.toBeInstanceOf(TemporizeAbortError);

    const already = new AbortController();
    already.abort();
    const preAborted = debounce(() => 1, 0, { signal: already.signal });
    await expect(preAborted()).rejects.toBeInstanceOf(TemporizeAbortError);
  });

  it("defers wait=0 trailing work to the next task", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(() => 42);
    const wrapped = debounce(fn, 0);
    const result = wrapped();
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe(42);
  });
});
