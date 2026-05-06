import { EricWorker } from "./EricWorker";
import { Log } from "../utils/log";
import { ProxyManager } from "../proxy/ProxyManager";
import { recordRunInDb } from "../data/mysqlStore";
import { ENV } from "../config/env";
import { runWithConcurrency, sleep } from "../utils/async";

export type LoginSummary = {
    success: number;
    alreadyOk: number;
    relogin: number;
    fail: number;
    accounts: number;
};
type AppLogger = ReturnType<typeof Log.getLogger>;

export class MasterWorker {
    constructor(
        private readonly logger: AppLogger
    ) {
    }

    async run(accounts: any[], proxyManager?: ProxyManager): Promise<LoginSummary> {
        const summary: LoginSummary = {
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

            const concurrency = Math.max(1, ENV.LOGIN_CONCURRENCY);
            const batchSize = Math.max(concurrency, ENV.ACCOUNT_BATCH_SIZE);

            this.logger.info("ACCOUNT_EXECUTION_PLAN", {
                accounts: accounts.length,
                concurrency,
                batchSize,
                batchDelayMs: ENV.ACCOUNT_BATCH_DELAY_MS,
                staggerMs: ENV.ACCOUNT_START_STAGGER_MS
            });

            for (let i = 0; i < accounts.length; i += batchSize) {
                const batch = accounts.slice(i, i + batchSize);
                const batchNo = Math.floor(i / batchSize) + 1;

                this.logger.info("ACCOUNT_BATCH_START", {
                    batchNo,
                    batchAccounts: batch.length,
                    batchOffset: i
                });

                await runWithConcurrency(batch, concurrency, async (acc, idx) => {
                    const rowNo = i + idx + 1;
                    const staggerMs = ENV.ACCOUNT_START_STAGGER_MS * (idx % concurrency);
                    if (staggerMs > 0) {
                        await sleep(staggerMs);
                    }

                    const worker = new EricWorker(
                        acc,
                        this.logger,
                        rowNo,
                        proxyManager
                    );

                    await worker.run().then(async (result) => {
                        if (!result.executed) {
                            return;
                        }

                        await recordRunInDb(acc.phone).catch(() => {});

                        if (result.success) {
                            summary.success++;
                            if (result.alreadyOk) summary.alreadyOk++;
                            if (result.relogin) summary.relogin++;
                        } else {
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

                if (i + batchSize < accounts.length && ENV.ACCOUNT_BATCH_DELAY_MS > 0) {
                    await sleep(ENV.ACCOUNT_BATCH_DELAY_MS);
                }
            }

            this.logger.debug("JOB_SUMMARY", { summary });
            return summary;

        } catch (err: any) {
            this.logger.error("MASTER_WORKER_CRASH", { err: err?.message ?? String(err) });
            this.logger.error("SYSTEM_HALT", { reason: "Mission failure — stopping process" });
            process.exit(1);
        }
    }
}
