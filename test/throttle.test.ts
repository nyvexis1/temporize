import { afterEach, describe, expect, it, vi } from "vitest";
import { rafThrottle, throttle, throttlePromise } from "../src";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("throttle", () => {
  it("runs on the leading edge and trails with the latest call", async () => {
    vi.useFakeTimers();
    const fn = vi.fn((value: number) => value * 10);
    const wrapped = throttle(fn, 20);
    await expect(wrapped(1)).resolves.toBe(10);
    const second = wrapped(2);
    const third = wrapped(3);
    await vi.advanceTimersByTimeAsync(20);
    await expect(second).resolves.toBe(30);
    await expect(third).resolves.toBe(30);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("supports trailing-only throttling and cancellation", async () => {
    vi.useFakeTimers();
    const fn = vi.fn((value: string) => value);
    const wrapped = throttle(fn, 10, { leading: false });
    const result = wrapped("later");
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBe("later");

    const cancelled = wrapped("never");
    wrapped.cancel();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  });

  it("survives a call stream faster than event-loop timer drainage", async () => {
    vi.useFakeTimers();
    const fn = vi.fn((value: number) => value);
    const wrapped = throttle(fn, 1);
    const calls: Promise<number>[] = [];
    for (let index = 0; index < 2_000; index += 1) calls.push(wrapped(index));
    await vi.runAllTimersAsync();
    const values = await Promise.all(calls);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(values.at(-1)).toBe(1_999);
  });

  it("rejects calls when its signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const wrapped = throttle(() => 1, 10, { signal: controller.signal });
    await expect(wrapped()).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("rafThrottle", () => {
  it("coalesces to the latest call and can cancel a frame", () => {
    let callback: FrameRequestCallback | undefined;
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn((next: FrameRequestCallback) => {
      callback = next;
      return 7;
    }));
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const fn = vi.fn<(value: number) => void>();
    const wrapped = rafThrottle(fn);
    wrapped(1);
    wrapped(2);
    callback?.(0);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(2);
    wrapped(3);
    wrapped.cancel();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("falls back to a 16 ms timer without browser animation APIs", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", undefined);
    vi.stubGlobal("cancelAnimationFrame", undefined);
    const fn = vi.fn();
    const wrapped = rafThrottle(fn);
    wrapped();
    await vi.advanceTimersByTimeAsync(15);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe("throttlePromise", () => {
  it("queues every call and drains one per window", async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    const wrapped = throttlePromise((value: number) => {
      starts.push(Date.now());
      return value * 2;
    }, 10);
    const results = [wrapped(1), wrapped(2), wrapped(3)];
    expect(wrapped.queued()).toBe(2);
    await vi.advanceTimersByTimeAsync(20);
    await expect(Promise.all(results)).resolves.toEqual([2, 4, 6]);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(10);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(10);
    expect(wrapped.pending()).toBe(false);
  });

  it("supports delayed leading behavior, flush, cancellation, and signals", async () => {
    vi.useFakeTimers();
    const wrapped = throttlePromise((value: number) => value, 20, { leading: false });
    const delayed = wrapped(1);
    expect(wrapped.queued()).toBe(1);
    await vi.advanceTimersByTimeAsync(19);
    expect(wrapped.queued()).toBe(1);
    await expect(wrapped.flush()).resolves.toBe(1);
    await expect(delayed).resolves.toBe(1);

    const cancelled = wrapped(2);
    wrapped.cancel();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });

    const controller = new AbortController();
    const signaled = throttlePromise(() => 1, 20, { leading: false, signal: controller.signal });
    const pending = signaled();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(signaled()).rejects.toMatchObject({ name: "AbortError" });
  });
});
