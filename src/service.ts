import { ENV } from "./com/nasa/config/env";
import { cleanupOldLogs, getTodayLogPath, Log } from "./com/nasa/utils/log";
import { AuthServiceApi } from "./com/nasa/api/auth/authApiService";
import { MasterWorker } from "./com/nasa/service/core/MasterWorker";
import axios from "axios";
import { applyStandardInterceptors } from "./com/nasa/utils/axiosSignature";

applyStandardInterceptors(axios, "global-system");


let isRunning = false;
let started = false;

async function runOnce(reason: string) {
  if (isRunning) return;
  isRunning = true;

  try {
    cleanupOldLogs();

    const { filePath } = getTodayLogPath();
    Log.init({ filePath, level: ENV.LOG_LEVEL as any });
    const logger = Log.getLogger("LoginService");

    if (!started) {
      started = true;
      logger.debug("Service_CONFIG", {
        config: {
          KONG_URL: ENV.KONG_URL,
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
          LOG_VERBOSE: ENV.LOG_VERBOSE,
          UPSTASH_REDIS_REST_URL: ENV.UPSTASH_REDIS_REST_URL ? "[configured]" : "",
          UPSTASH_REDIS_REST_TOKEN: ENV.UPSTASH_REDIS_REST_TOKEN ? "[configured]" : ""
        }
      });
    }



    logger.debug("JOB_START", { reason });

    const master = new MasterWorker(logger);
    const accountsInfo = [
      {
        phone: "xabay92980@keecs.com",
        password: "Admin@123",
        deviceId: "9A2E7F4B-1C6D-4F92-A5E3-7D4B1C8F6A21",
        proxy: "http://121.126.185.63:25152"
      },
      {
        phone: "yivamag857@him6.com",
        password: "Admin@123",
        deviceId: "3F7B1C2D-9A4E-4D18-8C6A-12F9B0D3E5A7",
        userAgent: "ERIC/1.0.0 (iOS; 18.6.2; iPhone 16 Plus)",
        proxy: "http://125.128.12.14:3128"
      }
    ];
    const summary = await master.run(accountsInfo);

    logger.debug("JOB_DONE", { summary });

    const msg = `LOGIN summary: success=${summary.success} alreadyOk=${summary.alreadyOk} relogin=${summary.relogin} fail=${summary.fail}`;
    logger.info(msg);
    console.log(msg);
  } catch (err: any) {
    const { filePath } = getTodayLogPath();
    Log.init({ filePath, level: ENV.LOG_LEVEL as any });
    const logger = Log.getLogger("LoginService");
    logger.error("JOB_CRASH", { reason, err: err?.message ?? String(err) });

    const msg = "LOGIN summary: success=0 alreadyOk=0 relogin=0 fail=0";
    logger.info(msg);
    console.log(msg);
  } finally {
    isRunning = false;
  }
}

export async function startService() {
  try {
    await runOnce("startup");

    if (!ENV.RUN_ONCE) {
      setInterval(() => runOnce("interval"), ENV.INTERVAL_MS);
    }
  } catch (e) {
    console.error("Service startup fail", e);
  }
}