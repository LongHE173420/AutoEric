import { AuthServiceApi } from "../api/auth/authApiService";
import { maskPassword, maskToken, Log } from "../utils/log";
import { getStoredTokens, setStoredTokens, clearTokensForUser } from "../storage/tokenStore";
import { getMeWithAutoAuth, loginWithOtpFlow } from "../service/auth/LoginFlowService";
import { saveTokensToDb, saveAppUserId } from "../data/mysqlStore";
import { ProxyManager } from "../core/ProxyManager";
import { v4 as uuidv4 } from "uuid";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ENV } from "../config/env";
import { buildHeaders } from "../utils/headers";
import { isNetworkError } from "../utils/errorUtils";

import { AccountMissionService } from "../service/missions/AccountMissionService";
import { InteractionService } from "../service/missions/InteractionService";
import { RelationService } from "../service/missions/RelationService";
import { PostService } from "../service/missions/PostService";

export type UserServiceResult = {
    success: boolean;
    relogin: boolean;
    alreadyOk: boolean;
    reason?: string;
};

type AppLogger = ReturnType<typeof Log.getLogger>;

export class EricWorker {
    private logger: AppLogger;
    private api: AuthServiceApi;
    private proxyAgent?: any;

    constructor(
        private readonly acc: any,
        parentLogger: AppLogger,
        private readonly rowNo: number,
        private readonly proxyManager?: ProxyManager
    ) {
        this.logger = parentLogger;
        if (this.acc.proxy) {
            this.proxyAgent = new HttpsProxyAgent(this.acc.proxy);
        }
        const activeDeviceId = this.acc.deviceId || uuidv4();
        this.acc.deviceId = activeDeviceId;
        this.api = new AuthServiceApi(activeDeviceId, ENV.KONG_URL, this.proxyAgent);
    }

    private logContext() {
        return { row: this.rowNo, phone: String(this.acc.phone || "").trim() };
    }

