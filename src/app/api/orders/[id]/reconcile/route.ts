import { requireUser } from "@/lib/auth";
import { ApiError, assertSameOrigin, handle, ok } from "@/lib/http";
import { reconcileOrder, toOrderView } from "@/lib/orders";
import { allowOnce } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    if (!allowOnce(`reconcile:${user.id}:${id}`, 5000)) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Please wait a few seconds before retrying",
      );
    }
    const order = await reconcileOrder(user.id, id);
    return ok({ order: toOrderView(order) });
  });
}
