import { describe, expect, it } from "vitest";
import { TemporizeAbortError, TemporizeTimeoutError } from "../src";

describe("Temporize errors", () => {
  it("preserves abort reasons with an exact public name", () => {
    const reason = new Error("navigation");
    const error = new TemporizeAbortError(reason);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TemporizeAbortError");
    expect(error.reason).toBe(reason);
    expect(error.cause).toBe(reason);
  });

  it("reports retry attempts and the underlying failure", () => {
    const cause = new Error("network unavailable");
    const error = new TemporizeTimeoutError("Retry attempts exhausted", {
      attempts: 4,
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TemporizeTimeoutError");
    expect(error.attempts).toBe(4);
    expect(error.cause).toBe(cause);
  });
});
