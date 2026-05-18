import { AuthServiceApi } from "../api/auth/authApiService";
import { maskPassword, Log } from "../utils/log";
import { getStoredTokens, setStoredTokens, clearTokensForUser } from "../storage/tokenStore";
import { getMeWithAutoAuth, loginWithOtpFlow } from "../service/auth/LoginFlowService";
import { saveTokensToDb, saveAppUserId, recordDailyPublishInDb } from "../data/mysqlStore";
import { ProxyManager } from "../proxy/ProxyManager";
import { v4 as uuidv4 } from "uuid";
import { ENV } from "../config/env";
import { buildHeaders } from "../utils/headers";
import { isNetworkError } from "../utils/errorUtils";
import { ProxyHelper } from "../proxy/ProxyHelper";
import { sleep } from "../utils/async";
import { AccountActivityPolicy, AccountActivityDecision } from "../policy/AccountActivityPolicy";
import { getSharedPlannerStateStore } from "../storage/plannerStateStore";

import { AccountMissionService } from "../service/missions/AccountMissionService";
import { InteractionService } from "../service/action/InteractionService";
import { RelationService } from "../service/action/RelationService";
import { PostService } from "../service/action/PostService";
import { SurfService } from "../service/action/SurfService";

export type UserServiceResult = {
    success: boolean;
    executed: boolean;
    relogin: boolean;
    alreadyOk: boolean;
    reason?: string;
};

type AppLogger = ReturnType<typeof Log.getLogger>;

export class EricWorker {
    private logger: AppLogger;
    private api: AuthServiceApi;
    private proxyHelper: ProxyHelper;
    private activityPolicy: AccountActivityPolicy;
    private plannerStateStore = getSharedPlannerStateStore();

    constructor(
        private readonly acc: any,
        parentLogger: AppLogger,
        private readonly rowNo: number,
        private readonly proxyManager?: ProxyManager
    ) {
        try {
            this.logger = parentLogger;
            this.proxyHelper = new ProxyHelper(this.acc, this.proxyManager, this.logger);
            this.activityPolicy = new AccountActivityPolicy();

            const activeDeviceId = this.acc.deviceId || uuidv4();
            this.acc.deviceId = activeDeviceId;
            this.api = new AuthServiceApi(activeDeviceId, ENV.KONG_URL, this.proxyHelper.proxyAgent);
        } catch (e: any) {
            parentLogger.error("WORKER_INIT_ERROR", { err: e.message });
            this.logger = parentLogger;
            this.proxyHelper = new ProxyHelper(this.acc, this.proxyManager, this.logger);
            this.activityPolicy = new AccountActivityPolicy();
            this.api = new AuthServiceApi(uuidv4(), ENV.KONG_URL, this.proxyHelper.proxyAgent);
        }
    }

    private logContext() {
        try {
            return { row: this.rowNo, phone: String(this.acc.phone || "").trim() };
        } catch (e) {
            return { row: -1, phone: "UNKNOWN" };
        }
    }

