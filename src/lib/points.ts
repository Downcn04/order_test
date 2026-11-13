import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { ApiError } from "./errors";

type Tx = Prisma.TransactionClient;

export async function debitForOrder(
  tx: Tx,
  userId: string,
  cost: number,
  orderId: string,
): Promise<number> {
  const updated = await tx.user.updateMany({
    where: { id: userId, balance: { gte: cost } },
    data: { balance: { decrement: cost } },
  });
  if (updated.count === 0) {
    throw new ApiError(409, "INSUFFICIENT_POINTS", "Not enough points");
  }

  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { balance: true },
  });

  await tx.pointTransaction.create({
    data: {
      userId,
      delta: -cost,
      balanceAfter: user.balance,
      type: "REDEEM",
      refType: "order",
      refId: orderId,
    },
  });

  return user.balance;
}

export async function getBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { balance: true },
  });
  return user.balance;
}

export async function listTransactions(userId: string, limit = 50) {
  return prisma.pointTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
