import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { getOrderView } from "@/lib/orders";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const order = await getOrderView(user.id, id);
    return ok({ order });
  });
}