    async run(plannedDecision?: AccountActivityDecision | null): Promise<UserServiceResult> {
        try {
            const phone = String(this.acc.phone || this.acc.username || "").trim();
            const password = String(this.acc.password || "").trim();
            const ctx = this.logContext();
            this.logger.info("ACCOUNT_START", { ...ctx, password: maskPassword(password) });

            if (!phone || !password) return { success: false, executed: false, relogin: false, alreadyOk: false, reason: "INVALID_CREDENTIALS" };

            const currentDailyRunCount = Number(this.acc.dailyRunCount || 0);
            const currentDailyPostCount = Number(this.acc.dailyPostCount || 0);
            const currentDailySurfCount = Number(this.acc.dailySurfCount || 0);
            const runDecision = plannedDecision ?? this.activityPolicy.decideRun(
                currentDailyRunCount,
                currentDailyPostCount,
                currentDailySurfCount,
                new Date()
            );

            this.logger.info("ACCOUNT_ACTIVITY_DECISION", {
                ...ctx,
                dayKey: runDecision.dayKey,
                dailyRunLimit: runDecision.dailyRunLimit,
                currentDailyRunCount,
                currentDailyPostCount,
                currentDailySurfCount,
                runIndex: runDecision.runIndex,
                remainingRuns: runDecision.remainingRuns,
                runProgressPercent: runDecision.runProgressPercent,
                postChancePercent: runDecision.postChancePercent,
                surfChancePercent: runDecision.surfChancePercent,
                shouldPost: runDecision.shouldPost,
                shouldSurf: runDecision.shouldSurf,
                postWeight: runDecision.postWeight,
                surfWeight: runDecision.surfWeight,
                eligibleForPost: runDecision.eligibleForPost,
                eligibleForSurf: runDecision.eligibleForSurf,
                postGapRunsRemaining: runDecision.postGapRunsRemaining,
                surfGapRunsRemaining: runDecision.surfGapRunsRemaining,
                decisionSource: runDecision.decisionSource,
                postJitterMs: runDecision.postJitterMs,
                surfJitterMs: runDecision.surfJitterMs,
                postsDone: runDecision.postsDone,
                surfsDone: runDecision.surfsDone,
                remainingPostQuota: runDecision.remainingPostQuota,
                remainingSurfQuota: runDecision.remainingSurfQuota
            });

            const executeAttempt = async (attempt: number): Promise<UserServiceResult> => {
                if (attempt === 1 && !this.acc.proxy) {
                    //await this.proxyHelper.attachInitialProxy(ctx);
                    if (this.proxyHelper.proxyAgent) {
                        this.api = new AuthServiceApi(this.acc.deviceId || uuidv4(), ENV.KONG_URL, this.proxyHelper.proxyAgent);
                    }
                }
                return await this.attemptRunProcess(phone, password, ctx, runDecision);
            };

            return await executeAttempt(1).then((result) => ({
                ...result,
                executed: true
            })).catch(async (err: any) => {
                if ((isNetworkError(err) || err?.__proxyAuthIssue) && this.acc.proxy) {
                    if (await this.proxyHelper.switchProxy(ctx)) {
                        this.api = new AuthServiceApi(this.acc.deviceId || uuidv4(), ENV.KONG_URL, this.proxyHelper.proxyAgent);
                        const retried = await executeAttempt(2);
                        return {
                            ...retried,
                            executed: true
                        };
                    }
                }
                throw err;
            });
        } catch (e: any) {
            this.logger?.error("WORKER_RUN_ERROR", { err: e.message });
            return { success: false, executed: false, relogin: false, alreadyOk: false, reason: e.message || "WORKER_RUN_ERROR" };
        }
    }

