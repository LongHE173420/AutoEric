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
async function runTargetedFriendRequest() {
    (0, log_1.cleanupOldLogs)();
    const { filePath } = (0, log_1.getTodayLogPath)();
    log_1.Log.init({ filePath, level: env_1.ENV.LOG_LEVEL });
    const logger = log_1.Log.getLogger("TargetedFriendJob");
    (0, axiosSignature_1.applyStandardInterceptors)(axios_1.default, "targeted-job");
    const proxyManager = new ProxyManager_1.ProxyManager();
    try {
        const dbAccounts = await (0, mysqlStore_1.getAccountsFromDb)();
        logger.info(`Loaded ${dbAccounts.length} accounts for targeted friend request.`);
        const BATCH_SIZE = 5;
        for (let i = 0; i < dbAccounts.length; i += BATCH_SIZE) {
            const batch = dbAccounts.slice(i, i + BATCH_SIZE);
            logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}...`);
            await Promise.all(batch.map(async (acc, idx) => {
                const worker = new TargetedFriendWorker_1.TargetedFriendWorker({
                    phone: acc.phone,
                    password: acc.password,
                    deviceId: acc.deviceId,
                    userAgent: acc.userAgent,
                    accessToken: acc.accessToken,
                    refreshToken: acc.refreshToken,
                    proxy: acc.proxy
                }, logger, i + idx + 1, proxyManager);
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
            }));
        }
        logger.info("TARGETED_JOB_COMPLETE");
    }
    catch (err) {
        logger.error("TARGETED_JOB_CRASHED", { err: err.message });
    }
}
runTargetedFriendRequest().catch(console.error);
