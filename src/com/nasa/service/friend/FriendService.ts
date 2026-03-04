import { ENV } from '../../config/env';
import { FriendApiService } from '../../api/friend/friendApiService';
import { Log } from '../../utils/log';

type AppLogger = ReturnType<typeof Log.getLogger>;

export class FriendService {
    private isRunning = false;
    private intervalId?: NodeJS.Timeout;
    private accounts: any[] = [];
    private logger: AppLogger;

    constructor(accounts: any[] = []) {
        this.accounts = accounts;
        this.logger = Log.getLogger("FriendService");
    }

    public async start() {
        this.logger.info("FriendService starting...");
        this.isRunning = true;
        this.loop();
        this.intervalId = setInterval(() => this.loop(), ENV.INTERVAL_MS || 60000);
    }

    private async loop() {
        if (!this.isRunning) return;
        try {
            this.logger.debug("[FriendService] Polling for friend updates...");

            // Get all enabled accounts that have an active session (tokens)
            const accounts = this.accounts;

            for (const account of accounts) {
                if (!account.accessToken) continue;

                try {
                    const ctx = { accId: account.id, phone: account.phone };
                    this.logger.debug("[FriendService] Fetching friends", ctx);

                    const response = await FriendApiService.getMyFriends(account.accessToken);

                    if (response.data && response.data.isSucceed && response.data.data) {
                        const friends = response.data.data;
                        this.logger.debug(`[FriendService] Found ${friends.length} friends`, ctx);

                        // For demonstration, we just log. In a real scenario, map response data to FriendEntity
                        // and save using this.friendRepo.save(...)
                    } else {
                        this.logger.warn("[FriendService] Failed to fetch friends", { ...ctx, msg: response.data?.message });
                    }

                } catch (apiError: any) {
                    this.logger.error("[FriendService] API Error for account", { accId: account.id, err: apiError.message });
                }
            }

        } catch (error: any) {
            this.logger.error("[FriendService] Loop Error:", { err: error.message });
        }
    }

    public async stop() {
        this.logger.info("FriendService stopping...");
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

