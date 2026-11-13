import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { makeLocalCode, makeRequestId, newOrderId } from "./ids";
import { debitForOrder } from "./points";
import { getProduct } from "./products";
import { getProvider } from "./provider";
import type { DeliveryResult } from "./provider/types";
import { isUniqueViolation } from "./prisma-errors";

const MAX_ATTEMPTS = 8;
const BACKOFF_MS = [
  5_000, 20_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000,
];
const CLAIM_GRACE_MS = 60_000;

export type OrderWithProduct = Prisma.OrderGetPayload<{
  include: { product: true };
}>;

export type OrderView = {
  id: string;
  productName: string;
  productCode: string;
  status: OrderStatus;
  pointsCost: number;
  code: string | null;
  lastError: string | null;
  attemptCount: number;
  createdAt: Date;
  deliveredAt: Date | null;
  events: {
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: Date;
  }[];
};

export function toOrderView(
  order: OrderWithProduct & {
    events?: {
      fromStatus: string | null;
      toStatus: string;
      note: string | null;
      createdAt: Date;
    }[];
  },
): OrderView {
  return {
    id: order.id,
    productName: order.product.name,
    productCode: order.product.code,
    status: order.status,
    pointsCost: order.pointsCost,
    code: order.code,
    lastError: order.lastError,
    attemptCount: order.attemptCount,
    createdAt: order.createdAt,
    deliveredAt: order.deliveredAt,
    events: order.events ?? [],
  };
}

function scheduleRetry(attempt: number, retryAfterMs?: number): Date {
  const base = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
  const jitter = Math.round(base * 0.2 * Math.random());
  const delay = Math.max(base + jitter, retryAfterMs ?? 0);
  return new Date(Date.now() + delay);
}

export async function createOrder(
  userId: string,
  productId: string,
  idempotencyKey: string,
): Promise<OrderWithProduct> {
  const product = await getProduct(productId);
  if (!product) {
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }
  if (product.kind === "EXTERNAL" && !product.providerProductId) {
    throw new ApiError(
      422,
      "PRODUCT_UNAVAILABLE",
      "Product is not configured for external delivery",
    );
  }

  const existing = await prisma.order.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
    include: { product: true },
  });
  if (existing) {
    if (existing.productId !== product.id) {
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key was already used for a different product",
      );
    }
    return existing;
  }

  const orderId = newOrderId();
  const requestId = makeRequestId(orderId);

  let order: OrderWithProduct;
  try {
    order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          id: orderId,
          userId,
          productId: product.id,
          idempotencyKey,
          requestId,
          pointsCost: product.price,
          status: "PENDING",
          nextRetryAt: new Date(Date.now() + CLAIM_GRACE_MS),
        },
        include: { product: true },
      });

      await debitForOrder(tx, userId, product.price, created.id);

      await tx.orderEvent.create({
        data: {
          orderId: created.id,
          toStatus: "PENDING",
          note: "Order created, points deducted",
        },
      });

      if (product.kind === "LOCAL") {
        const delivered = await tx.order.update({
          where: { id: created.id },
          data: {
            status: "DELIVERED",
            code: makeLocalCode(),
            deliveredAt: new Date(),
          },
          include: { product: true },
        });
        await tx.orderEvent.create({
          data: {
            orderId: created.id,
            fromStatus: "PENDING",
            toStatus: "DELIVERED",
            note: "Local product delivered",
          },
        });
        return delivered;
      }

      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const duplicate = await prisma.order.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
        include: { product: true },
      });
      if (duplicate) {
        if (duplicate.productId !== product.id) {
          throw new ApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key was already used for a different product",
          );
        }
        return duplicate;
      }
    }
    throw error;
  }

  if (product.kind === "EXTERNAL" && product.providerProductId) {
    const result = await getProvider().create(requestId, product.providerProductId);
    await applyDeliveryResult(order.id, result);
  }

  return prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { product: true },
  });
}

export async function applyDeliveryResult(
  orderId: string,
  result: DeliveryResult,
  options?: { from?: OrderStatus[] },
): Promise<void> {
  if (result.kind === "not_found") {
    result = { kind: "retryable", reason: "Delivery not found after create" };
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const from = options?.from ?? ["PENDING"];
  if (!from.includes(order.status)) return;

  if (result.kind === "delivered") {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: from } },
        data: {
          status: "DELIVERED",
          code: result.code,
          providerStatus: result.status,
          deliveredAt: new Date(),
          lastError: null,
        },
      });
      if (updated.count === 1) {
        await tx.orderEvent.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: "DELIVERED",
            note: `Delivered by provider (${result.status})`,
          },
        });
      }
    });
    return;
  }

  if (result.kind === "definitive_failure") {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: from } },
        data: {
          status: "REFUNDED",
          providerStatus: result.code,
          lastError: result.reason,
        },
      });
      if (updated.count === 1) {
        const user = await tx.user.update({
          where: { id: order.userId },
          data: { balance: { increment: order.pointsCost } },
          select: { balance: true },
        });
        await tx.pointTransaction.create({
          data: {
            userId: order.userId,
            delta: order.pointsCost,
            balanceAfter: user.balance,
            type: "REFUND",
            refType: "order",
            refId: order.id,
          },
        });
        await tx.orderEvent.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: "REFUNDED",
            note: `${result.httpStatus} ${result.code}: ${result.reason}`,
          },
        });
      }
    });
    return;
  }

  if (result.kind === "auth_error") {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: from } },
        data: {
          status: "NEEDS_ATTENTION",
          providerStatus: "auth_error",
          lastError: result.reason,
        },
      });
      if (updated.count === 1) {
        await tx.orderEvent.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: "NEEDS_ATTENTION",
            note: result.reason,
          },
        });
      }
    });
    return;
  }

  if (result.kind !== "retryable") return;

  const attempt = order.attemptCount + 1;
  if (attempt >= MAX_ATTEMPTS) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: from } },
        data: {
          status: "NEEDS_ATTENTION",
          attemptCount: attempt,
          lastError: result.reason,
        },
      });
      if (updated.count === 1) {
        await tx.orderEvent.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: "NEEDS_ATTENTION",
            note: `Retries exhausted: ${result.reason}`,
          },
        });
      }
    });
    return;
  }

  await prisma.order.updateMany({
    where: { id: orderId, status: { in: from } },
    data: {
      attemptCount: attempt,
      lastError: result.reason,
      nextRetryAt: scheduleRetry(
        attempt,
        result.kind === "retryable" ? result.retryAfterMs : undefined,
      ),
    },
  });
}

export async function getOrderView(
  userId: string,
  orderId: string,
): Promise<OrderView> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: {
      product: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found");
  return toOrderView(order);
}

export async function listOrders(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function reconcileOrder(
  userId: string,
  orderId: string,
): Promise<OrderWithProduct> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { product: true },
  });
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found");
  if (order.status === "DELIVERED" || order.status === "REFUNDED") {
    return order;
  }

  const from: OrderStatus[] = ["PENDING", "NEEDS_ATTENTION"];
  const provider = getProvider();

  const current = await provider.get(order.requestId);
  if (current.kind === "delivered") {
    await applyDeliveryResult(order.id, current, { from });
  } else if (current.kind === "not_found") {
    if (order.product.providerProductId) {
      const created = await provider.create(
        order.requestId,
        order.product.providerProductId,
      );
      await applyDeliveryResult(order.id, created, { from });
    }
  } else {
    await applyDeliveryResult(order.id, current, { from });
  }

  return prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { product: true },
  });
}
