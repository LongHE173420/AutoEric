import pino, { Logger as PinoLogger } from "pino";
import fs from "fs";
import path from "path";
import { ENV } from "../config/env";

// --- LOG MASKING UTILS ---

export function maskSecret(s: string, allowPlaintext: boolean, label?: string) {
  const v = String(s ?? "");
  if (allowPlaintext) return v;
  const len = v.length;
  const tag = label ? `${label}` : "***";
  return `${tag}len=${len}`;
}

export function maskPassword(pw: string) {
  return maskSecret(pw, ENV.LOG_PASSWORD_PLAINTEXT, "***");
}

export function maskOtp(otp: string) {
  return maskSecret(otp, ENV.LOG_OTP_PLAINTEXT, "***");
}

export function maskToken(token: string) {
  if (!token) return "";
  const t = String(token);
  if (t.length <= 12) return "***";
  return `${t.slice(0, 8)}...${t.slice(-6)}`;
}

// --- LOG FILE UTILS ---

export function ensureLogDir(): string {
  const dir = path.resolve(process.cwd(), ENV.LOG_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
    if (!fs.existsSync(fp)) return;
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

  try {
    for (const name of fs.readdirSync(dir)) {
      tryDeleteLog(path.join(dir, name), cutoff);
    }
  } catch (e) {
  }
}

type LogLevel = "debug" | "info" | "warn" | "error";

const multistream = (pino as any).multistream as (streams: any[]) => any;

export class Log {
  private static root: PinoLogger;
  private static initialized = false;

  static init(opts?: {
    appName?: string;
    env?: string;
    level?: LogLevel;
    logId?: number | string;
    filePath?: string;
  }) {
    if (this.initialized) return;

    const baseConfig = {
      level: opts?.level ?? (process.env.LOG_LEVEL as LogLevel),
      base: {
        app: opts?.appName,
        env: opts?.env ?? process.env.NODE_ENV,
        logId: opts?.logId ?? Date.now(),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    };

    if (opts?.filePath) {
      const fileStream = pino.destination({ dest: opts.filePath, sync: false });
      const streams = [{ stream: fileStream }];
      if (process.env.LOG_CONSOLE === "true" || process.env.LOG_CONSOLE === "1") {
        streams.push({ stream: pino.destination(1) });
      }
      this.root = pino(baseConfig, multistream(streams));
    } else {
      if (process.env.LOG_CONSOLE === "true" || process.env.LOG_CONSOLE === "1") {
        this.root = pino(baseConfig);
      } else {
        this.root = pino({ ...baseConfig, level: "silent" });
      }
    }

    this.initialized = true;
  }

  static getLogger(name: string) {
    if (!this.initialized) {
      this.init();
    }

    const logger = this.root.child({ logger: name });

    return {
      debug: (msg: string, obj?: any) => logger.debug(obj || {}, msg),
      info: (msg: string, obj?: any) => logger.info(obj || {}, msg),
      warn: (msg: string, obj?: any) => logger.warn(obj || {}, msg),
      error: (msg: string, obj?: any) => logger.error(obj || {}, msg),
    };
  }
}
