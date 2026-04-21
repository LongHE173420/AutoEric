import { ENV } from "./com/nasa/config/env";
import { cleanupOldLogs, getTodayLogPath, Log } from "./com/nasa/utils/log";
import axios from "axios";
import { applyStandardInterceptors } from "./com/nasa/utils/axiosSignature";
import { ProxyManager } from "./com/nasa/proxy/ProxyManager";
import { getAccountsBatchFromDb } from "./com/nasa/data/mysqlStore";
import { TargetedFriendWorker } from "./com/nasa/worker/TargetedFriendWorker";
import { runWithConcurrency, sleep } from "./com/nasa/utils/async";

async function runTargetedFriendRequest() {
  cleanupOldLogs();
  const { filePath } = getTodayLogPath();
  Log.init({ filePath, level: ENV.LOG_LEVEL as any });
  const logger = Log.getLogger("TargetedFriendJob");

  applyStandardInterceptors(axios, "targeted-job");
  
  const proxyManager = new ProxyManager();

  try {
    const concurrency = Math.max(1, ENV.TARGETED_CONCURRENCY);
    const batchSize = Math.max(concurrency, ENV.ACCOUNT_BATCH_SIZE);
    let lastSeenId = 0;
    let processedAccounts = 0;
    let fetchPage = 0;

    while (true) {
      const dbAccounts = await getAccountsBatchFromDb(lastSeenId, ENV.ACCOUNT_FETCH_BATCH_SIZE);
      if (!dbAccounts.length) {
        break;
      }

      fetchPage++;
      logger.info(`Loaded ${dbAccounts.length} accounts for targeted friend request page ${fetchPage}.`);

      for (let i = 0; i < dbAccounts.length; i += batchSize) {
        const batch = dbAccounts.slice(i, i + batchSize);
        logger.info(`Processing batch ${Math.floor(i / batchSize) + 1} of page ${fetchPage}...`);

        await runWithConcurrency(batch, concurrency, async (acc, idx) => {
            const staggerMs = ENV.ACCOUNT_START_STAGGER_MS * (idx % concurrency);
            if (staggerMs > 0) {
              await sleep(staggerMs);
            }

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
              processedAccounts + idx + 1,
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
        });

        processedAccounts += batch.length;

        if (i + batchSize < dbAccounts.length && ENV.ACCOUNT_BATCH_DELAY_MS > 0) {
          await sleep(ENV.ACCOUNT_BATCH_DELAY_MS);
        }
      }

      lastSeenId = Math.max(...dbAccounts.map((acc) => Number(acc.id || 0)), lastSeenId);
    }

    logger.info("TARGETED_JOB_COMPLETE");
  } catch (err: any) {
    logger.error("TARGETED_JOB_CRASHED", { err: err.message });
  }
}

runTargetedFriendRequest().catch(console.error);
