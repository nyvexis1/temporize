// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "../../src/react";

afterEach(() => {
  vi.useRealTimers();
});

describe("React useDebouncedValue", () => {
  it("returns the initial value and updates only after the quiet period", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 30),
      { initialProps: { value: "a" } },
    );

    expect(result.current).toBe("a");
    rerender({ value: "ab" });
    rerender({ value: "abc" });
    expect(result.current).toBe("a");

    await act(() => vi.advanceTimersByTimeAsync(29));
    expect(result.current).toBe("a");
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current).toBe("abc");
  });

  it("supports function values without treating them as state updaters", async () => {
    vi.useFakeTimers();
    const first = () => "first";
    const second = () => "second";
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 10),
      { initialProps: { value: first } },
    );

    rerender({ value: second });
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(result.current).toBe(second);
  });
});
