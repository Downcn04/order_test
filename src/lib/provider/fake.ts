import { randomUUID } from "node:crypto";
import { classifyResponse } from "./errors";
import type { DeliveryProvider, DeliveryResult } from "./types";

export type FakeBehavior =
  | { type: "success" }
  | { type: "timeout" }
  | { type: "deliver_then_timeout" }
  | { type: "network" }
  | {
      type: "http";
      status: number;
      retryAfterSec?: number;
      body?: unknown;
    };

type StoredDelivery = {
  productId: string;
  status: string;
  code: string;
  createdAt: string;
};

export type FakeCall = {
  op: "create" | "get";
  requestId: string;
  productId?: string;
};

export class FakeProvider implements DeliveryProvider {
  private store = new Map<string, StoredDelivery>();
  private behaviors: FakeBehavior[] = [];
  readonly calls: FakeCall[] = [];

  pushBehavior(behavior: FakeBehavior): void {
    this.behaviors.push(behavior);
  }

  reset(): void {
    this.store.clear();
    this.behaviors = [];
    this.calls.length = 0;
  }

  seedDelivered(requestId: string, productId: string, code: string): void {
    this.store.set(requestId, {
      productId,
      status: "delivered",
      code,
      createdAt: new Date().toISOString(),
    });
  }

  private takeBehavior(): FakeBehavior {
    return this.behaviors.shift() ?? { type: "success" };
  }

  private deliver(requestId: string, productId: string): DeliveryResult {
    const stored: StoredDelivery = {
      productId,
      status: "delivered",
      code: `FAKE-${randomUUID().slice(0, 8).toUpperCase()}`,
      createdAt: new Date().toISOString(),
    };
    this.store.set(requestId, stored);
    return {
      kind: "delivered",
      status: stored.status,
      code: stored.code,
      createdAt: stored.createdAt,
    };
  }

  async create(requestId: string, productId: string): Promise<DeliveryResult> {
    this.calls.push({ op: "create", requestId, productId });

    const existing = this.store.get(requestId);
    if (existing) {
      if (existing.productId !== productId) {
        return {
          kind: "definitive_failure",
          httpStatus: 409,
          code: "INVALID_REQUEST",
          reason: "requestId already used with a different productId",
        };
      }
      return {
        kind: "delivered",
        status: existing.status,
        code: existing.code,
        createdAt: existing.createdAt,
      };
    }

    const behavior = this.takeBehavior();

    switch (behavior.type) {
      case "timeout":
        return { kind: "retryable", reason: "Request timed out (fake)" };
      case "network":
        return { kind: "retryable", reason: "Network error (fake)" };
      case "deliver_then_timeout":
        this.deliver(requestId, productId);
        return { kind: "retryable", reason: "Response lost after delivery (fake)" };
      case "http": {
        const body =
          behavior.body ??
          {
            error: {
              code:
                behavior.status === 422
                  ? "PRODUCT_UNAVAILABLE"
                  : behavior.status === 429
                    ? "RATE_LIMITED"
                    : "SERVER_ERROR",
              message: `Fake HTTP ${behavior.status}`,
            },
          };
        const result = classifyResponse(
          behavior.status,
          body,
          behavior.retryAfterSec != null
            ? String(behavior.retryAfterSec)
            : null,
        );
        if (result.kind === "delivered") {
          return this.deliver(requestId, productId);
        }
        return result;
      }
      default:
        return this.deliver(requestId, productId);
    }
  }

  async get(requestId: string): Promise<DeliveryResult> {
    this.calls.push({ op: "get", requestId });
    const existing = this.store.get(requestId);
    if (!existing) return { kind: "not_found" };
    return {
      kind: "delivered",
      status: existing.status,
      code: existing.code,
      createdAt: existing.createdAt,
    };
  }
}

export const fakeProvider = new FakeProvider();
