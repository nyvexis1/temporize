// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { defineComponent, h, type PropType } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebounce, useThrottle } from "../../src/vue";
import { TemporizeAbortError, type DebouncedFunction } from "../../src";

afterEach(() => {
  vi.useRealTimers();
});

describe("Vue useDebounce", () => {
  it("survives component updates with a stable identity", async () => {
    vi.useFakeTimers();
    const fn = vi.fn((value: number) => value + 1);
    let callback: DebouncedFunction<[number], number> | undefined;
    const component = defineComponent({
      props: {
        label: { type: String, required: true },
        fn: {
          type: Function as PropType<(value: number) => number>,
          required: true,
        },
      },
      setup(props) {
        callback = useDebounce((value: number) => props.fn(value), 10);
        return () => h("div", props.label);
      },
    });
    const wrapper = mount(component, { props: { label: "first", fn } });
    const firstReference = callback;

    await wrapper.setProps({ label: "second" });
    expect(callback).toBe(firstReference);
    const result = callback?.(2);
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBe(3);
    wrapper.unmount();
  });

  it("cancels pending work on unmount", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    let callback: DebouncedFunction<[string], void> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          callback = useDebounce(fn, 20);
          return () => null;
        },
      }),
    );
    const pending = callback?.("value");
    const rejection = expect(pending).rejects.toBeInstanceOf(TemporizeAbortError);

    wrapper.unmount();
    await rejection;
    await vi.advanceTimersByTimeAsync(20);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("Vue useThrottle", () => {
  it("cancels a pending trailing invocation on unmount", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    let callback: DebouncedFunction<[number], void> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          callback = useThrottle(fn, 20, { leading: false });
          return () => null;
        },
      }),
    );
    const pending = callback?.(1);
    const rejection = expect(pending).rejects.toBeInstanceOf(TemporizeAbortError);

    wrapper.unmount();
    await rejection;
    await vi.advanceTimersByTimeAsync(20);
    expect(fn).not.toHaveBeenCalled();
  });
});
