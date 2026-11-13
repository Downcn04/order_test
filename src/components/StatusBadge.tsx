const LABELS: Record<string, { text: string; className: string }> = {
  PENDING: { text: "处理中", className: "bg-amber-100 text-amber-700" },
  DELIVERED: { text: "已到账", className: "bg-emerald-100 text-emerald-700" },
  REFUNDED: { text: "已退款", className: "bg-zinc-200 text-zinc-600" },
  NEEDS_ATTENTION: { text: "需处理", className: "bg-red-100 text-red-700" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = LABELS[status] ?? {
    text: status,
    className: "bg-zinc-200 text-zinc-600",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.text}
    </span>
  );
}
