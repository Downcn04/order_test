"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Props = {
  productId: string;
  productName: string;
  price: number;
  balance: number;
};

export function RedeemButton({
  productId,
  productName,
  price,
  balance,
}: Props) {
  const router = useRouter();
  const keyRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const affordable = balance >= price;

  async function redeem() {
    if (loading) return;
    if (!affordable) {
      setError("积分不足，先去做任务吧");
      return;
    }
    if (!window.confirm(`确认用 ${price} 积分兑换「${productName}」？`)) {
      return;
    }

    if (!keyRef.current) {
      keyRef.current = crypto.randomUUID();
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          idempotencyKey: keyRef.current,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "兑换失败");
      }
      keyRef.current = null;
      router.push("/orders");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "兑换失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={redeem}
        disabled={loading || !affordable}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        {loading ? "兑换中…" : `用 ${price} 积分兑换`}
      </button>
      {!affordable ? (
        <span className="text-xs text-zinc-500">还差 {price - balance} 积分</span>
      ) : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
