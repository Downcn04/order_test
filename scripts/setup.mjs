#!/usr/bin/env node
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { connect } from "node:net";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

if (!existsSync(examplePath)) {
  console.error("[setup] Missing .env.example");
  process.exit(1);
}

if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  console.log("[setup] Created .env from .env.example");
}

const env = parseEnv(readFileSync(envPath, "utf8"));
const databaseUrl = process.env.DATABASE_URL || env.DATABASE_URL;

if (!databaseUrl) {
  console.error("[setup] DATABASE_URL is not set in .env");
  process.exit(1);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) {
  console.error(
    `[setup] Node.js >= 20.9 is required, current: ${process.versions.node}`,
  );
  process.exit(1);
}

const reachable = await checkTcp(databaseUrl);
if (!reachable.ok) {
  console.error(
    `\n[setup] Cannot reach PostgreSQL at ${reachable.host}:${reachable.port} (${reachable.reason}).`,
  );
  console.error("[setup] Start a database first:\n");
  console.error("  Docker:        docker compose up -d");
  console.error("  Windows local: npm run setup:local-db");
  console.error("\nThen run: npm run setup\n");
  process.exit(1);
}

run("npx", ["prisma", "migrate", "deploy"]);
run("npx", ["prisma", "db", "seed"]);

console.log(`
[setup] Database ready.

Next:
  npm run start:all     # web + reconciliation worker
  or
  npm run dev           # web only
  npm run worker        # worker only (separate terminal)

Open http://localhost:3000
Accounts:
  alice@example.com / demo1234
  bob@example.com   / demo1234
`);

function parseEnv(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

function checkTcp(urlString) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      resolve({ ok: false, host: "?", port: "?", reason: "invalid DATABASE_URL" });
      return;
    }

    const host = parsed.hostname;
    const port = Number(parsed.port || 5432);
    const socket = connect({ host, port, timeout: 3000 });
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.once("connect", () => finish({ ok: true, host, port }));
    socket.once("timeout", () =>
      finish({ ok: false, host, port, reason: "connection timed out" }),
    );
    socket.once("error", (error) =>
      finish({ ok: false, host, port, reason: error.message }),
    );
  });
}

function run(command, args) {
  console.log(`\n[setup] > ${command} ${args.join(" ")}`);
  const outcome = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (outcome.status !== 0) {
    process.exit(outcome.status ?? 1);
  }
}
