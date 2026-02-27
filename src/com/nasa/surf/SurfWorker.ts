import { ENV } from '../config/env';
import { SurfApiService } from './surfApiService';
import { AccountRepository } from '../auth/AccountRepository';
import { SurfRepository } from './SurfRepository';
import { Log } from '../utils/log';

type AppLogger = ReturnType<typeof Log.getLogger>;

export class SurfWorker {
    private isRunning = false;
    private intervalId?: NodeJS.Timeout;
    private accountRepo: AccountRepository;
    private surfRepo = SurfRepository;
    private logger: AppLogger;

    constructor() {
        this.accountRepo = new AccountRepository();
        this.logger = Log.getLogger("SurfWorker");
    }

    public async start() {
        this.logger.info("SurfWorker starting...");
        this.isRunning = true;
        this.loop();
        this.intervalId = setInterval(() => this.loop(), ENV.INTERVAL_MS || 60000);
    }

    private async loop() {
        if (!this.isRunning) return;
        try {
            this.logger.debug("[SurfWorker] Processing surf operations...");

            const accounts = await this.accountRepo.findEnabledAccounts(100);

            for (const account of accounts) {
                if (!account.accessToken) continue;

                try {
                    const ctx = { accId: account.id, phone: account.phone };
                    this.logger.debug("[SurfWorker] Fetching home surf", ctx);

                    const response = await SurfApiService.getSurfHome(account.accessToken);

                    if (response.data && response.data.isSucceed && response.data.data) {
                        const surfs = response.data.data;
                        this.logger.debug(`[SurfWorker] Found ${surfs.length} surf items`, ctx);
                        // Save to this.surfRepo
                    } else {
                        this.logger.warn("[SurfWorker] Failed to fetch surf", { ...ctx, msg: response.data?.message });
                    }

                } catch (apiError: any) {
                    this.logger.error("[SurfWorker] API Error", { accId: account.id, err: apiError.message });
                }
            }
        } catch (error: any) {
            this.logger.error("[SurfWorker] Loop Error:", { err: error.message });
        }
    }

    public async stop() {
        this.logger.info("SurfWorker stopping...");
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

