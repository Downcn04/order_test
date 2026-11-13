import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return ok({ user });
  });
}
