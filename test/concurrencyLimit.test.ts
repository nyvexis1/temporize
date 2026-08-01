import { describe, expect, it, vi } from "vitest";
import { concurrencyLimit, TemporizeAbortError } from "../src";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("concurrencyLimit", () => {
  it("never exceeds max concurrency and drains in FIFO order", async () => {
    const gates = [deferred<number>(), deferred<number>(), deferred<number>()];
    const starts: number[] = [];
    let active = 0;
    let peak = 0;
    const limited = concurrencyLimit(async (value: number) => {
      starts.push(value);
      active += 1;
      peak = Math.max(peak, active);
      const result = await gates[value - 1].promise;
      active -= 1;
      return result;
    }, 2);

    const results = [limited(1), limited(2), limited(3)];
    expect(starts).toEqual([1, 2]);
    expect(limited.pending()).toBe(2);
    expect(limited.queued()).toBe(1);

    gates[1].resolve(20);
    await results[1];
    await Promise.resolve();
    expect(starts).toEqual([1, 2, 3]);
    expect(peak).toBe(2);

    gates[0].resolve(10);
    gates[2].resolve(30);
    await expect(Promise.all(results)).resolves.toEqual([10, 20, 30]);
    expect(limited.pending()).toBe(0);
    expect(limited.queued()).toBe(0);
  });

  it("lets in-flight work finish while cancel rejects queued calls", async () => {
    const gate = deferred<string>();
    const fn = vi.fn((value: string) =>
      value === "active" ? gate.promise : Promise.resolve(value),
    );
    const limited = concurrencyLimit(fn, 1);
    const active = limited("active");
    const queued = limited("queued");

    limited.cancel();
    await expect(queued).rejects.toBeInstanceOf(TemporizeAbortError);
    gate.resolve("finished");
    await expect(active).resolves.toBe("finished");
    await expect(limited("future")).resolves.toBe("future");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rejects queued and future calls with the AbortSignal reason", async () => {
    const controller = new AbortController();
    const gate = deferred<void>();
    const limited = concurrencyLimit(() => gate.promise, 1, {
      signal: controller.signal,
    });
    const active = limited();
    const queued = limited();
    const reason = new Error("page closed");

    controller.abort(reason);
    await expect(queued).rejects.toMatchObject({
      name: "TemporizeAbortError",
      reason,
      cause: reason,
    });
    await expect(limited()).rejects.toBeInstanceOf(TemporizeAbortError);
    gate.resolve();
    await expect(active).resolves.toBeUndefined();
  });

  it("rejects calls immediately when its signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort("done");
    const fn = vi.fn(async () => 1);
    const limited = concurrencyLimit(fn, 1, { signal: controller.signal });

    await expect(limited()).rejects.toMatchObject({
      name: "TemporizeAbortError",
      reason: "done",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("throws synchronously for an invalid maximum", () => {
    expect(() => concurrencyLimit(async () => undefined, 0)).toThrow(TypeError);
    expect(() => concurrencyLimit(async () => undefined, -1)).toThrow(TypeError);
  });
});
