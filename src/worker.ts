import { ENV } from "./config/env";
import { cleanupOldLogs, getTodayLogPath } from "./config/logFile";
import { createDualLogger } from "./config/logger";
import { AuthServiceApi } from "./api/authService";
import { loginFromDb } from "./services/login-from-db.service";
import { AppDataSource } from "./config/data-source";

let isRunning = false;
let started = false;

async function runOnce(reason: string) {
  if (isRunning) return;
  isRunning = true;

  try {
    cleanupOldLogs();

    const { filePath } = getTodayLogPath();
    const logger = createDualLogger(filePath).child({ job: "login" });
    const api = new AuthServiceApi(ENV.BASE_URL);

    if (!started) {
      started = true;
      logger.debug(
        {
          config: {
            BASE_URL: ENV.BASE_URL,
            MYSQL_HOST: ENV.MYSQL_HOST,
            MYSQL_PORT: ENV.MYSQL_PORT,
            MYSQL_DATABASE: ENV.MYSQL_DATABASE,
            INTERVAL_MS: ENV.INTERVAL_MS,
            RUN_ONCE: ENV.RUN_ONCE,
            AUTO_FETCH_OTP: ENV.AUTO_FETCH_OTP,
            AUTO_RESEND: ENV.AUTO_RESEND,
            PROMPT_OTP: ENV.PROMPT_OTP,
            OTP_TIMEOUT_MS: ENV.OTP_TIMEOUT_MS,
            OTP_POLL_MS: ENV.OTP_POLL_MS,
            OTP_VERIFY_RETRY: ENV.OTP_VERIFY_RETRY,
            VERIFY_WINDOW_MS: ENV.VERIFY_WINDOW_MS,
            RESEND_WINDOW_MS: ENV.RESEND_WINDOW_MS,
            MAX_RESEND: ENV.MAX_RESEND,
            OTP_DEBUG_PATH_REDIS: ENV.OTP_DEBUG_PATH_REDIS,
            LOG_LEVEL: ENV.LOG_LEVEL,
            LOG_VERBOSE: ENV.LOG_VERBOSE
          }
        },
        "WORKER_CONFIG"
      );
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    logger.debug({}, "DB_OK");

    logger.debug({ reason }, "JOB_START");

    const summary = await loginFromDb(api, { logger });

    logger.debug({ summary }, "JOB_DONE");

    console.log(
      `LOGIN summary: success=${summary.success} alreadyOk=${summary.alreadyOk} relogin=${summary.relogin} fail=${summary.fail}`
    );
  } catch (err: any) {
    const { filePath } = getTodayLogPath();
    const logger = createDualLogger(filePath).child({ job: "login" });
    logger.error({ reason, err: err?.message ?? String(err) }, "JOB_CRASH");
    console.log("LOGIN summary: success=0 alreadyOk=0 relogin=0 fail=0");
  } finally {
    isRunning = false;
  }
}

export async function startWorker() {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    await runOnce("startup");

    if (!ENV.RUN_ONCE) {
      setInterval(() => runOnce("interval"), ENV.INTERVAL_MS);
    }
  } catch (e) {
    console.error("Worker startup fail", e);
  }
}
