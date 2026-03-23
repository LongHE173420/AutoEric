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
  private static consoleRoot?: PinoLogger;
  private static fileRoot?: PinoLogger;
  private static initialized = false;

  private static shouldWriteToFile(msg: string) {
    return !(
      (msg.includes("_PRESIGNED_REQUEST") || msg.includes("_PRESIGNED_RESPONSE")) ||
      msg === "VIDEO_POST_CREATE_REQUEST"
    );
  }

  private static compactForFile(msg: string, obj?: any) {
    if (!obj || typeof obj !== "object") return obj;

    const clone: any = { ...obj };
    delete clone.payload;
    delete clone.responseData;
    delete clone.uploadFields;
    delete clone.requestDebug;
    delete clone.requestHeaders;
    delete clone.responseHeaders;

    if (clone.detail && typeof clone.detail === "object") {
      clone.detail = "[object]";
    }

    return clone;
  }

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
      },
      timestamp: () => `,"time":"${new Date().toISOString().split('T')[1].split('Z')[0]}"`,
    };

    if (opts?.filePath) {
      const fileStream = pino.destination({ dest: opts.filePath, sync: false });
      this.fileRoot = pino(baseConfig, fileStream);
      if (process.env.LOG_CONSOLE === "true" || process.env.LOG_CONSOLE === "1") {
        this.consoleRoot = pino(baseConfig, pino.destination(1));
      }
      const streams = [{ stream: fileStream }];
      if (this.consoleRoot) streams.push({ stream: pino.destination(1) });
      this.root = pino(baseConfig, multistream(streams));
    } else {
      if (process.env.LOG_CONSOLE === "true" || process.env.LOG_CONSOLE === "1") {
        this.consoleRoot = pino(baseConfig);
        this.root = this.consoleRoot;
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
    const consoleLogger = this.consoleRoot?.child({ logger: name });
    const fileLogger = this.fileRoot?.child({ logger: name });

    const write = (level: LogLevel, msg: string, obj?: any) => {
      if (consoleLogger) {
        (consoleLogger as any)[level](obj || {}, msg);
      } else if (!fileLogger) {
        (logger as any)[level](obj || {}, msg);
      }

      if (fileLogger && this.shouldWriteToFile(msg)) {
        (fileLogger as any)[level](this.compactForFile(msg, obj) || {}, msg);
      }
    };

    return {
      debug: (msg: string, obj?: any) => write("debug", msg, obj),
      info: (msg: string, obj?: any) => write("info", msg, obj),
      warn: (msg: string, obj?: any) => write("warn", msg, obj),
      error: (msg: string, obj?: any) => write("error", msg, obj),
    };
  }
}
