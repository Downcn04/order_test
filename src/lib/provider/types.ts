export type DeliveryResult =
  | {
      kind: "delivered";
      status: string;
      code: string;
      createdAt?: string;
    }
  | { kind: "not_found" }
  | { kind: "retryable"; reason: string; retryAfterMs?: number }
  | {
      kind: "definitive_failure";
      httpStatus: number;
      code: string;
      reason: string;
    }
  | { kind: "auth_error"; reason: string };

export interface DeliveryProvider {
  create(requestId: string, productId: string): Promise<DeliveryResult>;
  get(requestId: string): Promise<DeliveryResult>;
}
