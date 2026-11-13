import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./errors";

export { ApiError };

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, "FORBIDDEN", "Invalid origin");
  }
  if (!host || originHost !== host) {
    throw new ApiError(403, "FORBIDDEN", "Cross-origin request rejected");
  }
}

export async function handle(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) {
      return fail(error.status, error.code, error.message);
    }
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      return fail(400, "INVALID_REQUEST", issue?.message ?? "Invalid request");
    }
    if (error instanceof SyntaxError) {
      return fail(400, "INVALID_REQUEST", "Invalid JSON body");
    }
    console.error("[api] unhandled error", error);
    return fail(500, "INTERNAL", "Internal server error");
  }
}
