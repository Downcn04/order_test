import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { listTransactions } from "@/lib/points";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const items = await listTransactions(user.id);
    return ok({ items });
  });
}
