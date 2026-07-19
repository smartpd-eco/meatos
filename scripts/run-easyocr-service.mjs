import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const port = String(process.env.EASYOCR_PORT || "8765");
const child = spawn("python", [
  "-m",
  "uvicorn",
  "app.main:app",
  "--app-dir",
  "services/ocr-service",
  "--host",
  "127.0.0.1",
  "--port",
  port
], {
  cwd: resolve(root),
  env: process.env,
  stdio: "inherit",
  windowsHide: true
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
