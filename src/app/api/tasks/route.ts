import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { listTasksForUser } from "@/lib/tasks";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const tasks = await listTasksForUser(user.id);
    return ok({ tasks });
  });
}
