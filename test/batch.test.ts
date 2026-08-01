import { afterEach, describe, expect, it, vi } from "vitest";
import { batch } from "../src";

afterEach(() => {
  vi.useRealTimers();
});

describe("batch", () => {
  it("collects argument tuples and shares one invocation result", async () => {
    vi.useFakeTimers();
    const fn = vi.fn((calls: Array<[string, number]>) =>
      calls.map(([name, count]) => `${name}:${count}`).join(","));
    const wrapped = batch(fn, 20);
    const first = wrapped("one", 1);
    const second = wrapped("two", 2);

    expect(wrapped.pending()).toBe(true);
    expect(wrapped.size()).toBe(2);
    await vi.advanceTimersByTimeAsync(20);

    await expect(first).resolves.toBe("one:1,two:2");
    await expect(second).resolves.toBe("one:1,two:2");
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith([["one", 1], ["two", 2]]);
    expect(wrapped.pending()).toBe(false);
    expect(wrapped.size()).toBe(0);
  });

  it("fires immediately when maxSize is reached", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async (calls: Array<[number]>) => calls.length);
    const wrapped = batch(fn, 1_000, { maxSize: 3 });
    const results = [wrapped(1), wrapped(2), wrapped(3)];

    expect(fn).toHaveBeenCalledOnce();
    expect(wrapped.size()).toBe(0);
    await expect(Promise.all(results)).resolves.toEqual([3, 3, 3]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("supports flush, pending, size, and cancellation", async () => {
    vi.useFakeTimers();
    const fn = vi.fn((calls: Array<[number]>) => calls.reduce((sum, [value]) => sum + value, 0));
    const wrapped = batch(fn, 100);
    const first = wrapped(2);
    const second = wrapped(3);
    expect(wrapped.pending()).toBe(true);
    expect(wrapped.size()).toBe(2);

    await expect(wrapped.flush()).resolves.toBe(5);
    await expect(Promise.all([first, second])).resolves.toEqual([5, 5]);
    expect(wrapped.pending()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    const cancelled = wrapped(4);
    const rejection = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    wrapped.cancel();
    await rejection;
    expect(wrapped.size()).toBe(0);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("honors AbortSignal before and during a queued batch", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fn = vi.fn(() => 1);
    const wrapped = batch(fn, 20, { signal: controller.signal });
    const pending = wrapped("queued");
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();

    await rejection;
    await expect(wrapped("later")).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(20);
    expect(fn).not.toHaveBeenCalled();

    const already = new AbortController();
    already.abort();
    const preAborted = batch(() => 1, 0, { signal: already.signal });
    await expect(preAborted()).rejects.toMatchObject({ name: "AbortError" });
  });
});
