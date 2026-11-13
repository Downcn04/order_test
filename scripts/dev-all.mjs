#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const children = [];
let shuttingDown = false;

function start(name, command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: isWindows,
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.log(`[dev-all] ${name} exited (${code ?? signal}); stopping others`);
    shutdown();
  });

  children.push({ name, child });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const { child } of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (isWindows) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start("web", "npx", ["next", "dev"]);
start("worker", "npx", ["tsx", "scripts/worker.ts"]);
