import { afterEach, describe, expect, it, vi } from "vitest";
import { idle } from "../src";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("idle", () => {
  it("falls back to a 1 ms timer and coalesces rapid calls", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("cancelIdleCallback", undefined);
    const fn = vi.fn<(value: string) => void>();
    const wrapped = idle(fn);

    wrapped("first");
    wrapped("latest");
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith("latest");
  });

  it("cancels fallback work before it runs", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("cancelIdleCallback", undefined);
    const fn = vi.fn();
    const wrapped = idle(fn);

    wrapped();
    wrapped.cancel();
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it("uses native idle scheduling and forwards the timeout option", () => {
    let callback: (() => void) | undefined;
    const cancelIdleCallback = vi.fn();
    const requestIdleCallback = vi.fn((next: () => void) => {
      callback = next;
      return 23;
    });
    vi.stubGlobal("requestIdleCallback", requestIdleCallback);
    vi.stubGlobal("cancelIdleCallback", cancelIdleCallback);
    const fn = vi.fn<(value: number) => void>();
    const wrapped = idle(fn, { timeout: 500 });

    wrapped(1);
    wrapped(2);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 500 });
    callback?.();
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(2);

    wrapped(3);
    wrapped.cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(23);
  });
});
