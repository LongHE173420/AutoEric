import { AuthServiceApi } from "../../api/auth/authApiService";
import { maskPassword, maskToken, Log } from "../../utils/log";
import { getStoredTokens, setStoredTokens, clearTokensForUser } from "../../storage/tokenStore";
import { getMeWithAutoAuth, loginWithOtpFlow } from "../auth/LoginFlowService";
import { saveTokensToDb } from "../../data/mysqlStore";
import { FeedApiService } from "../../api/feed/feedApiService";
import { FriendApiService } from "../../api/friend/friendApiService";
import { UserApiService } from "../../api/user/userApiService";
import { MissionApiService } from "../../api/missions/missionApiService";
import { ReactionApiService } from "../../api/reaction/reactionApiService";
import { NotificationApiService } from "../../api/notification/notificationApiService";
import { SurfApiService } from "../../api/surf/surfApiService";
import { CommentApiService } from "../../api/comment/commentApiService";
import { v4 as uuidv4 } from "uuid";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ENV } from "../../config/env";
import { buildHeaders } from "../../utils/headers";

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
            this.logger.info("WORKER_INITIALIZED_WITH_PROXY", { proxy: this.acc.proxy });
        } else {
            this.logger.info("WORKER_INITIALIZED_DIRECT_NO_PROXY", {});
        }
        const activeDeviceId = this.acc.deviceId || this.defaultDeviceId;
        this.api = new AuthServiceApi(activeDeviceId, ENV.KONG_URL, this.proxyAgent);

    }
    private logContext() {
        const phone = String(this.acc.phone || "").trim();
        return { row: this.rowNo, phone };
    }

    async run(): Promise<UserServiceResult> {
        const phone = String(this.acc.phone || this.acc.username || "").trim();
        const password = String(this.acc.password || "").trim();

        const ctx = this.logContext();

        this.logger.info("ACCOUNT_START", { ...ctx, password: maskPassword(password) });

        if (!phone || !password) {
            this.logger.warn("ACCOUNT_INVALID_SKIP", ctx);
            return { success: false, relogin: false, alreadyOk: false, reason: "INVALID_CREDENTIALS" };
        }

        try {
            const stored = getStoredTokens(phone);

            // Auto-fallback to previously stored device configuration if not present in payload
            const activeDeviceId = this.acc.deviceId || stored?.deviceId || uuidv4();
            const activeUserAgent = this.acc.userAgent || stored?.userAgent;

            // Sync active config backward so downstream API calls match perfectly
            this.acc.deviceId = activeDeviceId;
            this.acc.userAgent = activeUserAgent;

            if ((this.acc as any).accessToken && (this.acc as any).refreshToken) {
                setStoredTokens(phone, (this.acc as any).accessToken, (this.acc as any).refreshToken, activeDeviceId, activeUserAgent);
            }
            if (stored) {
                this.logger.info("TOKENS_FOUND",
                    {
                        ...ctx,
                        accessToken: maskToken(stored.accessToken),
                        refreshToken: maskToken(stored.refreshToken),
                    }
                );
                const me = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger, this.proxyAgent);
                if (me.ok) {
                    this.logger.info("SESSION_OK", { ...ctx, me: me.data });
                    // Only call runMissions if the token is proven to be fully valid and active
                    await this.runMissions(stored.accessToken, activeDeviceId, ctx);
                    return { success: true, relogin: false, alreadyOk: true };
                } else {
                    this.logger.info("SESSION_ME_CHECK_FAILED", { ...ctx, reason: me.message });
                    clearTokensForUser(phone);
                    // Do NOT runMissions here. Let it fall through to loginWithOtpFlow below.
                }
            }

            const headers = buildHeaders(activeDeviceId, this.acc.userAgent);
            const lr = await loginWithOtpFlow(this.api, { phone, password }, headers, this.logger);

            if (!lr.ok) {
                this.logger.info("LOGIN_FLOW_FAIL", { ...ctx, reason: lr.reason });
                return { success: false, relogin: false, alreadyOk: false, reason: lr.reason };
            }
            const final = getStoredTokens(phone);
            if (final?.accessToken && final?.refreshToken) {
                if (final.accessToken !== this.acc.accessToken || final.refreshToken !== this.acc.refreshToken) {
                    await saveTokensToDb(phone, final.accessToken, final.refreshToken).catch(e => this.logger.error("DB_SAVE_TOKEN_FAIL", { err: String(e) }));
                }
                if (!this.acc.deviceId) {
                    this.acc.deviceId = activeDeviceId; // Sync back to memory 
                }
                const me2 = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger, this.proxyAgent);
                if (me2.ok) {
                    this.logger.info("LOGIN_OK_ME_OK", { ...ctx, me: me2.data });
                } else {
                    this.logger.info("LOGIN_OK_ME_SKIP", { ...ctx, reason: me2.message });
                }
                // Always call runMissions after login success
                await this.runMissions(final.accessToken, activeDeviceId, ctx);
            }

            return { success: true, relogin: !!stored, alreadyOk: false };

        } catch (err: any) {
            // LOG CHI TIẾT LỖI TỪ BACKEND REPORT LÊN!
            const errorDetails = err?.response?.data || err?.message || String(err);
            this.logger.error("ACCOUNT_PROCESS_ERROR", { ...ctx, err: errorDetails });
            return { success: false, relogin: false, alreadyOk: false, reason: "EXCEPTION" };
        }
    }

    private async runMissions(accessToken: string, deviceId: string, ctx: any) {
        this.logger.info("BOT_MISSIONS_START", ctx);
        const agent = this.proxyAgent;
        const h = buildHeaders(deviceId, this.acc.userAgent);

        // 1. Mission: Profile Awareness
        await this.doMission("ProfileMe", () => UserApiService.getProfileMe(accessToken, h, agent), ctx);
        await this.doMission("Missions", () => MissionApiService.getCurrentUserMissions(accessToken, h, agent), ctx);

        // 2. Mission: Social Discovery
        await this.doMission("MyFriends", () => FriendApiService.getMyFriends(accessToken, h, agent), ctx);
        await this.doMission("Notifications", () => NotificationApiService.listNotifications(accessToken, h, 10, 0, agent), ctx);

        // 3. Mission: Content Consumption & Engagement
        let feedHome: any = null;
        await this.doMission("FeedHome", async () => {
            const res = await FeedApiService.getFeedHome(accessToken, h, "", Date.now(), 10, agent);
            feedHome = res.data;
            return res;
        }, ctx);

        await this.doMission("SurfHome", () => SurfApiService.getSurfHome(accessToken, h, "", Math.floor(Date.now() / 1000), 4, agent), ctx);


        // 4. Mission: Active Interaction (Dependent)
        if (feedHome && feedHome.data && Array.isArray(feedHome.data.items) && feedHome.data.items.length > 0) {
            const firstPost = feedHome.data.items[0];
            const postId = firstPost.id;
            this.logger.info("MISSION_ACTION_DEPENDENT_START", { ...ctx, postId });

            await this.doMission("PostReaction", () => ReactionApiService.sendReaction(accessToken, postId, "LIKE", h, agent), ctx);
            await this.doMission("PostComment", () => CommentApiService.createComment(accessToken, { postId, content: "Nice post! (Bot Auto)" }, h, agent), ctx);
        }

        // 5. Mission: Activity Generation
        await this.doMission("BackgroundColor", () => FeedApiService.getFeedBackgroundColor(accessToken, h, agent), ctx);

        // 6. Mission: List Reactions
        await this.doMission("ReactionList", () => ReactionApiService.listReactions(accessToken, h, 10, 0, agent), ctx);

        this.logger.info("BOT_MISSIONS_COMPLETE", ctx);
    }

    private async doMission(name: string, action: () => Promise<any>, ctx: any) {
        try {
            await action();
            this.logger.info(`OK: ${name}`, ctx);
        } catch (e: any) {
            const errData = e.response?.data || e.message;
            this.logger.error(`MISSION_ERROR: ${name}`, { ...ctx, error: errData, status: e.response?.status });
        }
    }
}
