// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { defineComponent, isRef, ref, type Ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebouncedRef } from "../../src/vue";

afterEach(() => {
  vi.useRealTimers();
});

describe("Vue useDebouncedRef", () => {
  it("tracks a reactive source only after the quiet period", async () => {
    vi.useFakeTimers();
    const source = ref("a");
    let debounced: Ref<string> | undefined;
    const wrapper = mount(defineComponent({
      setup() {
        debounced = useDebouncedRef(source, 30);
        return () => null;
      },
    }));

    expect(isRef(debounced)).toBe(true);
    expect(debounced?.value).toBe("a");
    source.value = "ab";
    source.value = "abc";
    expect(debounced?.value).toBe("a");
    await vi.advanceTimersByTimeAsync(29);
    expect(debounced?.value).toBe("a");
    await vi.advanceTimersByTimeAsync(1);
    expect(debounced?.value).toBe("abc");

    debounced!.value = "writable";
    expect(debounced?.value).toBe("writable");
    wrapper.unmount();
  });

  it("does not update after its component unmounts", async () => {
    vi.useFakeTimers();
    const source = ref(1);
    let debounced: Ref<number> | undefined;
    const wrapper = mount(defineComponent({
      setup() {
        debounced = useDebouncedRef(source, 10);
        return () => null;
      },
    }));

    source.value = 2;
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(10);
    expect(debounced?.value).toBe(1);
  });
});
