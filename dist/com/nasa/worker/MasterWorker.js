"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MasterWorker = void 0;
const EricWorker_1 = require("./EricWorker");
const mysqlStore_1 = require("../data/mysqlStore");
const env_1 = require("../config/env");
const async_1 = require("../utils/async");
class MasterWorker {
    constructor(logger) {
        this.logger = logger;
    }
    async run(accounts, proxyManager) {
        const summary = {
            success: 0,
            alreadyOk: 0,
            relogin: 0,
            fail: 0,
            accounts: 0,
        };
        try {
            this.logger.info("Starting login flow for accounts...");
            summary.accounts = accounts.length;
            this.logger.debug("ACCOUNTS_LOADED", { accounts: accounts.length });
            const concurrency = Math.max(1, env_1.ENV.LOGIN_CONCURRENCY);
            const batchSize = Math.max(concurrency, env_1.ENV.ACCOUNT_BATCH_SIZE);
            this.logger.info("ACCOUNT_EXECUTION_PLAN", {
                accounts: accounts.length,
                concurrency,
                batchSize,
                batchDelayMs: env_1.ENV.ACCOUNT_BATCH_DELAY_MS,
                staggerMs: env_1.ENV.ACCOUNT_START_STAGGER_MS
            });
            for (let i = 0; i < accounts.length; i += batchSize) {
                const batch = accounts.slice(i, i + batchSize);
                const batchNo = Math.floor(i / batchSize) + 1;
                this.logger.info("ACCOUNT_BATCH_START", {
                    batchNo,
                    batchAccounts: batch.length,
                    batchOffset: i
                });
                await (0, async_1.runWithConcurrency)(batch, concurrency, async (acc, idx) => {
                    const rowNo = i + idx + 1;
                    const staggerMs = env_1.ENV.ACCOUNT_START_STAGGER_MS * (idx % concurrency);
                    if (staggerMs > 0) {
                        await (0, async_1.sleep)(staggerMs);
                    }
                    const worker = new EricWorker_1.EricWorker(acc, this.logger, rowNo, proxyManager);
                    await worker.run().then(async (result) => {
                        if (result.success) {
                            summary.success++;
                            await (0, mysqlStore_1.recordRunInDb)(acc.phone).catch(() => { });
                            if (result.alreadyOk)
                                summary.alreadyOk++;
                            if (result.relogin)
                                summary.relogin++;
                        }
                        else {
                            summary.fail++;
                        }
                    }).catch(() => {
                        summary.fail++;
                    });
                });
                this.logger.info("ACCOUNT_BATCH_DONE", {
                    batchNo,
                    processedAccounts: Math.min(i + batch.length, accounts.length),
                    totalAccounts: accounts.length
                });
                if (i + batchSize < accounts.length && env_1.ENV.ACCOUNT_BATCH_DELAY_MS > 0) {
                    await (0, async_1.sleep)(env_1.ENV.ACCOUNT_BATCH_DELAY_MS);
                }
            }
            this.logger.debug("JOB_SUMMARY", { summary });
            return summary;
        }
        catch (err) {
            this.logger.error("MASTER_WORKER_CRASH", { err: err?.message ?? String(err) });
            this.logger.error("SYSTEM_HALT", { reason: "Mission failure — stopping process" });
            process.exit(1);
        }
    }
}
exports.MasterWorker = MasterWorker;
