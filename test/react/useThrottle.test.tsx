// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRafThrottle, useThrottle } from "../../src/react";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("React useThrottle", () => {
  it("keeps a stable identity and cancels trailing work on unmount", async () => {
    vi.useFakeTimers();
    const firstFn = vi.fn((value: number) => value);
    const secondFn = vi.fn((value: number) => value);
    const { result, rerender, unmount } = renderHook(
      ({ fn }) => useThrottle(fn, 20, { leading: false }),
      { initialProps: { fn: firstFn } },
    );
    const firstReference = result.current;

    rerender({ fn: secondFn });
    expect(result.current).toBe(firstReference);
    const pending = result.current(4);
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    unmount();
    await rejection;
    await act(() => vi.advanceTimersByTimeAsync(20));

    expect(firstFn).not.toHaveBeenCalled();
    expect(secondFn).not.toHaveBeenCalled();
  });
});

describe("React useRafThrottle", () => {
  it("uses the latest callback and cancels a scheduled frame on unmount", () => {
    let frame: FrameRequestCallback | undefined;
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 11;
    }));
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    const firstFn = vi.fn();
    const secondFn = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ fn }) => useRafThrottle(fn),
      { initialProps: { fn: firstFn } },
    );
    const firstReference = result.current;

    rerender({ fn: secondFn });
    expect(result.current).toBe(firstReference);
    result.current("latest");
    unmount();
    expect(cancelFrame).toHaveBeenCalledWith(11);
    expect(frame).toBeDefined();
    expect(firstFn).not.toHaveBeenCalled();
    expect(secondFn).not.toHaveBeenCalled();
  });
});
