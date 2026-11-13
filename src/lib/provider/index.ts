import { env } from "../env";
import { fakeProvider } from "./fake";
import { RealProvider } from "./real";
import type { DeliveryProvider } from "./types";

let realProvider: RealProvider | null = null;

export function getProvider(): DeliveryProvider {
  if (env.providerMode === "real") {
    realProvider ??= new RealProvider();
    return realProvider;
  }
  return fakeProvider;
}

export { fakeProvider };
export { FakeProvider } from "./fake";
export type { FakeBehavior, FakeCall } from "./fake";
export type { DeliveryProvider, DeliveryResult } from "./types";
