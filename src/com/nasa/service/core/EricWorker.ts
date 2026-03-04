import { AuthServiceApi } from "../../api/auth/authApiService";
import { maskPassword, maskToken, Log } from "../../utils/log";
import { buildHeaders } from "../../utils/headers";
import { getStoredTokens, setStoredTokens } from "../../storage/tokenStore";
import { getMeWithAutoAuth, loginWithOtpFlow } from "../auth/LoginFlowService";
import { FeedApiService } from "../../api/feed/feedApiService";
import { FriendApiService } from "../../api/friend/friendApiService";
import { UserApiService } from "../../api/user/userApiService";
import { MissionApiService } from "../../api/missions/missionApiService";
import { ReactionApiService } from "../../api/reaction/reactionApiService";
import { NotificationApiService } from "../../api/notification/notificationApiService";
import { SurfApiService } from "../../api/surf/surfApiService";
import { v4 as uuidv4 } from "uuid";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ENV } from "../../config/env";

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
        private readonly defaultDeviceId: string,
        private readonly rowNo: number
    ) {
        this.logger = parentLogger;
        if (this.acc.proxy) {
            this.proxyAgent = new HttpsProxyAgent(this.acc.proxy);
        }
        this.api = new AuthServiceApi(ENV.KONG_URL, this.proxyAgent);
    }
    private logContext() {
        const phone = String(this.acc.phone || "").trim();
        return { row: this.rowNo, accId: this.acc.id, phone, proxy: this.acc.proxy || "direct" };
    }

    async run(): Promise<UserServiceResult> {
        const phone = String(this.acc.phone || "").trim();
        const password = String(this.acc.password || "");

        // Ensure strictly isolated device identification per user
        const activeDeviceId = this.acc.deviceId || uuidv4();

        const ctx = this.logContext();

        this.logger.debug("ACCOUNT_START", { ...ctx, password: maskPassword(password) });

        if (!phone || !password) {
            this.logger.warn("ACCOUNT_INVALID_SKIP", ctx);
            return { success: false, relogin: false, alreadyOk: false, reason: "INVALID_CREDENTIALS" };
        }

        try {
            if (this.acc.accessToken && this.acc.refreshToken) {
                setStoredTokens(phone, this.acc.accessToken, this.acc.refreshToken, activeDeviceId);
            }
            const stored = getStoredTokens(phone);
            if (stored) {
                this.logger.debug("TOKENS_FOUND",
                    {
                        ...ctx,
                        accessToken: maskToken(stored.accessToken),
                        refreshToken: maskToken(stored.refreshToken),
                    }
                );
                const me = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger);
                if (me.ok) {
                    this.logger.debug("SESSION_OK_SKIP_LOGIN", { ...ctx, me: me.data });

                    const final = getStoredTokens(phone);
                    return { success: true, relogin: false, alreadyOk: true };
                }

                this.logger.debug("SESSION_NOT_OK_WILL_LOGIN", { ...ctx, reason: me.message });
            }

            const headers = buildHeaders(activeDeviceId);
            const lr = await loginWithOtpFlow(this.api, { phone, password }, headers, this.logger);

            if (!lr.ok) {
                this.logger.debug("LOGIN_FLOW_FAIL", { ...ctx, reason: lr.reason });
                return { success: false, relogin: false, alreadyOk: false, reason: lr.reason };
            }
            const final = getStoredTokens(phone);
            if (final) {
                if (!this.acc.deviceId) {
                    this.acc.deviceId = activeDeviceId; // Sync back to memory 
                }
            }
            const me2 = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger);
            if (me2.ok) {
                this.logger.debug("LOGIN_OK_ME_OK", { ...ctx, me: me2.data });

                // Gỉa lập load app sau login giống hệt mobile
                if (final?.accessToken) {
                    await this.simulateInitialAppLoad(final.accessToken, ctx);
                }

            } else {
                this.logger.debug("LOGIN_OK_BUT_ME_FAIL", { ...ctx, reason: me2.message });
            }

            return { success: true, relogin: !!stored, alreadyOk: false };

        } catch (err: any) {
            // LOG CHI TIẾT LỖI TỪ BACKEND REPORT LÊN!
            const errorDetails = err?.response?.data || err?.message || String(err);
            this.logger.error("ACCOUNT_PROCESS_ERROR", { ...ctx, err: errorDetails });
            return { success: false, relogin: false, alreadyOk: false, reason: "EXCEPTION" };
        }
    }

    private async simulateInitialAppLoad(accessToken: string, ctx: any) {
        this.logger.debug("SIMULATING_APP_LOAD_POST_LOGIN", ctx);
        const agent = this.proxyAgent;

        try {
            await FeedApiService.getListBackgroundColor(accessToken, agent);
            this.logger.info("LOAD_SUCCESS: BackgroundColor", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: BackgroundColor", { ...ctx, error: e.message }); }

        try {
            await FriendApiService.getMyFriends(accessToken, agent);
            this.logger.info("LOAD_SUCCESS: MyFriends", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: MyFriends", { ...ctx, error: e.message }); }

        try {
            await UserApiService.getProfileMe(accessToken, agent);
            this.logger.info("LOAD_SUCCESS: ProfileMe", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: ProfileMe", { ...ctx, error: e.message }); }

        try {
            await MissionApiService.getCurrentUserMissions(accessToken, agent);
            this.logger.info("LOAD_SUCCESS: Missions", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: Missions", { ...ctx, error: e.message }); }

        try {
            await ReactionApiService.listReactions(accessToken, agent);
            this.logger.info("LOAD_SUCCESS: Reactions", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: Reactions", { ...ctx, error: e.message }); }

        try {
            await NotificationApiService.listNotifications(accessToken, agent);
            this.logger.info("LOAD_SUCCESS: Notifications", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: Notifications", { ...ctx, error: e.message }); }

        try {
            await FeedApiService.getFeedHome(accessToken, agent);
            this.logger.info("LOAD_SUCCESS: FeedHome", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: FeedHome", { ...ctx, error: e.message }); }

        try {
            await SurfApiService.getSurfHome(accessToken, agent);
            this.logger.info("LOAD_SUCCESS: SurfHome", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: SurfHome", { ...ctx, error: e.message }); }

        this.logger.debug("SIMULATING_APP_LOAD_COMPLETE", ctx);
    }
}
