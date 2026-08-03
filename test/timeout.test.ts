import { afterEach, describe, expect, it, vi } from "vitest";
import { timeout, TemporizeAbortError, TemporizeTimeoutError } from "../src";

afterEach(() => {
  vi.useRealTimers();
});

describe("timeout", () => {
  it("resolves normally when the function settles within its budget", async () => {
    const wrapped = timeout(async (value: number) => value * 2, 100);
    await expect(wrapped(4)).resolves.toBe(8);
  });

  it("rejects slow work without interrupting an underlying function that ignores signals", async () => {
    vi.useFakeTimers();
    let completed = false;
    const wrapped = timeout(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      completed = true;
      return "late";
    }, 10);
    const result = wrapped();
    const rejection = expect(result).rejects.toBeInstanceOf(TemporizeTimeoutError);

    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(40);
    expect(completed).toBe(true);
  });

  it("injects a timeout-triggered signal into cooperative functions", async () => {
    vi.useFakeTimers();
    let suppliedSignal: AbortSignal | undefined;
    const wrapped = timeout(async (signal?: AbortSignal) => {
      suppliedSignal = signal;
      return new Promise<never>(() => undefined);
    }, 20);
    const result = wrapped();
    const rejection = expect(result).rejects.toBeInstanceOf(TemporizeTimeoutError);

    expect(suppliedSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    await rejection;
    expect(suppliedSignal?.aborted).toBe(true);
  });

  it("honors AbortSignal immediately and while work is active", async () => {
    const already = new AbortController();
    already.abort("already");
    const fn = vi.fn(async () => 1);
    const preAborted = timeout(fn, 100, { signal: already.signal });
    await expect(preAborted()).rejects.toBeInstanceOf(TemporizeAbortError);
    expect(fn).not.toHaveBeenCalled();

    const active = new AbortController();
    let internal: AbortSignal | undefined;
    const wrapped = timeout(
      async (signal?: AbortSignal) => {
        internal = signal;
        return new Promise<never>(() => undefined);
      },
      100,
      { signal: active.signal },
    );
    const result = wrapped();
    active.abort("navigation");
    await expect(result).rejects.toMatchObject({
      name: "TemporizeAbortError",
      reason: "navigation",
    });
    expect(internal?.aborted).toBe(true);
  });
});
