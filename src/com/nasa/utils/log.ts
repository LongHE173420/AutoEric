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
type PinoDestination = ReturnType<typeof pino.destination>;

function pad(value: number, length = 2) {
  return String(Math.trunc(Math.abs(value))).padStart(length, "0");
}

function getLocalIsoTimestamp() {
  const d = new Date();
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  const millis = pad(d.getMilliseconds(), 3);
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const offsetRemainder = pad(Math.abs(offsetMinutes) % 60);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${millis}${sign}${offsetHours}:${offsetRemainder}`;
}

export class Log {
  private static root: PinoLogger;
  private static consoleRoot?: PinoLogger;
  private static fileRoot?: PinoLogger;
  private static consoleStream?: PinoDestination;
  private static fileStream?: PinoDestination;
  private static baseConfig: any;
  private static configuredFilePath?: string;
  private static fileLoggingEnabled = false;
  private static initialized = false;

  private static shouldWriteToFile(msg: string) {
    return !(
      (msg.endsWith("_PRESIGNED_REQUEST") || msg.endsWith("_PRESIGNED_RESPONSE"))
    );
  }

  private static compactForFile(msg: string, obj?: any) {
    if (!obj || typeof obj !== "object") return obj;

    const clone: any = { ...obj };
    const keepPayload =
      msg === "VIDEO_POST_CREATE_REQUEST"
      || msg === "VIDEO_POST_COMPLETE_REQUEST"
      || msg.endsWith("_PRESIGNED_REQUEST_FAILED");
    const keepHttpDebug =
      msg === "VIDEO_THUMBNAIL_UPLOAD_FAILED"
      || msg.endsWith("_DIRECT_UPLOAD_FAILED")
      || msg.endsWith("_PRESIGNED_REQUEST_FAILED")
      || msg.endsWith("_S3_UPLOAD_FAILED")
      || msg.startsWith("MISSION_IGNORED");

    if (!keepPayload) {
      delete clone.payload;
    }
    delete clone.responseData;
    if (!msg.endsWith("_S3_UPLOAD_FAILED")) {
      delete clone.uploadFields;
    }
    if (!keepHttpDebug) {
      delete clone.requestDebug;
      delete clone.requestHeaders;
      delete clone.responseHeaders;
    }

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

    this.baseConfig = {
      level: opts?.level ?? (process.env.LOG_LEVEL as LogLevel),
      base: {
        app: opts?.appName,
      },
      formatters: {
        level: (label: string, number: number) => ({
          level: label.toUpperCase(),
          levelValue: number
        })
      },
      timestamp: () => `,"time":"${getLocalIsoTimestamp()}"`,
    };

    if (opts?.filePath) {
      this.fileLoggingEnabled = true;
      this.configuredFilePath = opts.filePath;
      if (process.env.LOG_CONSOLE === "true" || process.env.LOG_CONSOLE === "1") {
        this.consoleStream = pino.destination(1);
        this.consoleRoot = pino(this.baseConfig, this.consoleStream);
      }
      this.rotateFileLogger(opts.filePath);
    } else {
      if (process.env.LOG_CONSOLE === "true" || process.env.LOG_CONSOLE === "1") {
        this.consoleRoot = pino(this.baseConfig);
        this.root = this.consoleRoot;
      } else {
        this.root = pino({ ...this.baseConfig, level: "silent" });
      }
    }

    this.initialized = true;
  }

  private static ensureFileExists(filePath: string) {
    if (!fs.existsSync(filePath)) {
      try {
        fs.writeFileSync(filePath, "\uFEFF");
      } catch (e) {
        // ignore
      }
    }
  }

  private static rotateFileLogger(filePath: string) {
    this.ensureFileExists(filePath);

    const nextFileStream = pino.destination({ dest: filePath, sync: false });
    const nextFileRoot = pino(this.baseConfig, nextFileStream);
    const streams = [{ stream: nextFileStream }];
    if (this.consoleStream) {
      streams.push({ stream: this.consoleStream });
    }

    const previousFileStream = this.fileStream;

    this.fileStream = nextFileStream;
    this.fileRoot = nextFileRoot;
    this.configuredFilePath = filePath;
    this.root = pino(this.baseConfig, multistream(streams));

    if (previousFileStream && previousFileStream !== nextFileStream) {
      try {
        previousFileStream.flushSync?.();
      } catch (e) {
        // ignore
      }
      try {
        previousFileStream.end?.();
      } catch (e) {
        // ignore
      }
    }
  }

  private static ensureDailyFileRotation() {
    if (!this.fileLoggingEnabled) return;

    const { filePath } = getTodayLogPath();
    if (this.configuredFilePath === filePath && this.fileRoot) return;

    this.rotateFileLogger(filePath);
  }

  static getLogger(name: string) {
    if (!this.initialized) {
      this.init();
    }

    const write = (level: LogLevel, msg: string, obj?: any) => {
      this.ensureDailyFileRotation();

      const logger = this.root.child({ logger: name });
      const consoleLogger = this.consoleRoot?.child({ logger: name });
      const fileLogger = this.fileRoot?.child({ logger: name });
      const payload = {
        ...(obj || {}),
        event: obj?.event || msg
      };

      if (consoleLogger) {
        (consoleLogger as any)[level](payload, msg);
      } else if (!fileLogger) {
        (logger as any)[level](payload, msg);
      }

      if (fileLogger && this.shouldWriteToFile(msg)) {
        (fileLogger as any)[level](this.compactForFile(msg, payload) || {}, msg);
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
