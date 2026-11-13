"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  taskId: string;
  reward: number;
  completed: boolean;
};

export function CompleteTaskButton({ taskId, reward, completed }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    if (loading || completed) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/complete`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "领取失败");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "领取失败");
    } finally {
      setLoading(false);
    }
  }

  if (completed) {
    return <span className="text-sm text-zinc-400">已完成</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={complete}
        disabled={loading}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {loading ? "领取中…" : `领取 +${reward}`}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
