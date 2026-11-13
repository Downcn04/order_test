import { randomUUID } from "node:crypto";

export function newOrderId(): string {
  return randomUUID();
}

export function makeRequestId(orderId: string): string {
  return `ord${orderId.replace(/-/g, "")}`;
}

export function makeLocalCode(): string {
  return `LOCAL-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}
