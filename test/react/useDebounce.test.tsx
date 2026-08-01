// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebounce } from "../../src/react";

afterEach(() => {
  vi.useRealTimers();
});

describe("React useDebounce", () => {
  it("keeps a stable identity and invokes the latest callback", async () => {
    vi.useFakeTimers();
    const firstFn = vi.fn((value: number) => value + 1);
    const secondFn = vi.fn((value: number) => value + 2);
    const { result, rerender } = renderHook(
      ({ fn, wait }) => useDebounce(fn, wait, { trailing: true }),
      { initialProps: { fn: firstFn, wait: 20 } },
    );
    const firstReference = result.current;

    rerender({ fn: secondFn, wait: 20 });
    expect(result.current).toBe(firstReference);
    const value = result.current(3);
    await act(() => vi.advanceTimersByTimeAsync(20));

    await expect(value).resolves.toBe(5);
    expect(firstFn).not.toHaveBeenCalled();
    expect(secondFn).toHaveBeenCalledWith(3);
  });

  it("recreates on wait changes and cancels the old timer", async () => {
    vi.useFakeTimers();
    const fn = vi.fn((value: string) => value);
    const { result, rerender } = renderHook(
      ({ wait }) => useDebounce(fn, wait),
      { initialProps: { wait: 100 } },
    );
    const oldReference = result.current;
    const oldCall = result.current("old");
    const oldRejection = expect(oldCall).rejects.toMatchObject({ name: "AbortError" });

    rerender({ wait: 10 });
    expect(result.current).not.toBe(oldReference);
    await oldRejection;
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(fn).not.toHaveBeenCalled();
  });

  it("cancels pending work on unmount", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useDebounce(fn, 25));
    const pending = result.current("value");
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });

    unmount();
    await rejection;
    await act(() => vi.advanceTimersByTimeAsync(25));
    expect(fn).not.toHaveBeenCalled();
  });
});
