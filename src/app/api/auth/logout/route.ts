import { destroyCurrentSession } from "@/lib/auth";
import { assertSameOrigin, handle, ok } from "@/lib/http";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await destroyCurrentSession();
    return ok({ ok: true });
  });
}
