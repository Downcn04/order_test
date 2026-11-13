import { z } from "zod";
import { createSession, loginUser } from "@/lib/auth";
import { assertSameOrigin, handle, ok } from "@/lib/http";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(72),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = schema.parse(await request.json());
    const user = await loginUser(
      body.email.trim().toLowerCase(),
      body.password,
    );
    await createSession(user.id);
    return ok({ user });
  });
}
