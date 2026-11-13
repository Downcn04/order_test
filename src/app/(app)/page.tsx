import { requirePageUser } from "@/lib/auth";
import { listTasksForUser } from "@/lib/tasks";
import { CompleteTaskButton } from "@/components/CompleteTaskButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();
  const tasks = await listTasksForUser(user.id);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm text-zinc-500">当前积分</p>
        <p className="mt-1 text-3xl font-semibold">{user.balance}</p>
        <p className="mt-2 text-sm text-zinc-500">
          完成任务获取积分，然后去商品页兑换数字商品。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">任务</h2>
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm"
          >
            <div>
              <p className="font-medium">{task.title}</p>
              <p className="text-sm text-zinc-500">{task.description}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-emerald-600">
                +{task.reward} 积分
              </span>
              <CompleteTaskButton
                taskId={task.id}
                reward={task.reward}
                completed={task.completed}
              />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
