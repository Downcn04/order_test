import { ProxyAgent, fetch as undiciFetch } from "undici";
import type { Dispatcher } from "undici";
import { env, assertProviderConfig } from "../env";
import { classifyFetchError, classifyResponse } from "./errors";
import type { DeliveryProvider, DeliveryResult } from "./types";

type BodyReader = { text(): Promise<string> };

let cachedProxy: { url: string; dispatcher: Dispatcher } | null = null;

function proxyDispatcher(): Dispatcher | undefined {
  const url =
    process.env.DIGITAL_GOODS_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!url) return undefined;
  if (cachedProxy?.url !== url) {
    cachedProxy = { url, dispatcher: new ProxyAgent(url) };
  }
  return cachedProxy.dispatcher;
}

export class RealProvider implements DeliveryProvider {
  constructor() {
    assertProviderConfig();
  }

  private get baseUrl(): string {
    return env.digitalGoodsBaseUrl;
  }

  private get headers(): Record<string, string> {
    assertProviderConfig();
    return {
      Authorization: `Bearer ${env.digitalGoodsApiKey}`,
      "Content-Type": "application/json",
    };
  }

  async create(requestId: string, productId: string): Promise<DeliveryResult> {
    try {
      const response = await undiciFetch(`${this.baseUrl}/deliveries`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ requestId, productId }),
        signal: AbortSignal.timeout(env.providerTimeoutMs),
        dispatcher: proxyDispatcher(),
      });
      return classifyResponse(
        response.status,
        await parseBody(response),
        response.headers.get("retry-after"),
      );
    } catch (error) {
      return classifyFetchError(error);
    }
  }

  async get(requestId: string): Promise<DeliveryResult> {
    try {
      const response = await undiciFetch(
        `${this.baseUrl}/deliveries/${encodeURIComponent(requestId)}`,
        {
          headers: this.headers,
          signal: AbortSignal.timeout(env.providerTimeoutMs),
          dispatcher: proxyDispatcher(),
        },
      );
      return classifyResponse(
        response.status,
        await parseBody(response),
        response.headers.get("retry-after"),
      );
    } catch (error) {
      return classifyFetchError(error);
    }
  }
}

async function parseBody(response: BodyReader): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
