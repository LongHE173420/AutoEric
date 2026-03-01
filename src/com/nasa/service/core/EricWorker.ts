import { AuthServiceApi } from "../../api/auth/authApiService";
import { AccountRepository } from "../../db/auth/AccountRepository";
import { AccountEntity } from "../../db/auth/Account.entity";
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
export type UserWorkerResult = {
    success: boolean;
    relogin: boolean;
    alreadyOk: boolean;
    reason?: string;
};

type AppLogger = ReturnType<typeof Log.getLogger>;

export class EricWorker {
    private logger: AppLogger;

    constructor(
        private readonly acc: AccountEntity,
        private readonly api: AuthServiceApi,
        private readonly repo: AccountRepository,
        parentLogger: AppLogger,
        private readonly defaultDeviceId: string,
        private readonly rowNo: number
    ) {
        this.logger = parentLogger;
    }
    private logContext() {
        const phone = String(this.acc.phone || "").replace(/\D/g, "");
        return { row: this.rowNo, accId: this.acc.id, phone };
    }

    async run(): Promise<UserWorkerResult> {
        const phone = String(this.acc.phone || "").replace(/\D/g, "");
        const password = String(this.acc.password || "");

        // Ensure strictly isolated device identification per user
        const activeDeviceId = this.acc.deviceId || uuidv4();

        const ctx = this.logContext();

        this.logger.debug("ACCOUNT_START", { ...ctx, password: maskPassword(password) });

        if (!phone || !password) {
            await this.repo.markAttempt(this.acc.id, "INVALID", "missing phone/password");
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
                    await this.repo.markAttempt(this.acc.id, "OK", "session still valid");
                    this.logger.debug("SESSION_OK_SKIP_LOGIN", { ...ctx, me: me.data });

                    const final = getStoredTokens(phone);
                    if (final) {
                        await this.repo.updateTokens(this.acc.id, { accessToken: final.accessToken, refreshToken: final.refreshToken });
                    }
                    return { success: true, relogin: false, alreadyOk: true };
                }

                this.logger.debug("SESSION_NOT_OK_WILL_LOGIN", { ...ctx, reason: me.message });
            }

            const headers = buildHeaders(activeDeviceId);
            const lr = await loginWithOtpFlow(this.api, { phone, password }, headers, this.logger);

            if (!lr.ok) {
                await this.repo.markAttempt(this.acc.id, "FAIL", String(lr.reason ?? "LOGIN_FAIL"));
                this.logger.debug("LOGIN_FLOW_FAIL", { ...ctx, reason: lr.reason });
                return { success: false, relogin: false, alreadyOk: false, reason: lr.reason };
            }
            const final = getStoredTokens(phone);
            if (final) {
                await this.repo.updateTokens(this.acc.id, { accessToken: final.accessToken, refreshToken: final.refreshToken });
                if (!this.acc.deviceId) {
                    await this.repo.updateDeviceId(this.acc.id, activeDeviceId);
                    this.acc.deviceId = activeDeviceId; // Sync back to memory 
                }
            }
            await this.repo.markAttempt(this.acc.id, "OK", "login ok");
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
            this.logger.debug("ACCOUNT_PROCESS_ERROR", { ...ctx, err: err?.message ?? String(err) });
            return { success: false, relogin: false, alreadyOk: false, reason: "EXCEPTION" };
        }
    }

    private async simulateInitialAppLoad(accessToken: string, ctx: any) {
        this.logger.debug("SIMULATING_APP_LOAD_POST_LOGIN", ctx);

        try {
            await FeedApiService.getListBackgroundColor(accessToken);
            this.logger.info("LOAD_SUCCESS: BackgroundColor", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: BackgroundColor", { ...ctx, error: e.message }); }

        try {
            await FriendApiService.getMyFriends(accessToken);
            this.logger.info("LOAD_SUCCESS: MyFriends", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: MyFriends", { ...ctx, error: e.message }); }

        try {
            await UserApiService.getProfileMe(accessToken);
            this.logger.info("LOAD_SUCCESS: ProfileMe", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: ProfileMe", { ...ctx, error: e.message }); }

        try {
            await MissionApiService.getCurrentUserMissions(accessToken);
            this.logger.info("LOAD_SUCCESS: Missions", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: Missions", { ...ctx, error: e.message }); }

        try {
            await ReactionApiService.listReactions(accessToken);
            this.logger.info("LOAD_SUCCESS: Reactions", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: Reactions", { ...ctx, error: e.message }); }

        try {
            await NotificationApiService.listNotifications(accessToken);
            this.logger.info("LOAD_SUCCESS: Notifications", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: Notifications", { ...ctx, error: e.message }); }

        try {
            await FeedApiService.getFeedHome(accessToken);
            this.logger.info("LOAD_SUCCESS: FeedHome", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: FeedHome", { ...ctx, error: e.message }); }

        try {
            await SurfApiService.getSurfHome(accessToken);
            this.logger.info("LOAD_SUCCESS: SurfHome", ctx);
        } catch (e: any) { this.logger.error("LOAD_ERROR: SurfHome", { ...ctx, error: e.message }); }

        this.logger.debug("SIMULATING_APP_LOAD_COMPLETE", ctx);
    }
}
