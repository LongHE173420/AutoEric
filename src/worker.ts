import { ENV } from "./vn.com.nasa.config/env";
import { cleanupOldLogs, getTodayLogPath, Log } from "./vn.com.nasa.utils/log";
import { AuthServiceApi } from "./vn.com.nasa.connection.api/authService";
import { MasterWorker } from "./vn.com.nasa.service/MasterWorker";
import { AppDataSource } from "./vn.com.nasa.config/data-source";

let isRunning = false;
let started = false;

async function runOnce(reason: string) {
  if (isRunning) return;
  isRunning = true;


  try {
    cleanupOldLogs();

    const { filePath } = getTodayLogPath();
    Log.init({ filePath });
    const logger = Log.getLogger("LoginWorker");
    const api = new AuthServiceApi(ENV.BASE_URL);

    if (!started) {
      started = true;
      logger.debug(
        "WORKER_CONFIG",
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
        }
      );
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    logger.debug("DB_OK");

    logger.debug("JOB_START", { reason });

    const master = new MasterWorker(api, logger);
    const summary = await master.run();

    logger.debug("JOB_DONE", { summary });

    const msg = `LOGIN summary: success=${summary.success} alreadyOk=${summary.alreadyOk} relogin=${summary.relogin} fail=${summary.fail}`;
    logger.info(msg);
    console.log(msg);
  } catch (err: any) {
    const { filePath } = getTodayLogPath();
    Log.init({ filePath });
    const logger = Log.getLogger("LoginWorker");
    logger.error("JOB_CRASH", { reason, err: err?.message ?? String(err) });
    const msg = "LOGIN summary: success=0 alreadyOk=0 relogin=0 fail=0";
    logger.info(msg);
    console.log(msg);
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
