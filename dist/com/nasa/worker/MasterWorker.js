"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MasterWorker = void 0;
const EricWorker_1 = require("./EricWorker");
const mysqlStore_1 = require("../data/mysqlStore");
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
            const BATCH_SIZE = 2;
            for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
                const batch = accounts.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (acc, idx) => {
                    const worker = new EricWorker_1.EricWorker(acc, this.logger, i + idx + 1, proxyManager);
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
                }));
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
