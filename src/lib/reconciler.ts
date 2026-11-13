import { env } from "./env";
import { applyDeliveryResult } from "./orders";
import { prisma } from "./db";
import { getProvider } from "./provider";

export async function processOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { product: true },
  });
  if (!order || order.status !== "PENDING") return;

  const provider = getProvider();
  const current = await provider.get(order.requestId);

  if (current.kind === "delivered") {
    await applyDeliveryResult(order.id, current);
    return;
  }

  if (current.kind === "not_found") {
    if (!order.product.providerProductId) return;
    const created = await provider.create(
      order.requestId,
      order.product.providerProductId,
    );
    await applyDeliveryResult(order.id, created);
    return;
  }

  await applyDeliveryResult(order.id, current);
}

export async function claimAndProcess(
  limit = env.workerBatchSize,
): Promise<number> {
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Order"
    SET "nextRetryAt" = now() + interval '60 seconds'
    WHERE id IN (
      SELECT id
      FROM "Order"
      WHERE status = 'PENDING' AND "nextRetryAt" <= now()
      ORDER BY "nextRetryAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;

  for (const row of claimed) {
    await processOrder(row.id);
  }

  return claimed.length;
}
