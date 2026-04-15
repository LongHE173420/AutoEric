import { ENV } from "./com/nasa/config/env";
import { cleanupOldLogs, getTodayLogPath, Log } from "./com/nasa/utils/log";
import axios from "axios";
import { applyStandardInterceptors } from "./com/nasa/utils/axiosSignature";
import { ProxyManager } from "./com/nasa/proxy/ProxyManager";
import { getAccountsFromDb } from "./com/nasa/data/mysqlStore";
import { TargetedFriendWorker } from "./com/nasa/worker/TargetedFriendWorker";

async function runTargetedFriendRequest() {
  cleanupOldLogs();
  const { filePath } = getTodayLogPath();
  Log.init({ filePath, level: ENV.LOG_LEVEL as any });
  const logger = Log.getLogger("TargetedFriendJob");

  applyStandardInterceptors(axios, "targeted-job");
  
  const proxyManager = new ProxyManager();

  try {
    const dbAccounts = await getAccountsFromDb();
    logger.info(`Loaded ${dbAccounts.length} accounts for targeted friend request.`);

    const BATCH_SIZE = 5;
    for (let i = 0; i < dbAccounts.length; i += BATCH_SIZE) {
      const batch = dbAccounts.slice(i, i + BATCH_SIZE);
      logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}...`);
      
      await Promise.all(
        batch.map(async (acc, idx) => {
          const worker = new TargetedFriendWorker(
            {
              phone: acc.phone,
              password: acc.password,
              deviceId: acc.deviceId,
              userAgent: acc.userAgent,
              accessToken: acc.accessToken,
              refreshToken: acc.refreshToken,
              proxy: acc.proxy
            },
            logger,
            i + idx + 1,
            proxyManager
          );

          await worker.run().then((res) => {
            if (res.success) {
              logger.info(`SUCCESS: Account ${acc.phone} processed.`);
            } else {
              logger.error(`FAIL: Account ${acc.phone} failed: ${res.reason}`);
            }
          }).catch((err) => {
            logger.error(`FATAL_ERROR: Account ${acc.phone} crashed: ${err.message}`);
          });
        })
      );
    }

    logger.info("TARGETED_JOB_COMPLETE");
  } catch (err: any) {
    logger.error("TARGETED_JOB_CRASHED", { err: err.message });
  }
}

runTargetedFriendRequest().catch(console.error);
