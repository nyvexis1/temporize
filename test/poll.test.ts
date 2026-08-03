import { afterEach, describe, expect, it, vi } from "vitest";
import { poll, TemporizeAbortError, TemporizeTimeoutError } from "../src";

afterEach(() => {
  vi.useRealTimers();
});

describe("poll", () => {
  it("stops when the until predicate is satisfied", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn<() => Promise<{ status: string }>>()
      .mockResolvedValueOnce({ status: "queued" })
      .mockResolvedValueOnce({ status: "running" })
      .mockResolvedValue({ status: "done" });
    const wrapped = poll(fn, 10, {
      until: (job) => job.status === "done",
    });
    const result = wrapped();

    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toEqual({ status: "done" });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("rejects with the completed attempt count when attempts are exhausted", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async () => false);
    const wrapped = poll(fn, 5, { attempts: 3 });
    const result = wrapped();
    const rejection = expect(result).rejects.toMatchObject({
      name: "TemporizeTimeoutError",
      attempts: 3,
    });

    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    await expect(result).rejects.toBeInstanceOf(TemporizeTimeoutError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("enforces one overall timeout while an attempt is still active", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(() => new Promise<boolean>(() => undefined));
    const wrapped = poll(fn, 10, { timeout: 25 });
    const result = wrapped();
    const rejection = expect(result).rejects.toMatchObject({
      name: "TemporizeTimeoutError",
      attempts: 1,
    });

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(fn).toHaveBeenCalledOnce();
  });

  it("counts a failed attempt and continues polling", async () => {
    vi.useFakeTimers();
    const failure = new Error("network blip");
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce("")
      .mockResolvedValue("ready");
    const wrapped = poll(fn, 5, { attempts: 3 });
    const result = wrapped();

    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBe("ready");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops mid-poll when its signal aborts", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fn = vi.fn(async () => false);
    const wrapped = poll(fn, 1_000, { signal: controller.signal });
    const result = wrapped();
    const rejection = expect(result).rejects.toBeInstanceOf(TemporizeAbortError);
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    await rejection;
    expect(fn).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