    private async attemptRunProcess(phone: string, password: string, ctx: any, runDecision: AccountActivityDecision): Promise<UserServiceResult> {
        try {
            const stored = getStoredTokens(phone);
            const activeDeviceId = this.acc.deviceId || stored?.deviceId || uuidv4();
            const activeUserAgent = this.acc.userAgent || stored?.userAgent;
            this.acc.deviceId = activeDeviceId;
            this.acc.userAgent = activeUserAgent;

            if (this.acc.accessToken && this.acc.refreshToken) {
                setStoredTokens(phone, this.acc.accessToken, this.acc.refreshToken, activeDeviceId, activeUserAgent);
            }

            if (stored) {
                const me = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger, this.proxyHelper.proxyAgent);
                if (me.ok) {
                    const userId = me.data?.id || me.data?.userId || me.data?.accountId;
                    if (userId) {
                        this.acc.app_user_id = String(userId);
                        await saveAppUserId(phone, String(userId));
                    }
                    const tokenToUse = getStoredTokens(phone)?.accessToken || stored.accessToken;
                    await this.runMissions(tokenToUse, activeDeviceId, ctx, runDecision, userId ? String(userId) : null);
                    return { success: true, executed: true, relogin: false, alreadyOk: true };
                }
                clearTokensForUser(phone);
            }

            const headers = buildHeaders(activeDeviceId, this.acc.userAgent);

            for (let loginAttempt = 1; loginAttempt <= 2; loginAttempt++) {
                const lr = await loginWithOtpFlow(this.api, { phone, password }, headers, this.logger);

                if (!lr.ok) {
                    if (loginAttempt === 2) {
                        return { success: false, executed: true, relogin: false, alreadyOk: false, reason: lr.reason };
                    }
                    continue;
                }

                const final = getStoredTokens(phone);
                if (!final?.accessToken || !final?.refreshToken) {
                    if (loginAttempt === 2) {
                        return { success: false, executed: true, relogin: false, alreadyOk: false, reason: "TOKENS_MISSING_AFTER_LOGIN" };
                    }
                    clearTokensForUser(phone);
                    continue;
                }

                await saveTokensToDb(phone, final.accessToken, final.refreshToken).catch(() => { });

                const me = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger, this.proxyHelper.proxyAgent);
                if (!me.ok) {
                    this.logger.warn("GET_ME_FAILED_AFTER_LOGIN_RETRY", { ...ctx, loginAttempt, reason: me.message });
                    clearTokensForUser(phone);
                    if (loginAttempt === 2) {
                        return { success: false, executed: true, relogin: false, alreadyOk: false, reason: me.message || "ME_FAIL_AFTER_LOGIN" };
                    }
                    continue;
                }

                const userId = me.data?.id || me.data?.userId || me.data?.accountId;
                if (userId) {
                    this.acc.app_user_id = String(userId);
                    await saveAppUserId(phone, String(userId));
                }

                await this.runMissions(final.accessToken, activeDeviceId, ctx, runDecision, userId ? String(userId) : null);
                return { success: true, executed: true, relogin: !!stored, alreadyOk: false };
            }

