import { ENV } from '../../config/env';
import { FeedApiService } from '../../api/feed/feedApiService';
import { Log } from '../../utils/log';

type AppLogger = ReturnType<typeof Log.getLogger>;

export class FeedService {
    private isRunning = false;
    private intervalId?: NodeJS.Timeout;
    private accounts: any[] = [];
    private logger: AppLogger;

    constructor(accounts: any[] = []) {
        this.accounts = accounts;
        this.logger = Log.getLogger("FeedService");
    }

    public async start() {
        this.logger.info("FeedService starting...");
        this.isRunning = true;
        this.loop();
        this.intervalId = setInterval(() => this.loop(), ENV.INTERVAL_MS || 60000);
    }

    private async loop() {
        if (!this.isRunning) return;
        try {
            this.logger.debug("[FeedService] Processing feed operations...");

            const accounts = this.accounts;

            for (const account of accounts) {
                if (!account.accessToken) continue;

                try {
                    const ctx = { accId: account.id, phone: account.phone };
                    this.logger.debug("[FeedService] Fetching home feed", ctx);

                    const response = await FeedApiService.getFeedHome(account.accessToken);

                    if (response.data && response.data.isSucceed && response.data.data) {
                        const feeds = response.data.data;
                        this.logger.debug(`[FeedService] Found ${feeds.length} feed items`, ctx);
                        // Save to this.feedRepo
                    } else {
                        this.logger.warn("[FeedService] Failed to fetch feed", { ...ctx, msg: response.data?.message });
                    }

                } catch (apiError: any) {
                    this.logger.error("[FeedService] API Error", { accId: account.id, err: apiError.message });
                }
            }
        } catch (error: any) {
            this.logger.error("[FeedService] Loop Error:", { err: error.message });
        }
    }

    public async stop() {
        this.logger.info("FeedService stopping...");
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

