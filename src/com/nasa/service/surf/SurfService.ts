import { ENV } from '../../config/env';
import { SurfApiService } from '../../api/surf/surfApiService';
import { Log } from '../../utils/log';

type AppLogger = ReturnType<typeof Log.getLogger>;

export class SurfService {
    private isRunning = false;
    private intervalId?: NodeJS.Timeout;
    private accounts: any[] = [];
    private logger: AppLogger;

    constructor(accounts: any[] = []) {
        this.accounts = accounts;
        this.logger = Log.getLogger("SurfService");
    }

    public async start() {
        this.logger.info("SurfService starting...");
        this.isRunning = true;
        this.loop();
        this.intervalId = setInterval(() => this.loop(), ENV.INTERVAL_MS || 60000);
    }

    private async loop() {
        if (!this.isRunning) return;
        try {
            this.logger.debug("[SurfService] Processing surf operations...");

            const accounts = this.accounts;

            for (const account of accounts) {
                if (!account.accessToken) continue;

                try {
                    const ctx = { accId: account.id, phone: account.phone };
                    this.logger.debug("[SurfService] Fetching home surf", ctx);

                    const response = await SurfApiService.getSurfHome(account.accessToken);

                    if (response.data && response.data.isSucceed && response.data.data) {
                        const surfs = response.data.data;
                        this.logger.debug(`[SurfService] Found ${surfs.length} surf items`, ctx);
                        // Save to this.surfRepo
                    } else {
                        this.logger.warn("[SurfService] Failed to fetch surf", { ...ctx, msg: response.data?.message });
                    }

                } catch (apiError: any) {
                    this.logger.error("[SurfService] API Error", { accId: account.id, err: apiError.message });
                }
            }
        } catch (error: any) {
            this.logger.error("[SurfService] Loop Error:", { err: error.message });
        }
    }

    public async stop() {
        this.logger.info("SurfService stopping...");
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

