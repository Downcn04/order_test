import { env } from "../src/lib/env";
import { claimAndProcess } from "../src/lib/reconciler";
import { prisma } from "../src/lib/db";

let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const processed = await claimAndProcess();
    if (processed > 0) {
      console.log(`[worker] processed ${processed} order(s)`);
    }
  } catch (error) {
    console.error("[worker] tick failed", error);
  } finally {
    running = false;
  }
}

console.log(`[worker] started, interval=${env.workerIntervalMs}ms`);

void tick();
const timer = setInterval(() => void tick(), env.workerIntervalMs);

async function shutdown(): Promise<void> {
  clearInterval(timer);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
