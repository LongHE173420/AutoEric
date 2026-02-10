import pino, { Logger as PinoLogger } from "pino";

type LogLevel = "debug" | "info" | "warn" | "error";

export class Log {
  private static root: PinoLogger;
  private static initialized = false;

  /* ================= INIT (như logback.xml) ================= */

  static init(opts?: {
    appName?: string;
    env?: string;
    level?: LogLevel;
    logId?: number | string;
  }) {
    if (this.initialized) return;

    this.root = pino({
      level: opts?.level ?? (process.env.LOG_LEVEL as LogLevel) ?? "info",
      base: {
        app: opts?.appName ?? "app",
        env: opts?.env ?? process.env.NODE_ENV ?? "dev",
        logId: opts?.logId ?? Date.now(),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });

    this.initialized = true;
  }

  /* ================= LOGGER FACTORY ================= */

  static getLogger(name: string) {
    if (!this.initialized) {
      this.init(); // auto-init an toàn
    }

    const logger = this.root.child({ logger: name });

    return {
      debug: (msg: string, obj?: any) => logger.debug(obj, msg),
      info: (msg: string, obj?: any) => logger.info(obj, msg),
      warn: (msg: string, obj?: any) => logger.warn(obj, msg),
      error: (msg: string, obj?: any) => logger.error(obj, msg),
    };
  }
}
