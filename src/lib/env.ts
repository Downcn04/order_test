function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-insecure-secret",
  sessionTtlDays: toNumber(process.env.SESSION_TTL_DAYS, 7),
  providerMode: (process.env.PROVIDER_MODE === "real" ? "real" : "fake") as
    | "real"
    | "fake",
  digitalGoodsBaseUrl: (
    process.env.DIGITAL_GOODS_BASE_URL ??
    "https://digital-goods-api.vercel.app/api/v1"
  ).replace(/\/$/, ""),
  digitalGoodsApiKey: process.env.DIGITAL_GOODS_API_KEY ?? "",
  providerTimeoutMs: toNumber(process.env.PROVIDER_TIMEOUT_MS, 8000),
  workerIntervalMs: toNumber(process.env.WORKER_INTERVAL_MS, 20000),
  workerBatchSize: toNumber(process.env.WORKER_BATCH_SIZE, 3),
};

export function assertProviderConfig(): void {
  if (env.providerMode === "real" && !env.digitalGoodsApiKey) {
    throw new Error(
      "DIGITAL_GOODS_API_KEY is required when PROVIDER_MODE=real",
    );
  }
}
