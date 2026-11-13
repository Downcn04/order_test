import { requirePageUser } from "@/lib/auth";
import { listTransactions } from "@/lib/points";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  TASK: "完成任务",
  REDEEM: "兑换商品",
  REFUND: "兑换退款",
};

function formatTime(value: Date): string {
  return value.toLocaleString("zh-CN", { hour12: false });
}

export default async function PointsPage() {
  const user = await requirePageUser();
  const items = await listTransactions(user.id);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">积分流水</h1>
        <p className="text-sm text-zinc-500">
          当前余额：
          <span className="font-medium text-zinc-900">{user.balance}</span>
        </p>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">时间</th>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 text-right font-medium">变动</th>
              <th className="px-4 py-3 text-right font-medium">余额</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                  暂无流水
                </td>
              </tr>
            ) : null}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-zinc-100">
                <td className="px-4 py-3 text-zinc-500">
                  {formatTime(item.createdAt)}
                </td>
                <td className="px-4 py-3">{TYPE_LABELS[item.type] ?? item.type}</td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    item.delta >= 0 ? "text-emerald-600" : "text-zinc-900"
                  }`}
                >
                  {item.delta > 0 ? `+${item.delta}` : item.delta}
                </td>
                <td className="px-4 py-3 text-right text-zinc-500">
                  {item.balanceAfter}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
