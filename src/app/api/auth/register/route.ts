import { z } from "zod";
import { createSession, registerUser } from "@/lib/auth";
import { assertSameOrigin, handle, ok } from "@/lib/http";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
  displayName: z.string().min(1).max(40),
});

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = schema.parse(await request.json());
    const user = await registerUser(
      body.email.trim().toLowerCase(),
      body.password,
      body.displayName.trim(),
    );
    await createSession(user.id);
    return ok({ user });
  });
}
