import { prisma } from "./db";
import { ApiError } from "./errors";
import { isUniqueViolation } from "./prisma-errors";

export type TaskView = {
  id: string;
  code: string;
  title: string;
  description: string;
  reward: number;
  completed: boolean;
};

export async function listTasksForUser(userId: string): Promise<TaskView[]> {
  const [tasks, completions] = await Promise.all([
    prisma.task.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    prisma.taskCompletion.findMany({
      where: { userId },
      select: { taskId: true },
    }),
  ]);

  const completed = new Set(completions.map((item) => item.taskId));

  return tasks.map((task) => ({
    id: task.id,
    code: task.code,
    title: task.title,
    description: task.description,
    reward: task.reward,
    completed: completed.has(task.id),
  }));
}

export async function completeTask(
  userId: string,
  taskIdOrCode: string,
): Promise<number> {
  const task = await prisma.task.findFirst({
    where: {
      active: true,
      OR: [{ id: taskIdOrCode }, { code: taskIdOrCode }],
    },
  });
  if (!task) throw new ApiError(404, "NOT_FOUND", "Task not found");

  try {
    return await prisma.$transaction(async (tx) => {
      const completion = await tx.taskCompletion.create({
        data: { userId, taskId: task.id, points: task.reward },
      });

      const user = await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: task.reward } },
        select: { balance: true },
      });

      await tx.pointTransaction.create({
        data: {
          userId,
          delta: task.reward,
          balanceAfter: user.balance,
          type: "TASK",
          refType: "task_completion",
          refId: completion.id,
        },
      });

      return user.balance;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        "TASK_ALREADY_COMPLETED",
        "Task already completed",
      );
    }
    throw error;
  }
}
