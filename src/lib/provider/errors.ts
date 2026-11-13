import type { DeliveryResult } from "./types";

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

type ErrorBody = {
  error?: { code?: string; message?: string };
};

export function classifyResponse(
  status: number,
  body: unknown,
  retryAfterHeader?: string | null,
): DeliveryResult {
  const error = (body as ErrorBody | null)?.error;

  if (status >= 200 && status < 300) {
    const payload = body as
      | { status?: string; code?: string; createdAt?: string }
      | null;
    if (
      payload &&
      typeof payload.code === "string" &&
      payload.code.length > 0 &&
      payload.status === "delivered"
    ) {
      return {
        kind: "delivered",
        status: payload.status,
        code: payload.code,
        createdAt: payload.createdAt,
      };
    }
    return { kind: "retryable", reason: "Unexpected success payload" };
  }

  if (status === 404) return { kind: "not_found" };

  if (status === 401) {
    return {
      kind: "auth_error",
      reason: error?.message ?? "Unauthorized (check API key)",
    };
  }

  if (status === 429) {
    return {
      kind: "retryable",
      reason: error?.message ?? "Rate limited",
      retryAfterMs: parseRetryAfter(retryAfterHeader ?? null),
    };
  }

  if (status >= 500) {
    return {
      kind: "retryable",
      reason: error?.message ?? `Server error ${status}`,
    };
  }

  return {
    kind: "definitive_failure",
    httpStatus: status,
    code: error?.code ?? "INVALID_REQUEST",
    reason: error?.message ?? `Request failed with ${status}`,
  };
}

export function classifyFetchError(error: unknown): DeliveryResult {
  const name = (error as { name?: string } | null)?.name;
  const message = error instanceof Error ? error.message : String(error);
  if (name === "TimeoutError" || name === "AbortError") {
    return { kind: "retryable", reason: "Request timed out" };
  }
  return { kind: "retryable", reason: `Network error: ${message}` };
}
