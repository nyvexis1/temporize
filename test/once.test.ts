import { afterEach, describe, expect, it, vi } from "vitest";
import { once, TemporizeAbortError } from "../src";

afterEach(() => {
  vi.useRealTimers();
});

describe("once", () => {
  it("invokes once and shares the first call's actual result", async () => {
    const fn = vi.fn(async (value: number) => value * 2);
    const wrapped = once(fn);

    const first = wrapped(2);
    const second = wrapped(99);
    await expect(first).resolves.toBe(4);
    await expect(second).resolves.toBe(4);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(2);
    expect(wrapped.invoked()).toBe(true);
  });

  it("allows another invocation after resetAfter", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async (value: number) => value);
    const wrapped = once(fn, { resetAfter: 50 });

    await expect(wrapped(1)).resolves.toBe(1);
    await expect(wrapped(2)).resolves.toBe(1);
    await vi.advanceTimersByTimeAsync(50);
    expect(wrapped.invoked()).toBe(false);
    await expect(wrapped(3)).resolves.toBe(3);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("automatically resets after a rejected invocation", async () => {
    const failure = new Error("temporary");
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue("ready");
    const wrapped = once(fn);

    await expect(wrapped()).rejects.toBe(failure);
    expect(wrapped.invoked()).toBe(false);
    await expect(wrapped()).resolves.toBe("ready");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("can be reset manually and reports invocation state", async () => {
    const fn = vi.fn((value: string) => value);
    const wrapped = once(fn);

    expect(wrapped.invoked()).toBe(false);
    await expect(wrapped("first")).resolves.toBe("first");
    expect(wrapped.invoked()).toBe(true);
    wrapped.reset();
    expect(wrapped.invoked()).toBe(false);
    await expect(wrapped("second")).resolves.toBe("second");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rejects immediately when its signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort("shutdown");
    const fn = vi.fn(async () => 1);
    const wrapped = once(fn, { signal: controller.signal });

    await expect(wrapped()).rejects.toMatchObject({
      name: "TemporizeAbortError",
      reason: "shutdown",
    });
    await expect(wrapped()).rejects.toBeInstanceOf(TemporizeAbortError);
    expect(fn).not.toHaveBeenCalled();
  });
});
