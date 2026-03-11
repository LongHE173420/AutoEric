import { AuthServiceApi } from "../../api/auth/authApiService";
import { maskPassword, maskToken, Log } from "../../utils/log";
import { getStoredTokens, setStoredTokens, clearTokensForUser } from "../../storage/tokenStore";
import { getMeWithAutoAuth, loginWithOtpFlow } from "../auth/LoginFlowService";
import { saveTokensToDb } from "../../data/mysqlStore";
import { ProxyManager } from "./ProxyManager";
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
import { getRandomComment, getRandomStatus, getRandomReaction } from "../../utils/botContent";
import { isNetworkError } from "../../utils/errorUtils";

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
        private readonly rowNo: number,
        private readonly proxyManager?: ProxyManager
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

    private async attemptRunProcess(phone: string, password: string, ctx: any): Promise<UserServiceResult> {
        const stored = getStoredTokens(phone);

        const activeDeviceId = this.acc.deviceId || stored?.deviceId || uuidv4();
        const activeUserAgent = this.acc.userAgent || stored?.userAgent;
        this.acc.deviceId = activeDeviceId;
        this.acc.userAgent = activeUserAgent;

        if ((this.acc as any).accessToken && (this.acc as any).refreshToken) {
            setStoredTokens(phone, (this.acc as any).accessToken, (this.acc as any).refreshToken, activeDeviceId, activeUserAgent);
        }
        if (stored) {
            this.logger.info("TOKENS_FOUND", {
                ...ctx,
                accessToken: maskToken(stored.accessToken),
                refreshToken: maskToken(stored.refreshToken),
            });
            const me = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger, this.proxyAgent);
            if (me.ok) {
                this.logger.info("SESSION_OK", { ...ctx, me: me.data });
                const freshStored = getStoredTokens(phone);
                const tokenToUse = freshStored?.accessToken || stored.accessToken;
                try { await this.runMissions(tokenToUse, activeDeviceId, ctx); }
                catch (mErr: any) {
                    this.logger.error("MISSIONS_ABORTED", { ...ctx, err: mErr?.message });
                    throw mErr;
                }
                return { success: true, relogin: false, alreadyOk: true };
            } else {
                this.logger.info("SESSION_ME_CHECK_FAILED", { ...ctx, reason: me.message });
                clearTokensForUser(phone);
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
                this.acc.deviceId = activeDeviceId;
            }
            const me2 = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger, this.proxyAgent);
            if (me2.ok) {
                this.logger.info("LOGIN_OK_ME_OK", { ...ctx, me: me2.data });
            } else {
                this.logger.info("LOGIN_OK_ME_SKIP", { ...ctx, reason: me2.message });
            }
            try { await this.runMissions(final.accessToken, activeDeviceId, ctx); }
            catch (mErr: any) {
                this.logger.error("MISSIONS_ABORTED", { ...ctx, err: mErr?.message });
                throw mErr;
            }
        }

        return { success: true, relogin: !!stored, alreadyOk: false };
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

        let lastErrorDetails = "";
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                return await this.attemptRunProcess(phone, password, ctx);
            } catch (err: any) {
                const errorDetails = err?.response?.data || err?.message || String(err);
                lastErrorDetails = errorDetails;

                if (isNetworkError(err) && this.acc.proxy && attempt === 1) {
                    this.logger.warn("LOGIN_NETWORK_ERROR_RETRY", { ...ctx, error: errorDetails, attempt });
                    const switched = await this.switchProxy(ctx);
                    if (switched) {
                        this.logger.info("LOGIN_RETRY_WILL_START", ctx);
                        this.api = new AuthServiceApi(this.acc.deviceId || this.defaultDeviceId, ENV.KONG_URL, this.proxyAgent);
                        continue;
                    }
                }

                this.logger.error("ACCOUNT_PROCESS_ERROR", { ...ctx, err: errorDetails });
                throw err;
            }
        }

        throw new Error(lastErrorDetails);
    }
    private async runMissions(accessToken: string, deviceId: string, ctx: any) {
        try {
            this.logger.info("BOT_MISSIONS_START", ctx);
            const h = buildHeaders(deviceId, this.acc.userAgent);

            await this.handleProfileAndSocial(accessToken, h, ctx);
            await this.handleFeedAndInteract(accessToken, h, ctx);
            await this.handleAutoCreatePost(accessToken, h, ctx);
            await this.handleActivityGeneration(accessToken, h, ctx);
            await this.handleFriendManagement(accessToken, h, ctx);

            this.logger.info("BOT_MISSIONS_COMPLETE", ctx);
        } catch (e: any) {
            this.logger.error("MISSIONS_SYSTEM_ERROR", { ...ctx, err: e?.message || String(e) });
            throw e;
        }
    }

    private async handleProfileAndSocial(accessToken: string, h: any, ctx: any) {
        try {
            await this.doMission("ProfileMe", () => UserApiService.getProfileMe(accessToken, h, this.proxyAgent), ctx);
            await this.doMission("Missions", () => MissionApiService.getCurrentUserMissions(accessToken, h, this.proxyAgent), ctx);
            await this.doMission("MyFriends", () => FriendApiService.getMyFriends(accessToken, h, this.proxyAgent), ctx);
            await this.doMission("Notifications", () => NotificationApiService.listNotifications(accessToken, h, 10, 0, this.proxyAgent), ctx);
        } catch (e: any) {
            throw e;
        }
    }

    private async handleFeedAndInteract(accessToken: string, h: any, ctx: any) {
        try {
            let allItems: any[] = [];
            let lastPostId = "";
            let lastCreatedAt = Date.now();

            for (let page = 0; page < 3; page++) {
                await this.doMission(`FeedHome_Page_${page + 1}`, async () => {
                    let res = await FeedApiService.getFeedHome(accessToken, h, lastPostId, lastCreatedAt, 10, this.proxyAgent);
                    let isEmpty = true;
                    if (res.data) {
                        if (Array.isArray(res.data) && res.data.length > 0) isEmpty = false;
                        else if (Array.isArray(res.data.data) && res.data.data.length > 0) isEmpty = false;
                        else if (res.data.data && Array.isArray(res.data.data.items) && res.data.data.items.length > 0) isEmpty = false;
                        else if (Array.isArray(res.data.items) && res.data.items.length > 0) isEmpty = false;
                    }
                    if (isEmpty && page === 0) {
                        res = await FeedApiService.getFeedHomeFree(h, 10, 0, this.proxyAgent);
                    }

                    let items: any[] = [];
                    if (res.data) {
                        if (Array.isArray(res.data)) items = res.data;
                        else if (Array.isArray(res.data.data)) items = res.data.data;
                        else if (res.data.data && Array.isArray(res.data.data.items)) items = res.data.data.items;
                        else if (Array.isArray(res.data.items)) items = res.data.items;
                        else if (res.data.data && res.data.data.data && Array.isArray(res.data.data.data)) items = res.data.data.data;
                    }

                    if (items.length > 0) {
                        const lastItem = items[items.length - 1];
                        lastPostId = lastItem.id || "";
                        lastCreatedAt = lastItem.createdAt || Date.now();
                        allItems = allItems.concat(items);
                    }
                    return res;
                }, ctx);

                if (page < 2) await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1500));
            }

            await this.doMission("SurfHome", () => SurfApiService.getSurfHome(accessToken, h, "", Math.floor(Date.now() / 1000), 4, this.proxyAgent), ctx);

            this.logger.info("DEBUG_FEEDHOME", { itemsLength: allItems.length, pagesScrolled: 3 });

            if (allItems.length > 0) {
                const uniqueItems = Array.from(new Map(allItems.map(i => [i.id, i])).values());
                const interactItems = uniqueItems.sort(() => 0.5 - Math.random()).slice(0, 5);
                this.logger.info("MISSION_ACTION_DEPENDENT_START", { ...ctx, parsedItemCount: interactItems.length });
                for (let i = 0; i < interactItems.length; i++) {
                    const post = interactItems[i];
                    const postId = post.id;
                    if (true) {
                        const rType = getRandomReaction();
                        await this.doMission(`PostReaction_${postId}`, () => ReactionApiService.sendReaction(accessToken, postId, rType, h, this.proxyAgent), ctx);
                    }
                    if (true) {
                        const cText = getRandomComment();
                        await this.doMission(`PostComment_${postId}`, () => CommentApiService.createComment(accessToken, { postId, content: cText }, h, this.proxyAgent), ctx);
                    }
                    if (true) {
                        await this.doMission(`PostShare_${postId}`, () => FeedApiService.repostPost(accessToken, postId, h, this.proxyAgent), ctx);
                    }
                }
            }
        } catch (e: any) {
            throw e;
        }
    }

    private async handleAutoCreatePost(accessToken: string, h: any, ctx: any) {
        try {
            if (true) {
                const t = getRandomStatus();
                const postPayload = {
                    content: t, mediaType: "TEXT", hashtags: "[]", mentions: "[]",
                    type: "POST", privacy: "PUBLIC", checkinLocation: null, tags: "[]", backgroundColor: null
                };
                await this.doMission("CreatePost", async () => {
                    try {
                        return await FeedApiService.createPost(accessToken, postPayload, h, this.proxyAgent);
                    } catch (e: any) {
                        console.log("[DEBUG_CREATEPOST] CÓ LỖI TẠO BÀI (STATUS " + e.response?.status + "):", JSON.stringify(e.response?.data).substring(0, 500));
                        throw e;
                    }
                }, ctx);
            }
        } catch (e: any) {
            throw e;
        }
    }

    private async handleActivityGeneration(accessToken: string, h: any, ctx: any) {
        try {
            await this.doMission("BackgroundColor", () => FeedApiService.getFeedBackgroundColor(accessToken, h, this.proxyAgent), ctx);
            await this.doMission("ReactionList", () => ReactionApiService.listReactions(accessToken, h, 10, 0, this.proxyAgent), ctx);
        } catch (e: any) {
            throw e;
        }
    }

    private async handleFriendManagement(accessToken: string, h: any, ctx: any) {
        try {
            let receivedReqs: any = null;
            await this.doMission("GetReceivedFriendRequests", async () => {
                const res = await FriendApiService.getReceivedRequests(accessToken, h, 10, 0, this.proxyAgent);
                receivedReqs = res.data;
                return res;
            }, ctx);
            if (receivedReqs?.data && Array.isArray(receivedReqs.data.items) && receivedReqs.data.items.length > 0) {
                for (const req of receivedReqs.data.items) {
                    const senderId = req.senderId || req.userId || req.id;
                    if (senderId) {
                        await this.doMission(`AcceptFriend_${senderId}`, () =>
                            FriendApiService.acceptFriendRequest(accessToken, String(senderId), h, this.proxyAgent), ctx);
                    }
                }
            }

            let suggests: any = null;
            try {
                const keywords = ["Anh", "Minh", "Trang", "Hùng", "Bách", "Ngọc", "Linh", "Hải", "Tuấn", "Vy", "Huyền", "Phương"];
                const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
                const res = await FriendApiService.searchSuggests(accessToken, randomKeyword, h, 5, 0, this.proxyAgent);
                suggests = res.data;
                this.logger.info("OK: GetFriendSuggests", ctx);
            } catch (e: any) {
                const errData = e.response?.data || e.message;
                this.logger.warn("MISSION_ERROR_IGNORED: GetFriendSuggests", { ...ctx, error: errData, status: e.response?.status });
            }

            if (suggests?.data && Array.isArray(suggests.data.items) && suggests.data.items.length > 0) {
                const toAdd = suggests.data.items.slice(0, 3);
                for (const user of toAdd) {
                    const receiverId = user.userId || user.id;
                    if (receiverId) {
                        await this.doMission(`SendFriendRequest_${receiverId}`, () =>
                            FriendApiService.sendFriendRequest(accessToken, String(receiverId), h, this.proxyAgent), ctx);
                    }
                }
            }
        } catch (e: any) {
            throw e;
        }
    }

    private async switchProxy(ctx: any): Promise<boolean> {
        try {
            if (!this.proxyManager) return false;
            const oldProxy = this.acc.proxy;
            if (oldProxy) this.proxyManager.markFailed(oldProxy);
            const newProxy = await this.proxyManager.getWorkingProxy();
            if (!newProxy || newProxy === oldProxy) return false;
            this.acc.proxy = newProxy;
            this.proxyAgent = new HttpsProxyAgent(newProxy) as any;
            this.logger.info("PROXY_SWITCHED", { ...ctx, oldProxy, newProxy });
            return true;
        } catch (e: any) {
            this.logger.error("SWITCH_PROXY_ERROR", { ...ctx, err: e?.message || String(e) });
            return false;
        }
    }

    private async doMission(name: string, action: () => Promise<any>, ctx: any) {
        try {
            await action();
            this.logger.info(`OK: ${name}`, ctx);
        } catch (e: any) {
            const errData = e.response?.data || e.message;
            this.logger.error(`MISSION_ERROR: ${name}`, { ...ctx, error: errData, status: e.response?.status });

            if (isNetworkError(e) && this.acc.proxy) {
                const switched = await this.switchProxy(ctx);
                if (switched) {
                    try {
                        await action();
                        this.logger.info(`OK: ${name} (retry)`, ctx);
                        return;
                    } catch (retryErr: any) {
                        const retryData = retryErr?.response?.data || retryErr?.message;
                        this.logger.error(`RETRY_FAILED: ${name}`, { ...ctx, error: retryData });
                        throw retryErr;
                    }
                }
            }
            throw e;
        }
    }
}
