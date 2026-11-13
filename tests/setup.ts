import { loadEnv } from "vite";

const loaded = loadEnv("development", process.cwd(), "");
for (const [key, value] of Object.entries(loaded)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

process.env.PROVIDER_MODE = "fake";
