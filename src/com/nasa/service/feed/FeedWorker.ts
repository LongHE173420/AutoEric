import { ENV } from '../../config/env';
import { FeedApiService } from '../../api/feed/feedApiService';
import { AccountRepository } from '../../db/auth/AccountRepository';
import { FeedRepository } from '../../db/feed/FeedRepository';
import { Log } from '../../utils/log';

type AppLogger = ReturnType<typeof Log.getLogger>;

export class FeedWorker {
    private isRunning = false;
    private intervalId?: NodeJS.Timeout;
    private accountRepo: AccountRepository;
    private feedRepo = FeedRepository;
    private logger: AppLogger;

    constructor() {
        this.accountRepo = new AccountRepository();
        this.logger = Log.getLogger("FeedWorker");
    }

    public async start() {
        this.logger.info("FeedWorker starting...");
        this.isRunning = true;
        this.loop();
        this.intervalId = setInterval(() => this.loop(), ENV.INTERVAL_MS || 60000);
    }

    private async loop() {
        if (!this.isRunning) return;
        try {
            this.logger.debug("[FeedWorker] Processing feed operations...");

            const accounts = await this.accountRepo.findEnabledAccounts(100);

            for (const account of accounts) {
                if (!account.accessToken) continue;

                try {
                    const ctx = { accId: account.id, phone: account.phone };
                    this.logger.debug("[FeedWorker] Fetching home feed", ctx);

                    const response = await FeedApiService.getFeedHome(account.accessToken);

                    if (response.data && response.data.isSucceed && response.data.data) {
                        const feeds = response.data.data;
                        this.logger.debug(`[FeedWorker] Found ${feeds.length} feed items`, ctx);
                        // Save to this.feedRepo
                    } else {
                        this.logger.warn("[FeedWorker] Failed to fetch feed", { ...ctx, msg: response.data?.message });
                    }

                } catch (apiError: any) {
                    this.logger.error("[FeedWorker] API Error", { accId: account.id, err: apiError.message });
                }
            }
        } catch (error: any) {
            this.logger.error("[FeedWorker] Loop Error:", { err: error.message });
        }
    }

    public async stop() {
        this.logger.info("FeedWorker stopping...");
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

