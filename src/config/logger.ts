import pino, { Logger } from "pino";
import { ENV } from "./env";


const multistream = (pino as any).multistream as (streams: any[]) => any;

function baseOptions() {
  return {
    level: ENV.LOG_LEVEL,
    base: undefined,
    messageKey: "msg",
    timestamp: pino.stdTimeFunctions.isoTime,

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
export function createDualLogger(filePath: string): Logger {
  return createFileLogger(filePath);
}

export function createConsoleLogger(): Logger {
  return pino(baseOptions()) as Logger;
}
