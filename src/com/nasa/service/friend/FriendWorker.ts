import { ENV } from '../../config/env';
import { FriendApiService } from '../../api/friend/friendApiService';
import { AccountRepository } from '../../db/auth/AccountRepository';
import { FriendRepository } from '../../db/friend/FriendRepository';
import { Log } from '../../utils/log';

type AppLogger = ReturnType<typeof Log.getLogger>;

export class FriendWorker {
    private isRunning = false;
    private intervalId?: NodeJS.Timeout;
    private accountRepo: AccountRepository;
    private friendRepo = FriendRepository;
    private logger: AppLogger;

    constructor() {
        this.accountRepo = new AccountRepository();
        this.logger = Log.getLogger("FriendWorker");
    }

    public async start() {
        this.logger.info("FriendWorker starting...");
        this.isRunning = true;
        this.loop();
        this.intervalId = setInterval(() => this.loop(), ENV.INTERVAL_MS || 60000);
    }

    private async loop() {
        if (!this.isRunning) return;
        try {
            this.logger.debug("[FriendWorker] Polling for friend updates...");

            // Get all enabled accounts that have an active session (tokens)
            const accounts = await this.accountRepo.findEnabledAccounts(100);

            for (const account of accounts) {
                if (!account.accessToken) continue;

                try {
                    const ctx = { accId: account.id, phone: account.phone };
                    this.logger.debug("[FriendWorker] Fetching friends", ctx);

                    const response = await FriendApiService.getMyFriends(account.accessToken);

                    if (response.data && response.data.isSucceed && response.data.data) {
                        const friends = response.data.data;
                        this.logger.debug(`[FriendWorker] Found ${friends.length} friends`, ctx);

                        // For demonstration, we just log. In a real scenario, map response data to FriendEntity
                        // and save using this.friendRepo.save(...)
                    } else {
                        this.logger.warn("[FriendWorker] Failed to fetch friends", { ...ctx, msg: response.data?.message });
                    }

                } catch (apiError: any) {
                    this.logger.error("[FriendWorker] API Error for account", { accId: account.id, err: apiError.message });
                }
            }

        } catch (error: any) {
            this.logger.error("[FriendWorker] Loop Error:", { err: error.message });
        }
    }

    public async stop() {
        this.logger.info("FriendWorker stopping...");
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

