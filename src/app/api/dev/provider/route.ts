import { z } from "zod";
import { env } from "@/lib/env";
import { assertSameOrigin, handle, ok, ApiError } from "@/lib/http";
import { fakeProvider, type FakeBehavior } from "@/lib/provider";

const schema = z.object({
  behavior: z.discriminatedUnion("type", [
    z.object({ type: z.literal("success") }),
    z.object({ type: z.literal("timeout") }),
    z.object({ type: z.literal("deliver_then_timeout") }),
    z.object({ type: z.literal("network") }),
    z.object({
      type: z.literal("http"),
      status: z.number().int().min(400).max(599),
      retryAfterSec: z.number().int().min(0).max(3600).optional(),
    }),
  ]),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    if (env.providerMode !== "fake") {
      throw new ApiError(
        409,
        "NOT_AVAILABLE",
        "Fault injection is only available with PROVIDER_MODE=fake",
      );
    }
    const body = schema.parse(await request.json());
    fakeProvider.pushBehavior(body.behavior as FakeBehavior);
    return ok({ ok: true });
  });
}
