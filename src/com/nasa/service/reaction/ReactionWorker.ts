import { ENV } from '../../config/env';
import { ReactionApiService } from '../../api/reaction/reactionApiService';

export class ReactionWorker {
    private isRunning = false;
    private intervalId?: NodeJS.Timeout;

    public async start() {
        console.log("ReactionWorker starting...");
        this.isRunning = true;
        this.loop();
        this.intervalId = setInterval(() => this.loop(), ENV.INTERVAL_MS || 60000);
    }

    private async loop() {
        if (!this.isRunning) return;
        try {
            console.log("[ReactionWorker] Processing reaction queue...");
            // TODO: In a real flow, get pending reactions from DB and submit
            // await ReactionApiService.sendReaction(token, postId, type);
        } catch (error: any) {
            console.error("[ReactionWorker] Error:", error.message);
        }
    }

    public async stop() {
        console.log("ReactionWorker stopping...");
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}
