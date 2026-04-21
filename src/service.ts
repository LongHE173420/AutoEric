import { ENV } from "./com/nasa/config/env";
import { cleanupOldLogs, getTodayLogPath, Log } from "./com/nasa/utils/log";
import axios from "axios";
import { applyStandardInterceptors } from "./com/nasa/utils/axiosSignature";
import { ProxyManager } from "./com/nasa/proxy/ProxyManager";
import { getAccountsBatchFromDb } from "./com/nasa/data/mysqlStore";

applyStandardInterceptors(axios, "global-system");

let isRunning = false;
let started = false;
const proxyManager = new ProxyManager();

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
          POST_API_URL: ENV.POST_API_URL,
          MEDIA_API_URL: ENV.MEDIA_API_URL,
          MEDIA_UPLOAD_API_URL: ENV.MEDIA_UPLOAD_API_URL,
          MEDIA_UPLOAD_API_URLS: ENV.MEDIA_UPLOAD_API_URLS,
          UPLOAD_PUBLIC_BASE_URL: ENV.UPLOAD_PUBLIC_BASE_URL,
          INTERVAL_MS: ENV.INTERVAL_MS,
          RUN_ONCE: ENV.RUN_ONCE,
          PROXY_REQUIRED: ENV.PROXY_REQUIRED,
          LOGIN_CONCURRENCY: ENV.LOGIN_CONCURRENCY,
          ACCOUNT_FETCH_BATCH_SIZE: ENV.ACCOUNT_FETCH_BATCH_SIZE,
          ACCOUNT_BATCH_SIZE: ENV.ACCOUNT_BATCH_SIZE,
          ACCOUNT_BATCH_DELAY_MS: ENV.ACCOUNT_BATCH_DELAY_MS,
          ACCOUNT_START_STAGGER_MS: ENV.ACCOUNT_START_STAGGER_MS,
          VIDEO_CLAIM_TTL_MS: ENV.VIDEO_CLAIM_TTL_MS,
          API_RETRY_BACKOFF_MS: ENV.API_RETRY_BACKOFF_MS,
          AUTO_FETCH_OTP: ENV.AUTO_FETCH_OTP,
          AUTO_RESEND: ENV.AUTO_RESEND,
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

    const { MasterWorker } = await import("./com/nasa/worker/MasterWorker");
    const master = new MasterWorker(logger);

    let lastSeenId = 0;
    let loadedAccounts = 0;
    const summary = {
      success: 0,
      alreadyOk: 0,
      relogin: 0,
      fail: 0,
      accounts: 0,
    };

    while (true) {
      const dbAccounts = await getAccountsBatchFromDb(lastSeenId, ENV.ACCOUNT_FETCH_BATCH_SIZE);
      if (!dbAccounts.length) {
        break;
      }

      const accountsInfo = [];
      for (const acc of dbAccounts) {
        lastSeenId = Math.max(lastSeenId, Number(acc.id || 0));
        accountsInfo.push({
          phone: acc.phone,
          password: acc.password,
          deviceId: acc.deviceId,
          userAgent: acc.userAgent,
          accessToken: acc.accessToken,
          refreshToken: acc.refreshToken,
        });
      }

      loadedAccounts += accountsInfo.length;
      logger.debug("ACCOUNTS_PAGE_LOADED", {
        pageSize: accountsInfo.length,
        loadedAccounts,
        lastSeenId
      });

      const pageSummary = await master.run(accountsInfo, proxyManager);
      summary.success += pageSummary.success;
      summary.alreadyOk += pageSummary.alreadyOk;
      summary.relogin += pageSummary.relogin;
      summary.fail += pageSummary.fail;
      summary.accounts += pageSummary.accounts;
    }

    logger.debug(`Loaded ${loadedAccounts} accounts from database.`);

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
    const { filePath } = getTodayLogPath();
    Log.init({ filePath, level: ENV.LOG_LEVEL as any });

    await runOnce("startup");

    if (!ENV.RUN_ONCE) {
      setInterval(() => runOnce("interval"), ENV.INTERVAL_MS);
    }
  } catch (e) {
    console.error("Service startup fail", e);
  }
}
