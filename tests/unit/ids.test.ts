import { describe, expect, it } from "vitest";
import { makeLocalCode, makeRequestId, newOrderId } from "../../src/lib/ids";

describe("makeRequestId", () => {
  it("is stable for the same order id", () => {
    const orderId = "11111111-2222-3333-4444-555555555555";
    expect(makeRequestId(orderId)).toBe(makeRequestId(orderId));
  });

  it("matches the provider contract", () => {
    const requestId = makeRequestId(newOrderId());
    expect(requestId).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/);
    expect(requestId.startsWith("ord")).toBe(true);
  });
});

describe("makeLocalCode", () => {
  it("uses a readable local prefix", () => {
    expect(makeLocalCode()).toMatch(/^LOCAL-[A-Z0-9]{10}$/);
  });
});
