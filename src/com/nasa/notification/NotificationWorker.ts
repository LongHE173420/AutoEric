import { ENV } from '../config/env';
import { NotificationApiService } from './notificationApiService';
import { AccountRepository } from '../auth/AccountRepository';
import { NotificationRepository } from './NotificationRepository';
import { Log } from '../utils/log';

type AppLogger = ReturnType<typeof Log.getLogger>;

export class NotificationWorker {
    private isRunning = false;
    private intervalId?: NodeJS.Timeout;
    private accountRepo: AccountRepository;
    private notifRepo = NotificationRepository;
    private logger: AppLogger;

    constructor() {
        this.accountRepo = new AccountRepository();
        this.logger = Log.getLogger("NotificationWorker");
    }

    public async start() {
        this.logger.info("NotificationWorker starting...");
        this.isRunning = true;
        this.loop();
        this.intervalId = setInterval(() => this.loop(), ENV.INTERVAL_MS || 60000);
    }

    private async loop() {
        if (!this.isRunning) return;
        try {
            this.logger.debug("[NotificationWorker] Polling for notifications...");

            const accounts = await this.accountRepo.findEnabledAccounts(100);

            for (const account of accounts) {
                if (!account.accessToken) continue;

                try {
                    const ctx = { accId: account.id, phone: account.phone };
                    this.logger.debug("[NotificationWorker] Fetching notifications", ctx);

                    const response = await NotificationApiService.listNotifications(account.accessToken);

                    if (response.data && response.data.isSucceed && response.data.data) {
                        const notifs = response.data.data;
                        this.logger.debug(`[NotificationWorker] Found ${notifs.length} notifications`, ctx);

                        // Parse array and save to Database
                    } else {
                        this.logger.warn("[NotificationWorker] Failed to fetch", { ...ctx, msg: response.data?.message });
                    }

                } catch (apiError: any) {
                    this.logger.error("[NotificationWorker] API Error", { accId: account.id, err: apiError.message });
                }
            }

        } catch (error: any) {
            this.logger.error("[NotificationWorker] Loop Error:", { err: error.message });
        }
    }

    public async stop() {
        this.logger.info("NotificationWorker stopping...");
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

