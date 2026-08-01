import { afterEach, describe, expect, it, vi } from "vitest";
import { debounceAsync } from "../src";

afterEach(() => {
  vi.useRealTimers();
});

describe("debounceAsync", () => {
  it("queues overlapping invocations in firing order", async () => {
    vi.useFakeTimers();
    const releases: Array<() => void> = [];
    const starts: number[] = [];
    const wrapped = debounceAsync(async (value: number) => {
      starts.push(value);
      await new Promise<void>((resolve) => releases.push(resolve));
      return value;
    }, 5, { overlap: "queue" });

    const first = wrapped(1);
    await vi.advanceTimersByTimeAsync(5);
    const second = wrapped(2);
    await vi.advanceTimersByTimeAsync(5);
    expect(starts).toEqual([1]);
    releases.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([1, 2]);
    releases.shift()?.();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
  });

  it("drops overlapping work onto the active invocation promise", async () => {
    vi.useFakeTimers();
    let release: ((value: number) => void) | undefined;
    const fn = vi.fn(() => new Promise<number>((resolve) => {
      release = resolve;
    }));
    const wrapped = debounceAsync(fn, 5, { overlap: "drop" });
    const first = wrapped();
    await vi.advanceTimersByTimeAsync(5);
    const second = wrapped();
    await vi.advanceTimersByTimeAsync(5);
    expect(fn).toHaveBeenCalledOnce();
    release?.(7);
    await expect(Promise.all([first, second])).resolves.toEqual([7, 7]);
  });

  it("aborts the previous invocation and supplies a hidden trailing signal", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fn = (value: number, signal: AbortSignal): Promise<number> => {
      signals.push(signal);
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        setTimeout(() => resolve(value), 100);
      });
    };
    const wrapped = debounceAsync(fn, 5, { overlap: "cancel-previous" });
    const first = wrapped(1);
    const firstExpectation = expect(first).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(5);
    const second = wrapped(2);
    await vi.advanceTimersByTimeAsync(5);
    expect(signals[0].aborted).toBe(true);
    await firstExpectation;
    await vi.advanceTimersByTimeAsync(100);
    await expect(second).resolves.toBe(2);
  });

  it("cancels scheduled and queued work", async () => {
    vi.useFakeTimers();
    const wrapped = debounceAsync(async (value: number) => value, 10);
    const pending = wrapped(1);
    wrapped.cancel();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
