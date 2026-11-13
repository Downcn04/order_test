import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/db";
import { ApiError } from "../../src/lib/errors";
import { createOrder } from "../../src/lib/orders";
import { claimAndProcess, processOrder } from "../../src/lib/reconciler";
import { fakeProvider } from "../../src/lib/provider";
import { completeTask } from "../../src/lib/tasks";

const userIds: string[] = [];
const productCodes: string[] = [];

async function makeUser(balance: number) {
  const user = await prisma.user.create({
    data: {
      email: `it-${randomUUID()}@example.com`,
      passwordHash: "x",
      displayName: "Integration Test",
      balance,
    },
  });
  userIds.push(user.id);
  return user;
}

async function makeProduct(options: {
  kind: "LOCAL" | "EXTERNAL";
  price: number;
  providerProductId?: string;
}) {
  const code = `it-${randomUUID().slice(0, 12)}`;
  const product = await prisma.product.create({
    data: {
      code,
      name: `Test ${code}`,
      description: "integration test product",
      kind: options.kind,
      providerProductId: options.providerProductId ?? null,
      price: options.price,
    },
  });
  productCodes.push(code);
  return product;
}

async function balanceOf(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { balance: true },
  });
  return user.balance;
}

async function ledgerSum(userId: string): Promise<number> {
  const result = await prisma.pointTransaction.aggregate({
    where: { userId },
    _sum: { delta: true },
  });
  return result._sum.delta ?? 0;
}

beforeEach(() => {
  fakeProvider.reset();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.product.deleteMany({ where: { code: { in: productCodes } } });
  await prisma.$disconnect();
});

describe("redeem concurrency", () => {
  it("only one of many concurrent orders can spend the last balance", async () => {
    const user = await makeUser(40);
    const product = await makeProduct({ kind: "LOCAL", price: 40 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        createOrder(user.id, product.id, randomUUID()),
      ),
    );

    const fulfilled = results.filter((item) => item.status === "fulfilled");
    const rejected = results.filter((item) => item.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    for (const item of rejected) {
      expect(item.reason).toBeInstanceOf(ApiError);
      expect((item.reason as ApiError).code).toBe("INSUFFICIENT_POINTS");
    }

    expect(await balanceOf(user.id)).toBe(0);
    expect(await ledgerSum(user.id)).toBe(-40);
    expect(
      await prisma.pointTransaction.count({
        where: { userId: user.id, type: "REDEEM" },
      }),
    ).toBe(1);
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
  });
});

describe("idempotent order creation", () => {
  it("debts once when the same idempotency key is submitted concurrently", async () => {
    const user = await makeUser(100);
    const product = await makeProduct({
      kind: "EXTERNAL",
      price: 60,
      providerProductId: "ebook",
    });
    const key = randomUUID();

    const [first, second] = await Promise.all([
      createOrder(user.id, product.id, key),
      createOrder(user.id, product.id, key),
    ]);

    expect(first.id).toBe(second.id);
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
    expect(await balanceOf(user.id)).toBe(40);

    const createCalls = fakeProvider.calls.filter((call) => call.op === "create");
    expect(createCalls).toHaveLength(1);
  });
});

describe("reconciliation after ambiguous timeout", () => {
  it("delivers the code found by requestId without charging twice", async () => {
    fakeProvider.pushBehavior({ type: "deliver_then_timeout" });
    const user = await makeUser(60);
    const product = await makeProduct({
      kind: "EXTERNAL",
      price: 60,
      providerProductId: "ebook",
    });

    const order = await createOrder(user.id, product.id, randomUUID());
    expect(order.status).toBe("PENDING");
    expect(await balanceOf(user.id)).toBe(0);

    const createCall = fakeProvider.calls.find((call) => call.op === "create");
    expect(createCall).toBeTruthy();

    await processOrder(order.id);

    const reconciled = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(reconciled.status).toBe("DELIVERED");
    expect(reconciled.code).toBeTruthy();
    expect(await balanceOf(user.id)).toBe(0);

    const getCall = fakeProvider.calls.find(
      (call) =>
        call.op === "get" && call.requestId === createCall?.requestId,
    );
    expect(getCall).toBeTruthy();
  });
});

describe("refund on definitive failure", () => {
  it("refunds exactly once and never on repeated reconciliation", async () => {
    fakeProvider.pushBehavior({ type: "http", status: 422 });
    const user = await makeUser(60);
    const product = await makeProduct({
      kind: "EXTERNAL",
      price: 60,
      providerProductId: "ebook",
    });

    const order = await createOrder(user.id, product.id, randomUUID());
    expect(order.status).toBe("REFUNDED");
    expect(await balanceOf(user.id)).toBe(60);

    await processOrder(order.id);
    await processOrder(order.id);

    expect(await balanceOf(user.id)).toBe(60);
    const refunds = await prisma.pointTransaction.count({
      where: { userId: user.id, type: "REFUND" },
    });
    expect(refunds).toBe(1);
    expect(await ledgerSum(user.id)).toBe(0);
  });
});

describe("task completion", () => {
  it("awards points only once per task", async () => {
    const user = await makeUser(0);
    const task = await prisma.task.create({
      data: {
        code: `it-task-${randomUUID().slice(0, 12)}`,
        title: "Integration task",
        description: "test",
        reward: 25,
      },
    });

    try {
      const balance = await completeTask(user.id, task.id);
      expect(balance).toBe(25);

      await expect(completeTask(user.id, task.id)).rejects.toMatchObject({
        code: "TASK_ALREADY_COMPLETED",
      });

      expect(await balanceOf(user.id)).toBe(25);
      const awards = await prisma.pointTransaction.count({
        where: { userId: user.id, type: "TASK" },
      });
      expect(awards).toBe(1);
    } finally {
      await prisma.task.delete({ where: { id: task.id } });
    }
  });
});

describe("worker claiming", () => {
  it("two workers claim different orders and never double process", async () => {
    fakeProvider.pushBehavior({ type: "deliver_then_timeout" });
    fakeProvider.pushBehavior({ type: "deliver_then_timeout" });
    const user = await makeUser(120);
    const product = await makeProduct({
      kind: "EXTERNAL",
      price: 60,
      providerProductId: "course",
    });

    const first = await createOrder(user.id, product.id, randomUUID());
    const second = await createOrder(user.id, product.id, randomUUID());
    expect(first.status).toBe("PENDING");
    expect(second.status).toBe("PENDING");

    await prisma.order.updateMany({
      where: { userId: user.id },
      data: { nextRetryAt: new Date(0) },
    });

    const [claimedA, claimedB] = await Promise.all([
      claimAndProcess(1),
      claimAndProcess(1),
    ]);
    expect(claimedA + claimedB).toBe(2);

    const orders = await prisma.order.findMany({
      where: { userId: user.id },
    });
    expect(orders.every((order) => order.status === "DELIVERED")).toBe(true);
    expect(new Set(orders.map((order) => order.code)).size).toBe(2);

    const createCalls = fakeProvider.calls.filter((call) => call.op === "create");
    const perRequest = new Map<string, number>();
    for (const call of createCalls) {
      perRequest.set(call.requestId, (perRequest.get(call.requestId) ?? 0) + 1);
    }
    expect([...perRequest.values()].every((count) => count === 1)).toBe(true);
  });
});
