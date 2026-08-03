import { afterEach, describe, expect, it, vi } from "vitest";
import { sample } from "../src";

afterEach(() => {
  vi.useRealTimers();
});

describe("sample", () => {
  it("fires on fixed ticks with the latest arguments and skips empty ticks", async () => {
    vi.useFakeTimers();
    const fn = vi.fn<(value: number) => number>((value) => value * 2);
    const sampled = sample(fn, 20);

    sampled(1);
    sampled(2);
    await vi.advanceTimersByTimeAsync(20);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenLastCalledWith(2);
    expect(sampled.pending()).toBe(false);

    await vi.advanceTimersByTimeAsync(20);
    expect(fn).toHaveBeenCalledOnce();

    sampled(3);
    await vi.advanceTimersByTimeAsync(20);
    expect(fn).toHaveBeenLastCalledWith(3);
    expect(fn).toHaveBeenCalledTimes(2);
    sampled.cancel();
  });

  it("flushes pending work and exposes its actual result", async () => {
    vi.useFakeTimers();
    const sampled = sample(async (value: string) => value.toUpperCase(), 100);

    expect(sampled.flush()).toBeUndefined();
    sampled("latest");
    expect(sampled.pending()).toBe(true);
    await expect(sampled.flush()).resolves.toBe("LATEST");
    expect(sampled.pending()).toBe(false);
    sampled.cancel();
  });

  it("cancels a scheduled sample and remains reusable", async () => {
    vi.useFakeTimers();
    const fn = vi.fn<(value: number) => void>();
    const sampled = sample(fn, 10);

    sampled(1);
    sampled.cancel();
    await vi.advanceTimersByTimeAsync(10);
    expect(fn).not.toHaveBeenCalled();

    sampled(2);
    await vi.advanceTimersByTimeAsync(10);
    expect(fn).toHaveBeenCalledWith(2);
    sampled.cancel();
  });

  it("discards work when its signal aborts and ignores later calls", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fn = vi.fn();
    const sampled = sample(fn, 10, { signal: controller.signal });

    sampled();
    controller.abort();
    expect(sampled.pending()).toBe(false);
    sampled();
    await vi.advanceTimersByTimeAsync(20);
    expect(fn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
