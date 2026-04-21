"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./com/nasa/config/env");
const log_1 = require("./com/nasa/utils/log");
const axios_1 = __importDefault(require("axios"));
const axiosSignature_1 = require("./com/nasa/utils/axiosSignature");
const ProxyManager_1 = require("./com/nasa/proxy/ProxyManager");
const mysqlStore_1 = require("./com/nasa/data/mysqlStore");
const TargetedFriendWorker_1 = require("./com/nasa/worker/TargetedFriendWorker");
const async_1 = require("./com/nasa/utils/async");
async function runTargetedFriendRequest() {
    (0, log_1.cleanupOldLogs)();
    const { filePath } = (0, log_1.getTodayLogPath)();
    log_1.Log.init({ filePath, level: env_1.ENV.LOG_LEVEL });
    const logger = log_1.Log.getLogger("TargetedFriendJob");
    (0, axiosSignature_1.applyStandardInterceptors)(axios_1.default, "targeted-job");
    const proxyManager = new ProxyManager_1.ProxyManager();
    try {
        const concurrency = Math.max(1, env_1.ENV.TARGETED_CONCURRENCY);
        const batchSize = Math.max(concurrency, env_1.ENV.ACCOUNT_BATCH_SIZE);
        let lastSeenId = 0;
        let processedAccounts = 0;
        let fetchPage = 0;
        while (true) {
            const dbAccounts = await (0, mysqlStore_1.getAccountsBatchFromDb)(lastSeenId, env_1.ENV.ACCOUNT_FETCH_BATCH_SIZE);
            if (!dbAccounts.length) {
                break;
            }
            fetchPage++;
            logger.info(`Loaded ${dbAccounts.length} accounts for targeted friend request page ${fetchPage}.`);
            for (let i = 0; i < dbAccounts.length; i += batchSize) {
                const batch = dbAccounts.slice(i, i + batchSize);
                logger.info(`Processing batch ${Math.floor(i / batchSize) + 1} of page ${fetchPage}...`);
                await (0, async_1.runWithConcurrency)(batch, concurrency, async (acc, idx) => {
                    const staggerMs = env_1.ENV.ACCOUNT_START_STAGGER_MS * (idx % concurrency);
                    if (staggerMs > 0) {
                        await (0, async_1.sleep)(staggerMs);
                    }
                    const worker = new TargetedFriendWorker_1.TargetedFriendWorker({
                        phone: acc.phone,
                        password: acc.password,
                        deviceId: acc.deviceId,
                        userAgent: acc.userAgent,
                        accessToken: acc.accessToken,
                        refreshToken: acc.refreshToken,
                        proxy: acc.proxy
                    }, logger, processedAccounts + idx + 1, proxyManager);
                    await worker.run().then((res) => {
                        if (res.success) {
                            logger.info(`SUCCESS: Account ${acc.phone} processed.`);
                        }
                        else {
                            logger.error(`FAIL: Account ${acc.phone} failed: ${res.reason}`);
                        }
                    }).catch((err) => {
                        logger.error(`FATAL_ERROR: Account ${acc.phone} crashed: ${err.message}`);
                    });
                });
                processedAccounts += batch.length;
                if (i + batchSize < dbAccounts.length && env_1.ENV.ACCOUNT_BATCH_DELAY_MS > 0) {
                    await (0, async_1.sleep)(env_1.ENV.ACCOUNT_BATCH_DELAY_MS);
                }
            }
            lastSeenId = Math.max(...dbAccounts.map((acc) => Number(acc.id || 0)), lastSeenId);
        }
        logger.info("TARGETED_JOB_COMPLETE");
    }
    catch (err) {
        logger.error("TARGETED_JOB_CRASHED", { err: err.message });
    }
}
runTargetedFriendRequest().catch(console.error);
