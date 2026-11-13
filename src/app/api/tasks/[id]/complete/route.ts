import { requireUser } from "@/lib/auth";
import { assertSameOrigin, handle, ok } from "@/lib/http";
import { completeTask } from "@/lib/tasks";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const balance = await completeTask(user.id, id);
    return ok({ balance });
  });
}
