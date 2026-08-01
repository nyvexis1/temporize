// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRafThrottle } from "../../src/vue";
import type { RafThrottledFunction } from "../../src";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Vue useRafThrottle", () => {
  it("cancels a scheduled frame on unmount", () => {
    let frame: FrameRequestCallback | undefined;
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 17;
    }));
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    const fn = vi.fn();
    let callback: RafThrottledFunction<[string]> | undefined;
    const wrapper = mount(defineComponent({
      setup() {
        callback = useRafThrottle(fn);
        return () => null;
      },
    }));

    callback?.("latest");
    wrapper.unmount();
    expect(cancelFrame).toHaveBeenCalledWith(17);
    expect(frame).toBeDefined();
    expect(fn).not.toHaveBeenCalled();
  });
});
