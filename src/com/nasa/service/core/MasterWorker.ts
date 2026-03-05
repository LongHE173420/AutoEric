import { getDeviceId } from "../../utils/device";
import { EricWorker } from "./EricWorker";
import { Log } from "../../utils/log";

export type LoginSummary = {
    success: number;
    alreadyOk: number;
    relogin: number;
    fail: number;
    accounts: number;
};
type AppLogger = ReturnType<typeof Log.getLogger>;

export class MasterWorker {
    private readonly defaultDeviceId: string;

    constructor(
        private readonly logger: AppLogger
    ) {
        this.defaultDeviceId = getDeviceId();
    }

    async run(accounts: any[]): Promise<LoginSummary> {
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
            this.logger.debug("ACCOUNTS_LOADED", { accounts: accounts.length, deviceId: this.defaultDeviceId });

            const BATCH_SIZE = 5;
            for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
                const batch = accounts.slice(i, i + BATCH_SIZE);
                await Promise.all(
                    batch.map(async (acc, idx) => {
                        const worker = new EricWorker(
                            acc,
                            this.logger,
                            this.defaultDeviceId,
                            i + idx + 1
                        );

                        const result = await worker.run();

                        if (result.success) {
                            summary.success++;
                            if (result.alreadyOk) summary.alreadyOk++;
                            if (result.relogin) summary.relogin++;
                        } else {
                            summary.fail++;
                        }
                    })
                );
            }

            this.logger.debug("JOB_SUMMARY", { summary });
            return summary;

        } catch (err: any) {
            this.logger.error("MASTER_WORKER_CRASH", { err: err?.message ?? String(err) });
            return summary;
        }
    }
}
