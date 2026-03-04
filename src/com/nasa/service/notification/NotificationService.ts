import { ENV } from '../../config/env';
import { NotificationApiService } from '../../api/notification/notificationApiService';
import { Log } from '../../utils/log';

type AppLogger = ReturnType<typeof Log.getLogger>;

export class NotificationService {
    private isRunning = false;
    private intervalId?: NodeJS.Timeout;
    private accounts: any[] = [];
    private logger: AppLogger;

    constructor(accounts: any[] = []) {
        this.accounts = accounts;
        this.logger = Log.getLogger("NotificationService");
    }

    public async start() {
        this.logger.info("NotificationService starting...");
        this.isRunning = true;
        this.loop();
        this.intervalId = setInterval(() => this.loop(), ENV.INTERVAL_MS || 60000);
    }

    private async loop() {
        if (!this.isRunning) return;
        try {
            this.logger.debug("[NotificationService] Polling for notifications...");

            const accounts = this.accounts;

            for (const account of accounts) {
                if (!account.accessToken) continue;

                try {
                    const ctx = { accId: account.id, phone: account.phone };
                    this.logger.debug("[NotificationService] Fetching notifications", ctx);

                    const response = await NotificationApiService.listNotifications(account.accessToken);

                    if (response.data && response.data.isSucceed && response.data.data) {
                        const notifs = response.data.data;
                        this.logger.debug(`[NotificationService] Found ${notifs.length} notifications`, ctx);

                        // Parse array and save to Database
                    } else {
                        this.logger.warn("[NotificationService] Failed to fetch", { ...ctx, msg: response.data?.message });
                    }

                } catch (apiError: any) {
                    this.logger.error("[NotificationService] API Error", { accId: account.id, err: apiError.message });
                }
            }

        } catch (error: any) {
            this.logger.error("[NotificationService] Loop Error:", { err: error.message });
        }
    }

    public async stop() {
        this.logger.info("NotificationService stopping...");
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

