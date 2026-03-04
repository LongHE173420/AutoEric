import { ENV } from '../../config/env';
import { AppConfigApiService } from '../../api/app_config/appConfigApiService';

export class AppConfigService {
    private isRunning = false;
    private intervalId?: NodeJS.Timeout;

    public async start() {
        console.log("AppConfigService starting...");
        this.isRunning = true;
        this.loop();
        this.intervalId = setInterval(() => this.loop(), ENV.INTERVAL_MS || 60000);
    }

    private async loop() {
        if (!this.isRunning) return;
        try {
            console.log("[AppConfigService] Processing app config (e.g. Firebase tokens)...");
            // TODO: Retrieve token and call AppConfig API
            // await AppConfigApiService.updateTokenFirebase(token, data);
        } catch (error: any) {
            console.error("[AppConfigService] Error:", error.message);
        }
    }

    public async stop() {
        console.log("AppConfigService stopping...");
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}