            return { success: false, executed: true, relogin: false, alreadyOk: false, reason: "LOGIN_VALIDATION_FAILED" };
        } catch (e: any) {
            this.logger?.error("ATTEMPT_RUN_PROCESS_ERROR", { ...ctx, err: e.message });
            return { success: false, executed: true, relogin: false, alreadyOk: false, reason: e.message || "ATTEMPT_RUN_PROCESS_ERROR" };
        }
    }

    private async runMissions(accessToken: string, deviceId: string, ctx: any, runDecision: AccountActivityDecision, currentUserId?: string | null) {
        try {
            this.logger.info("BOT_MISSIONS_START", {
                ...ctx,
                runIndex: runDecision.runIndex,
                dailyRunLimit: runDecision.dailyRunLimit,
                shouldPost: runDecision.shouldPost,
                shouldSurf: runDecision.shouldSurf
            });
            const h = buildHeaders(deviceId, this.acc.userAgent);

            const accountSvc = new AccountMissionService(this.logger, this.proxyHelper.proxyAgent);
            const interactSvc = new InteractionService(this.logger, this.proxyHelper.proxyAgent, this.acc.phone || this.acc.username || "", currentUserId || this.acc.app_user_id || null);
            const relationSvc = new RelationService(this.logger, this.proxyHelper.proxyAgent, this.acc.phone || this.acc.username);
            const postSvc = new PostService(this.logger, this.acc, this.proxyHelper.proxyAgent);
            const surfSvc = new SurfService(this.logger, this.acc, this.proxyHelper.proxyAgent);

            const boundDoMission = this.doMission.bind(this);

            const TEST_ONLY_POST = false; // Đổi thành false khi muốn chạy toàn bộ tính năng

            if (!TEST_ONLY_POST) {
                await this.runMissionStage("PROFILE_AND_SOCIAL", ctx, () => accountSvc.handleProfileAndSocial(accessToken, h, ctx, boundDoMission));
                await this.runMissionStage("STREAK_CLAIMING", ctx, () => accountSvc.handleRewardClaiming(accessToken, h, ctx, boundDoMission));
                await this.runMissionStage("FEED_AND_INTERACT", ctx, () => interactSvc.handleFeedAndInteract(accessToken, h, ctx, boundDoMission));
            }

            if (runDecision.shouldPost) {
                if (runDecision.postJitterMs > 0) {
                    await sleep(runDecision.postJitterMs);
                }

                const postCounters = await recordDailyPublishInDb(String(this.acc.phone || this.acc.username || "").trim(), "post");
                await this.plannerStateStore.recordActionRun(runDecision.dayKey, String(this.acc.phone || this.acc.username || "").trim(), "post", runDecision.runIndex).catch(() => { });
                this.logger.info("ACCOUNT_DAILY_POST_ATTEMPT_RECORDED", {
                    ...ctx,
                    runIndex: runDecision.runIndex,
                    postsDone: Number(postCounters?.daily_post_count || 0),
                    surfsDone: Number(postCounters?.daily_surf_count || 0),
                    postLimit: ENV.ACCOUNT_DAILY_POST_LIMIT
                });

                const posted = await this.runMissionStage("CREATE_VIDEO_POST", ctx, () => postSvc.handleAutoCreatePost(accessToken, h, ctx, boundDoMission));
                if (posted) {
                    this.logger.info("ACCOUNT_DAILY_POST_ATTEMPT_SUCCEEDED", {
                        ...ctx,
                        runIndex: runDecision.runIndex
                    });
                }
            } else {
                this.logger.info(
                    runDecision.decisionSource === "planner" ? "CREATE_VIDEO_POST_SKIPPED_BY_RUN_PLAN" : "CREATE_VIDEO_POST_SKIPPED_BY_RANDOM",
                    {
                    ...ctx,
                    runIndex: runDecision.runIndex,
                    dailyRunLimit: runDecision.dailyRunLimit
                    }
                );
            }

            if (!TEST_ONLY_POST) {
                if (runDecision.shouldSurf) {
                    if (runDecision.surfJitterMs > 0) {
                        await sleep(runDecision.surfJitterMs);
                    }

                    const surfCounters = await recordDailyPublishInDb(String(this.acc.phone || this.acc.username || "").trim(), "surf");
                    await this.plannerStateStore.recordActionRun(runDecision.dayKey, String(this.acc.phone || this.acc.username || "").trim(), "surf", runDecision.runIndex).catch(() => { });
                    this.logger.info("ACCOUNT_DAILY_SURF_ATTEMPT_RECORDED", {
                        ...ctx,
                        runIndex: runDecision.runIndex,
                        postsDone: Number(surfCounters?.daily_post_count || 0),
                        surfsDone: Number(surfCounters?.daily_surf_count || 0),
                        surfLimit: ENV.ACCOUNT_DAILY_SURF_LIMIT
                    });

                    const surfed = await this.runMissionStage("CREATE_SURF", ctx, () => surfSvc.handleAutoCreateSurf(accessToken, h, ctx, boundDoMission));
                    if (surfed) {
                        this.logger.info("ACCOUNT_DAILY_SURF_ATTEMPT_SUCCEEDED", {
                            ...ctx,
                            runIndex: runDecision.runIndex
                        });
                    }
                } else {
                    this.logger.info(
                        runDecision.decisionSource === "planner" ? "CREATE_SURF_SKIPPED_BY_RUN_PLAN" : "CREATE_SURF_SKIPPED_BY_RANDOM",
                        {
                        ...ctx,
                        runIndex: runDecision.runIndex,
                        dailyRunLimit: runDecision.dailyRunLimit
                        }
                    );
                }
                await this.runMissionStage("ACTIVITY_GENERATION", ctx, () => accountSvc.handleActivityGeneration(accessToken, h, ctx, boundDoMission));
                await this.runMissionStage("FRIEND_MANAGEMENT", ctx, () => relationSvc.handleFriendManagement(accessToken, h, ctx, boundDoMission));
                await this.runMissionStage("REWARD_CLAIMING", ctx, () => accountSvc.handleRewardClaiming(accessToken, h, ctx, boundDoMission));
            }

            this.logger.info("BOT_MISSIONS_COMPLETE", ctx);
        } catch (e: any) {
            this.logger.error("MISSIONS_SYSTEM_ERROR", { ...ctx, err: e.message });
            this.logger?.error("RUN_MISSIONS_FATAL_ERROR", { ...ctx, err: e.message });
            throw e;
        }
    }

    private async runMissionStage<T>(stage: string, ctx: any, work: () => Promise<T>) {
        this.logger.info("MISSION_STAGE_START", { ...ctx, stage });
        try {
            const result = await work();
            this.logger.info("MISSION_STAGE_DONE", { ...ctx, stage });
            return result;
        } catch (e: any) {
            this.logger.error("MISSION_STAGE_ERROR", { ...ctx, stage, err: e.message || String(e) });
            throw e;
        }
    }

    private extractBackendErrorDetail(data: any) {
        try {
            const raw = typeof data === "string" ? data : data !== undefined ? JSON.stringify(data) : "";
            const message = data?.message || data?.error || data?.detail || data?.msg || data?.data?.message || data?.data?.error || "";
            const code = data?.code || data?.errorCode || data?.statusCode || data?.data?.code || data?.data?.errorCode || "";
            const errors = data?.errors || data?.data?.errors || data?.violations || data?.data?.violations || undefined;

            return {
                backendMessage: message || undefined,
                backendCode: code || undefined,
                backendErrors: errors,
                backendRaw: raw ? raw.slice(0, 1500) : undefined,
            };
        } catch (e) {
            return {};
        }
    }

    private async doMission(name: string, action: () => Promise<any>, ctx: any) {
        try {
            const handleFailure = async (e: any) => {
                const status = e.response?.status;
                const backendError = this.extractBackendErrorDetail(e.response?.data);

                if (status === 401) {
                    this.logger.error(`MISSION_FAILED (401): ${name}`, {
                        ...ctx, detail: e.response?.data, ...backendError,
                        failedUrl: e.config?.url, usingProxy: this.acc.proxy || undefined
                    });
                    if (this.acc.proxy) e.__proxyAuthIssue = true;
                    throw e;
                }

                const url = e.config?.url;

                if (url && url.includes('claim-streak-mission-reward')) {
                    require('fs').appendFileSync('streak-trace.json', JSON.stringify({
                        status,
                        data: e.response?.data,
                        headers: e.config?.headers,
                        body: e.config?.data,
                        sig: e.config?.headers?.['X-Signature']
                    }, null, 2) + '\n\n');
                }

                if (status === 400 || status === 403 || status === 404 || status === 409) {
                    this.logger.warn(`MISSION_IGNORED (${status}): ${name}`, {
                        ...ctx, detail: e.response?.data, ...backendError, failedUrl: e.config?.url
                    });
                    return { _ignored: true };
                }

                if (status >= 500) {
                    this.logger.error(`MISSION_FAILED (${status}): ${name}`, {
                        ...ctx, detail: e.response?.data, ...backendError, failedUrl: e.config?.url
                    });
                }

                if ((status === 429 || isNetworkError(e)) && this.acc.proxy) {
                    await sleep(ENV.API_RETRY_BACKOFF_MS);
                    if (await this.proxyHelper.switchProxy(ctx)) {
                        const retryRes = await action();
                        this.logger.info(`OK: ${name} (retry)`, ctx);
                        return { _retried: true, data: retryRes };
                    }
                }

                throw e;
            };

            const result = await action().catch(handleFailure);

            if (result && result._ignored) {
                return null;
            }

            if (result && result._retried) {
                return result.data;
            }

            this.logger.info(`OK: ${name}`, ctx);
            return result;
        } catch (e: any) {
            throw e;
        }
    }
}
