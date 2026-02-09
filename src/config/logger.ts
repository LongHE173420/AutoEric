import pino, { Logger } from "pino";
import { ENV } from "./env";

// pino v9 includes multistream
const multistream = (pino as any).multistream as (streams: any[]) => any;

function baseOptions() {
  return {
    level: ENV.LOG_LEVEL,
    base: undefined, // do NOT add pid/hostname
    messageKey: "msg",
    timestamp: pino.stdTimeFunctions.isoTime,
    // Never leak fileName/filePath or other paths accidentally
    redact: {
      paths: ["fileName", "filePath"],
      remove: true,
    },
  };
}

export function createFileLogger(filePath: string): Logger {
  const fileStream = pino.destination({ dest: filePath, sync: false });
  const streams = [{ stream: process.stdout }, { stream: fileStream }];
  const logger = pino(baseOptions(), multistream(streams));
  return logger as Logger;
}

// Backward-compatible alias: worker expects "dual" (stdout + file).
// createFileLogger already writes to both stdout and file via multistream.
export function createDualLogger(filePath: string): Logger {
  return createFileLogger(filePath);
}

export function createConsoleLogger(): Logger {
  return pino(baseOptions()) as Logger;
}
