import { requirePageUser } from "@/lib/auth";
import { listOrders } from "@/lib/orders";
import { OrdersPoller } from "@/components/OrdersPoller";
import { ReconcileButton } from "@/components/ReconcileButton";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyCodeButton } from "@/components/CopyCodeButton";

export const dynamic = "force-dynamic";

function formatTime(value: Date): string {
  return value.toLocaleString("zh-CN", { hour12: false });
}

export default async function OrdersPage() {
  const user = await requirePageUser();
  const orders = await listOrders(user.id);
  const hasPending = orders.some((order) => order.status === "PENDING");

  return (
    <div className="space-y-4">
      <OrdersPoller active={hasPending} />
      <h1 className="text-lg font-semibold">兑换记录</h1>

      {orders.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-sm text-zinc-500 shadow-sm">
          还没有兑换记录，去商品页看看吧。
        </p>
      ) : null}

      {orders.map((order) => (
        <div key={order.id} className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{order.product.name}</span>
            <StatusBadge status={order.status} />
            <span className="ml-auto text-sm text-zinc-500">
              -{order.pointsCost} 积分
            </span>
          </div>

          <p className="mt-1 text-xs text-zinc-400">
            下单时间 {formatTime(order.createdAt)}
            {order.deliveredAt
              ? ` · 到账时间 ${formatTime(order.deliveredAt)}`
              : ""}
          </p>

          {order.status === "PENDING" ? (
            <p className="mt-3 text-sm text-amber-700">
              处理中，页面会自动刷新；也可以稍后在兑换记录查看。
            </p>
          ) : null}

          {order.status === "REFUNDED" ? (
            <p className="mt-3 text-sm text-zinc-600">
              兑换失败，积分已退回。
            </p>
          ) : null}

          {order.status === "NEEDS_ATTENTION" ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">
                该订单需要人工确认{order.lastError ? `：${order.lastError}` : ""}
              </p>
              <ReconcileButton orderId={order.id} />
            </div>
          ) : null}

          {order.code ? (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-zinc-50 p-3">
              <span className="text-xs text-zinc-500">兑换码</span>
              <code className="font-mono text-sm">{order.code}</code>
              <CopyCodeButton code={order.code} />
            </div>
          ) : null}

          {order.status === "PENDING" && order.lastError ? (
            <p className="mt-2 text-xs text-zinc-400">
              最近一次重试：{order.lastError}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
