import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, handle, ok } from "@/lib/http";
import { createOrder, listOrders, toOrderView } from "@/lib/orders";

const schema = z.object({
  productId: z.string().min(1).max(100),
  idempotencyKey: z.string().min(8).max(100),
});

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const orders = await listOrders(user.id);
    return ok({ orders: orders.map((order) => toOrderView(order)) });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = schema.parse(await request.json());
    const order = await createOrder(
      user.id,
      body.productId,
      body.idempotencyKey,
    );
    return ok({ order: toOrderView(order) }, { status: 201 });
  });
}
