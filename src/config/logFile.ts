import fs from "fs";
import path from "path";
import { ENV } from "./env";

export function ensureLogDir(): string {
  const dir = path.resolve(process.cwd(), ENV.LOG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getTodayLogPath() {
  const dir = ensureLogDir();
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const fileName = `login-worker-${yyyy}-${mm}-${dd}.log`;
  const filePath = path.join(dir, fileName);
  return { fileName, filePath };
}

function tryDeleteLog(fp: string, cutoff: number) {
  try {
    const st = fs.statSync(fp);
    if (!st.isFile()) return;
    if (st.mtimeMs < cutoff) fs.rmSync(fp, { force: true });
  } catch {
    // ignore
  }
}

export function cleanupOldLogs() {
  const dir = ensureLogDir();
  const days = ENV.LOG_RETENTION_DAYS;
  if (!Number.isFinite(days) || days <= 0) return;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  for (const name of fs.readdirSync(dir)) {
    tryDeleteLog(path.join(dir, name), cutoff);
  }
}
