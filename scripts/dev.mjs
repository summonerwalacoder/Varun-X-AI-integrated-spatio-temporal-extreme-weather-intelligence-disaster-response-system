/**
 * Development launcher.
 *
 * Starts the VARUN-X API server in API-only mode and the Vite dev server in
 * the same terminal. The API owns the SQLite database and all upstream
 * provider calls; Vite serves the app and proxies /api to the API.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const API_PORT = process.env.VARUNX_API_PORT ?? "8787";
const API_HOST = process.env.HOST ?? "127.0.0.1";

const children = [];

function run(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => {
    console.log(`[dev] ${name} exited with code ${code}`);
    shutdown();
  });
  children.push(child);
  return child;
}

run("api", process.execPath, ["server/index.mjs"], {
  VARUNX_API_ONLY: "1",
  PORT: API_PORT,
  HOST: API_HOST,
});

run("vite", process.execPath, [join(ROOT, "node_modules", "vite", "bin", "vite.js")], {
  VARUNX_API_PROXY: `http://${API_HOST}:${API_PORT}`,
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