    async run(): Promise<UserServiceResult> {
        const phone = String(this.acc.phone || this.acc.username || "").trim();
        const password = String(this.acc.password || "").trim();
        const ctx = this.logContext();
        this.logger.info("ACCOUNT_START", { ...ctx, password: maskPassword(password) });

        if (!phone || !password) return { success: false, relogin: false, alreadyOk: false, reason: "INVALID_CREDENTIALS" };

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                return await this.attemptRunProcess(phone, password, ctx);
            } catch (err: any) {
                if (isNetworkError(err) && this.acc.proxy && attempt === 1) {
                    if (await this.switchProxy(ctx)) {
                        this.api = new AuthServiceApi(this.acc.deviceId || uuidv4(), ENV.KONG_URL, this.proxyAgent);
                        continue;
                    }
                }
                throw err;
            }
        }
        throw new Error("Failed after retries");
    }

    private async attemptRunProcess(phone: string, password: string, ctx: any): Promise<UserServiceResult> {
        const stored = getStoredTokens(phone);
        const activeDeviceId = this.acc.deviceId || stored?.deviceId || uuidv4();
        const activeUserAgent = this.acc.userAgent || stored?.userAgent;
        this.acc.deviceId = activeDeviceId;
        this.acc.userAgent = activeUserAgent;

        if (this.acc.accessToken && this.acc.refreshToken) {
            setStoredTokens(phone, this.acc.accessToken, this.acc.refreshToken, activeDeviceId, activeUserAgent);
        }

        if (stored) {
            const me = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger, this.proxyAgent);
            if (me.ok) {
                const userId = me.data?.id || me.data?.userId || me.data?.accountId;
                if (userId) {
                    await saveAppUserId(phone, String(userId));
                }
                const tokenToUse = getStoredTokens(phone)?.accessToken || stored.accessToken;
                await this.runMissions(tokenToUse, activeDeviceId, ctx);
                return { success: true, relogin: false, alreadyOk: true };
            }
            clearTokensForUser(phone);
        }

        const headers = buildHeaders(activeDeviceId, this.acc.userAgent);
        const lr = await loginWithOtpFlow(this.api, { phone, password }, headers, this.logger);

        if (!lr.ok) return { success: false, relogin: false, alreadyOk: false, reason: lr.reason };

        const final = getStoredTokens(phone);
        if (final?.accessToken && final?.refreshToken) {
            await saveTokensToDb(phone, final.accessToken, final.refreshToken).catch(() => { });
            
            const me = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger, this.proxyAgent);
            if (me.ok) {
                const userId = me.data?.id || me.data?.userId || me.data?.accountId;
                if (userId) {
                    await saveAppUserId(phone, String(userId));
                }
            }

            await this.runMissions(final.accessToken, activeDeviceId, ctx);
        }
        return { success: true, relogin: !!stored, alreadyOk: false };
    }

    private async runMissions(accessToken: string, deviceId: string, ctx: any) {
        this.logger.info("BOT_MISSIONS_START", ctx);
        const h = buildHeaders(deviceId, this.acc.userAgent);

        const accountSvc = new AccountMissionService(this.logger, this.api, this.proxyAgent);
        const interactSvc = new InteractionService(this.logger, this.api, this.proxyAgent);
        const relationSvc = new RelationService(this.logger, this.api, this.proxyAgent, this.acc.phone || this.acc.username);
        const postSvc = new PostService(this.logger, this.acc, this.proxyAgent);

        const boundDoMission = this.doMission.bind(this);

        try {
            await accountSvc.handleProfileAndSocial(accessToken, h, ctx, boundDoMission);
            await interactSvc.handleFeedAndInteract(accessToken, h, ctx, boundDoMission);
            await postSvc.handleAutoCreatePost(accessToken, h, ctx, boundDoMission);
            await accountSvc.handleActivityGeneration(accessToken, h, ctx, boundDoMission);
            await relationSvc.handleFriendManagement(accessToken, h, ctx, boundDoMission);

            this.logger.info("BOT_MISSIONS_COMPLETE", ctx);
        } catch (e: any) {
            this.logger.error("MISSIONS_SYSTEM_ERROR", { ...ctx, err: e.message });
            throw e;
        }
    }

    private async switchProxy(ctx: any): Promise<boolean> {
        if (!this.proxyManager) return false;
        if (this.acc.proxy) this.proxyManager.markFailed(this.acc.proxy);
        const newProxy = await this.proxyManager.getWorkingProxy();
        if (!newProxy || newProxy === this.acc.proxy) return false;
        this.acc.proxy = newProxy;
        this.proxyAgent = new HttpsProxyAgent(newProxy);
        this.logger.info("PROXY_SWITCHED", { ...ctx, newProxy });
        return true;
    }

    private extractBackendErrorDetail(data: any) {
        const raw =
            typeof data === "string"
                ? data
                : data !== undefined
                    ? JSON.stringify(data)
                    : "";

        const message =
            data?.message ||
            data?.error ||
            data?.detail ||
            data?.msg ||
            data?.data?.message ||
            data?.data?.error ||
            "";

        const code =
            data?.code ||
            data?.errorCode ||
            data?.statusCode ||
            data?.data?.code ||
            data?.data?.errorCode ||
            "";

        const errors =
            data?.errors ||
            data?.data?.errors ||
            data?.violations ||
            data?.data?.violations ||
            undefined;

        return {
            backendMessage: message || undefined,
            backendCode: code || undefined,
            backendErrors: errors,
            backendRaw: raw ? raw.slice(0, 1500) : undefined,
        };
    }

    private async doMission(name: string, action: () => Promise<any>, ctx: any) {
        try {
            await action();
            this.logger.info(`OK: ${name}`, ctx);
        } catch (e: any) {
            const status = e.response?.status;
            const backendError = this.extractBackendErrorDetail(e.response?.data);
            if (status === 400 || status === 403 || status === 404 || status === 409) {
                this.logger.warn(`MISSION_IGNORED (${status}): ${name}`, {
                    ...ctx,
                    detail: e.response?.data,
                    ...backendError,
                    failedUrl: e.config?.url
                });
                return;
            }
            if (status >= 500) {
                this.logger.error(`MISSION_FAILED (${status}): ${name}`, {
                    ...ctx,
                    detail: e.response?.data,
                    ...backendError,
                    failedUrl: e.config?.url
                });
            }
            if (isNetworkError(e) && this.acc.proxy) {
                if (await this.switchProxy(ctx)) {
                    try {
                        await action();
                        this.logger.info(`OK: ${name} (retry)`, ctx);
                        return;
                    } catch (retryErr: any) { throw retryErr; }
                }
            }
            throw e;
        }
    }
}
