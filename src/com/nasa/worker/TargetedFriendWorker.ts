import { AuthServiceApi } from "../api/auth/authApiService";
import { maskPassword, Log } from "../utils/log";
import { getStoredTokens, setStoredTokens, clearTokensForUser } from "../storage/tokenStore";
import { getMeWithAutoAuth, loginWithOtpFlow } from "../service/auth/LoginFlowService";
import { saveTokensToDb, saveAppUserId } from "../data/mysqlStore";
import { ProxyManager } from "../proxy/ProxyManager";
import { v4 as uuidv4 } from "uuid";
import { ENV } from "../config/env";
import { buildHeaders } from "../utils/headers";
import { ProxyHelper } from "../proxy/ProxyHelper";
import { UserApiService } from "../api/user/userApiService";
import { FriendApiService } from "../api/friend/friendApiService";

type AppLogger = ReturnType<typeof Log.getLogger>;

export class TargetedFriendWorker {
    private logger: AppLogger;
    private api: AuthServiceApi;
    private proxyHelper: ProxyHelper;

    constructor(
        private readonly acc: any,
        parentLogger: AppLogger,
        private readonly rowNo: number,
        private readonly proxyManager?: ProxyManager
    ) {
        this.logger = parentLogger;
        this.proxyHelper = new ProxyHelper(this.acc, this.proxyManager, this.logger);
        const activeDeviceId = this.acc.deviceId || uuidv4();
        this.acc.deviceId = activeDeviceId;
        this.api = new AuthServiceApi(activeDeviceId, ENV.KONG_URL, this.proxyHelper.proxyAgent);
    }

    private logContext() {
        return { row: this.rowNo, phone: String(this.acc.phone || "").trim() };
    }

    async run(): Promise<{ success: boolean; reason?: string }> {
        const ctx = this.logContext();
        try {
            const phone = String(this.acc.phone || this.acc.username || "").trim();
            const password = String(this.acc.password || "").trim();

            if (!phone || !password) return { success: false, reason: "INVALID_CREDENTIALS" };

            // 1. Auth / Login
            const accessToken = await this.ensureAuth(phone, password, ctx);
            if (!accessToken) return { success: false, reason: "AUTH_FAILED" };

            // 2. Targeted Task
            await this.sendFriendRequest(accessToken, "tieucong.thang@gmail.com", ctx);

            return { success: true };
        } catch (e: any) {
            this.logger.error("TARGETED_WORKER_ERROR", { ...ctx, err: e.message });
            return { success: false, reason: e.message };
        }
    }

    private async ensureAuth(phone: string, password: string, ctx: any): Promise<string | null> {
        const stored = getStoredTokens(phone);
        const activeDeviceId = this.acc.deviceId || stored?.deviceId || uuidv4();
        
        if (stored) {
            const me = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger, this.proxyHelper.proxyAgent);
            if (me.ok) {
                return getStoredTokens(phone)?.accessToken || stored.accessToken;
            }
            clearTokensForUser(phone);
        }

        const headers = buildHeaders(activeDeviceId, this.acc.userAgent);
        const lr = await loginWithOtpFlow(this.api, { phone, password }, headers, this.logger);

        if (lr.ok && lr.tokens?.accessToken) {
            const final = getStoredTokens(phone);
            if (final) {
                await saveTokensToDb(phone, final.accessToken, final.refreshToken).catch(() => {});
                return final.accessToken;
            }
        }
        return null;
    }

    private async sendFriendRequest(accessToken: string, targetEmail: string, ctx: any) {
        try {
            const h = buildHeaders(this.acc.deviceId, this.acc.userAgent);
            
            // Resolve email to ID
            this.logger.info("FINDING_TARGET_USER", { ...ctx, targetEmail });
            const res = await UserApiService.getProfileByUsername(accessToken, targetEmail, h, this.proxyHelper.proxyAgent);
            const userData = res.data?.data || res.data;
            const targetId = userData?.id || userData?.userId || userData?.accountId;

            if (!targetId) {
                this.logger.warn("TARGET_USER_NOT_FOUND", { ...ctx, targetEmail });
                return;
            }

            // Send request
            this.logger.info("SENDING_FRIEND_REQUEST", { ...ctx, targetEmail, targetId });
            await FriendApiService.sendFriendRequest(accessToken, String(targetId), h, this.proxyHelper.proxyAgent)
                .then(() => {
                    this.logger.info("FRIEND_REQUEST_SENT_SUCCESS", { ...ctx, targetEmail });
                })
                .catch((e: any) => {
                    const status = e.response?.status;
                    if (status === 409) {
                        this.logger.info("FRIEND_REQUEST_ALREADY_EXISTS", { ...ctx, targetEmail });
                    } else {
                        this.logger.error("SEND_FRIEND_REQUEST_FAILED", { ...ctx, targetEmail, status, err: e.message });
                    }
                });
        } catch (e: any) {
            this.logger.error("PROCESS_FRIEND_REQUEST_ERROR", { ...ctx, targetEmail, err: e.message });
        }
    }
}
