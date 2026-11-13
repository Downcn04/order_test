import { describe, expect, it } from "vitest";
import {
  classifyFetchError,
  classifyResponse,
  parseRetryAfter,
} from "../../src/lib/provider/errors";

describe("classifyResponse", () => {
  it("treats a delivered payload as success", () => {
    const result = classifyResponse(200, {
      requestId: "ord1",
      productId: "ebook",
      status: "delivered",
      code: "ABC-123",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result).toEqual({
      kind: "delivered",
      status: "delivered",
      code: "ABC-123",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("treats 422 as a definitive failure", () => {
    const result = classifyResponse(422, {
      error: { code: "PRODUCT_UNAVAILABLE", message: "unavailable" },
    });
    expect(result.kind).toBe("definitive_failure");
  });

  it("treats 409 as a definitive failure", () => {
    const result = classifyResponse(409, {
      error: { code: "INVALID_REQUEST", message: "conflict" },
    });
    expect(result.kind).toBe("definitive_failure");
  });

  it("treats 404 as not_found", () => {
    expect(classifyResponse(404, null).kind).toBe("not_found");
  });

  it("treats 401 as auth_error", () => {
    expect(
      classifyResponse(401, {
        error: { code: "UNAUTHORIZED", message: "bad key" },
      }).kind,
    ).toBe("auth_error");
  });

  it("treats 429 as retryable and honors Retry-After", () => {
    const result = classifyResponse(
      429,
      { error: { code: "RATE_LIMITED", message: "slow down" } },
      "2",
    );
    expect(result).toEqual({
      kind: "retryable",
      reason: "slow down",
      retryAfterMs: 2000,
    });
  });

  it("treats 5xx as retryable", () => {
    expect(classifyResponse(503, null).kind).toBe("retryable");
  });
});

describe("parseRetryAfter", () => {
  it("parses seconds and dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    const date = new Date(Date.now() + 5000).toUTCString();
    const parsed = parseRetryAfter(date);
    expect(parsed).toBeGreaterThan(3000);
    expect(parsed).toBeLessThanOrEqual(5000);
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe("classifyFetchError", () => {
  it("treats timeouts as retryable", () => {
    const error = new Error("timeout");
    error.name = "TimeoutError";
    expect(classifyFetchError(error)).toEqual({
      kind: "retryable",
      reason: "Request timed out",
    });
  });
});
