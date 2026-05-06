"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EricWorker = void 0;
const authApiService_1 = require("../api/auth/authApiService");
const log_1 = require("../utils/log");
const tokenStore_1 = require("../storage/tokenStore");
const LoginFlowService_1 = require("../service/auth/LoginFlowService");
const mysqlStore_1 = require("../data/mysqlStore");
const uuid_1 = require("uuid");
const env_1 = require("../config/env");
const headers_1 = require("../utils/headers");
const errorUtils_1 = require("../utils/errorUtils");
const ProxyHelper_1 = require("../proxy/ProxyHelper");
const async_1 = require("../utils/async");
const AccountActivityPolicy_1 = require("../policy/AccountActivityPolicy");
const AccountMissionService_1 = require("../service/missions/AccountMissionService");
const InteractionService_1 = require("../service/action/InteractionService");
const RelationService_1 = require("../service/action/RelationService");
const PostService_1 = require("../service/action/PostService");
const SurfService_1 = require("../service/action/SurfService");
class EricWorker {
    constructor(acc, parentLogger, rowNo, proxyManager) {
        this.acc = acc;
        this.rowNo = rowNo;
        this.proxyManager = proxyManager;
        try {
            this.logger = parentLogger;
            this.proxyHelper = new ProxyHelper_1.ProxyHelper(this.acc, this.proxyManager, this.logger);
            this.activityPolicy = new AccountActivityPolicy_1.AccountActivityPolicy();
            const activeDeviceId = this.acc.deviceId || (0, uuid_1.v4)();
            this.acc.deviceId = activeDeviceId;
            this.api = new authApiService_1.AuthServiceApi(activeDeviceId, env_1.ENV.KONG_URL, this.proxyHelper.proxyAgent);
        }
        catch (e) {
            parentLogger.error("WORKER_INIT_ERROR", { err: e.message });
            this.logger = parentLogger;
            this.proxyHelper = new ProxyHelper_1.ProxyHelper(this.acc, this.proxyManager, this.logger);
            this.activityPolicy = new AccountActivityPolicy_1.AccountActivityPolicy();
            this.api = new authApiService_1.AuthServiceApi((0, uuid_1.v4)(), env_1.ENV.KONG_URL, this.proxyHelper.proxyAgent);
        }
    }
    logContext() {
        try {
            return { row: this.rowNo, phone: String(this.acc.phone || "").trim() };
        }
        catch (e) {
            return { row: -1, phone: "UNKNOWN" };
        }
    }
    async run() {
        try {
            const phone = String(this.acc.phone || this.acc.username || "").trim();
            const password = String(this.acc.password || "").trim();
            const ctx = this.logContext();
            this.logger.info("ACCOUNT_START", { ...ctx, password: (0, log_1.maskPassword)(password) });
            if (!phone || !password)
                return { success: false, executed: false, relogin: false, alreadyOk: false, reason: "INVALID_CREDENTIALS" };
            const currentDailyRunCount = Number(this.acc.dailyRunCount || 0);
            const currentDailyPostCount = Number(this.acc.dailyPostCount || 0);
            const currentDailySurfCount = Number(this.acc.dailySurfCount || 0);
            const runDecision = this.activityPolicy.decideRun(currentDailyRunCount, currentDailyPostCount, currentDailySurfCount, new Date());
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
                postsDone: runDecision.postsDone,
                surfsDone: runDecision.surfsDone,
                remainingPostQuota: runDecision.remainingPostQuota,
                remainingSurfQuota: runDecision.remainingSurfQuota
            });
            const executeAttempt = async (attempt) => {
                if (attempt === 1 && !this.acc.proxy) {
                    //await this.proxyHelper.attachInitialProxy(ctx);
                    if (this.proxyHelper.proxyAgent) {
                        this.api = new authApiService_1.AuthServiceApi(this.acc.deviceId || (0, uuid_1.v4)(), env_1.ENV.KONG_URL, this.proxyHelper.proxyAgent);
                    }
                }
                return await this.attemptRunProcess(phone, password, ctx, runDecision);
            };
            return await executeAttempt(1).then((result) => ({
                ...result,
                executed: true
            })).catch(async (err) => {
                if (((0, errorUtils_1.isNetworkError)(err) || err?.__proxyAuthIssue) && this.acc.proxy) {
                    if (await this.proxyHelper.switchProxy(ctx)) {
                        this.api = new authApiService_1.AuthServiceApi(this.acc.deviceId || (0, uuid_1.v4)(), env_1.ENV.KONG_URL, this.proxyHelper.proxyAgent);
                        const retried = await executeAttempt(2);
                        return {
                            ...retried,
                            executed: true
                        };
                    }
                }
                throw err;
            });
        }
        catch (e) {
            this.logger?.error("WORKER_RUN_ERROR", { err: e.message });
            return { success: false, executed: false, relogin: false, alreadyOk: false, reason: e.message || "WORKER_RUN_ERROR" };
        }
    }
    async attemptRunProcess(phone, password, ctx, runDecision) {
        try {
            const stored = (0, tokenStore_1.getStoredTokens)(phone);
            const activeDeviceId = this.acc.deviceId || stored?.deviceId || (0, uuid_1.v4)();
            const activeUserAgent = this.acc.userAgent || stored?.userAgent;
            this.acc.deviceId = activeDeviceId;
            this.acc.userAgent = activeUserAgent;
            if (this.acc.accessToken && this.acc.refreshToken) {
                (0, tokenStore_1.setStoredTokens)(phone, this.acc.accessToken, this.acc.refreshToken, activeDeviceId, activeUserAgent);
            }
            if (stored) {
                const me = await (0, LoginFlowService_1.getMeWithAutoAuth)(this.api, phone, activeDeviceId, this.logger, this.proxyHelper.proxyAgent);
                if (me.ok) {
                    const userId = me.data?.id || me.data?.userId || me.data?.accountId;
                    if (userId) {
                        this.acc.app_user_id = String(userId);
                        await (0, mysqlStore_1.saveAppUserId)(phone, String(userId));
                    }
                    const tokenToUse = (0, tokenStore_1.getStoredTokens)(phone)?.accessToken || stored.accessToken;
                    await this.runMissions(tokenToUse, activeDeviceId, ctx, runDecision, userId ? String(userId) : null);
                    return { success: true, executed: true, relogin: false, alreadyOk: true };
                }
                (0, tokenStore_1.clearTokensForUser)(phone);
            }
            const headers = (0, headers_1.buildHeaders)(activeDeviceId, this.acc.userAgent);
            for (let loginAttempt = 1; loginAttempt <= 2; loginAttempt++) {
                const lr = await (0, LoginFlowService_1.loginWithOtpFlow)(this.api, { phone, password }, headers, this.logger);
                if (!lr.ok) {
                    if (loginAttempt === 2) {
                        return { success: false, executed: true, relogin: false, alreadyOk: false, reason: lr.reason };
                    }
                    continue;
                }
                const final = (0, tokenStore_1.getStoredTokens)(phone);
                if (!final?.accessToken || !final?.refreshToken) {
                    if (loginAttempt === 2) {
                        return { success: false, executed: true, relogin: false, alreadyOk: false, reason: "TOKENS_MISSING_AFTER_LOGIN" };
                    }
                    (0, tokenStore_1.clearTokensForUser)(phone);
                    continue;
                }
                await (0, mysqlStore_1.saveTokensToDb)(phone, final.accessToken, final.refreshToken).catch(() => { });
                const me = await (0, LoginFlowService_1.getMeWithAutoAuth)(this.api, phone, activeDeviceId, this.logger, this.proxyHelper.proxyAgent);
                if (!me.ok) {
                    this.logger.warn("GET_ME_FAILED_AFTER_LOGIN_RETRY", { ...ctx, loginAttempt, reason: me.message });
                    (0, tokenStore_1.clearTokensForUser)(phone);
                    if (loginAttempt === 2) {
                        return { success: false, executed: true, relogin: false, alreadyOk: false, reason: me.message || "ME_FAIL_AFTER_LOGIN" };
                    }
                    continue;
                }
                const userId = me.data?.id || me.data?.userId || me.data?.accountId;
                if (userId) {
                    this.acc.app_user_id = String(userId);
                    await (0, mysqlStore_1.saveAppUserId)(phone, String(userId));
                }
                await this.runMissions(final.accessToken, activeDeviceId, ctx, runDecision, userId ? String(userId) : null);
                return { success: true, executed: true, relogin: !!stored, alreadyOk: false };
            }
            return { success: false, executed: true, relogin: false, alreadyOk: false, reason: "LOGIN_VALIDATION_FAILED" };
        }
        catch (e) {
            this.logger?.error("ATTEMPT_RUN_PROCESS_ERROR", { ...ctx, err: e.message });
            return { success: false, executed: true, relogin: false, alreadyOk: false, reason: e.message || "ATTEMPT_RUN_PROCESS_ERROR" };
        }
    }
    async runMissions(accessToken, deviceId, ctx, runDecision, currentUserId) {
        try {
            this.logger.info("BOT_MISSIONS_START", {
                ...ctx,
                runIndex: runDecision.runIndex,
                dailyRunLimit: runDecision.dailyRunLimit,
                shouldPost: runDecision.shouldPost,
                shouldSurf: runDecision.shouldSurf
            });
            const h = (0, headers_1.buildHeaders)(deviceId, this.acc.userAgent);
            const accountSvc = new AccountMissionService_1.AccountMissionService(this.logger, this.proxyHelper.proxyAgent);
            const interactSvc = new InteractionService_1.InteractionService(this.logger, this.proxyHelper.proxyAgent, this.acc.phone || this.acc.username || "", currentUserId || this.acc.app_user_id || null);
            const relationSvc = new RelationService_1.RelationService(this.logger, this.proxyHelper.proxyAgent, this.acc.phone || this.acc.username);
            const postSvc = new PostService_1.PostService(this.logger, this.acc, this.proxyHelper.proxyAgent);
            const surfSvc = new SurfService_1.SurfService(this.logger, this.acc, this.proxyHelper.proxyAgent);
            const boundDoMission = this.doMission.bind(this);
            const TEST_ONLY_POST = false; // Đổi thành false khi muốn chạy toàn bộ tính năng
            if (!TEST_ONLY_POST) {
                await this.runMissionStage("PROFILE_AND_SOCIAL", ctx, () => accountSvc.handleProfileAndSocial(accessToken, h, ctx, boundDoMission));
                await this.runMissionStage("STREAK_CLAIMING", ctx, () => accountSvc.handleRewardClaiming(accessToken, h, ctx, boundDoMission));
                await this.runMissionStage("FEED_AND_INTERACT", ctx, () => interactSvc.handleFeedAndInteract(accessToken, h, ctx, boundDoMission));
            }
            if (runDecision.shouldPost) {
                const posted = await this.runMissionStage("CREATE_VIDEO_POST", ctx, () => postSvc.handleAutoCreatePost(accessToken, h, ctx, boundDoMission));
                if (posted) {
                    const postCounters = await (0, mysqlStore_1.recordDailyPublishInDb)(String(this.acc.phone || this.acc.username || "").trim(), "post");
                    this.logger.info("ACCOUNT_DAILY_POST_RECORDED", {
                        ...ctx,
                        runIndex: runDecision.runIndex,
                        postsDone: Number(postCounters?.daily_post_count || 0),
                        surfsDone: Number(postCounters?.daily_surf_count || 0),
                        postLimit: env_1.ENV.ACCOUNT_DAILY_POST_LIMIT
                    });
                }
            }
            else {
                this.logger.info("CREATE_VIDEO_POST_SKIPPED_BY_RANDOM", {
                    ...ctx,
                    runIndex: runDecision.runIndex,
                    dailyRunLimit: runDecision.dailyRunLimit
                });
            }
            if (!TEST_ONLY_POST) {
                if (runDecision.shouldSurf) {
                    const surfed = await this.runMissionStage("CREATE_SURF", ctx, () => surfSvc.handleAutoCreateSurf(accessToken, h, ctx, boundDoMission));
                    if (surfed) {
                        const surfCounters = await (0, mysqlStore_1.recordDailyPublishInDb)(String(this.acc.phone || this.acc.username || "").trim(), "surf");
                        this.logger.info("ACCOUNT_DAILY_SURF_RECORDED", {
                            ...ctx,
                            runIndex: runDecision.runIndex,
                            postsDone: Number(surfCounters?.daily_post_count || 0),
                            surfsDone: Number(surfCounters?.daily_surf_count || 0),
                            surfLimit: env_1.ENV.ACCOUNT_DAILY_SURF_LIMIT
                        });
                    }
                }
                else {
                    this.logger.info("CREATE_SURF_SKIPPED_BY_RANDOM", {
                        ...ctx,
                        runIndex: runDecision.runIndex,
                        dailyRunLimit: runDecision.dailyRunLimit
                    });
                }
                await this.runMissionStage("ACTIVITY_GENERATION", ctx, () => accountSvc.handleActivityGeneration(accessToken, h, ctx, boundDoMission));
                await this.runMissionStage("FRIEND_MANAGEMENT", ctx, () => relationSvc.handleFriendManagement(accessToken, h, ctx, boundDoMission));
                await this.runMissionStage("REWARD_CLAIMING", ctx, () => accountSvc.handleRewardClaiming(accessToken, h, ctx, boundDoMission));
            }
            this.logger.info("BOT_MISSIONS_COMPLETE", ctx);
        }
        catch (e) {
            this.logger.error("MISSIONS_SYSTEM_ERROR", { ...ctx, err: e.message });
            this.logger?.error("RUN_MISSIONS_FATAL_ERROR", { ...ctx, err: e.message });
            throw e;
        }
    }
    async runMissionStage(stage, ctx, work) {
        this.logger.info("MISSION_STAGE_START", { ...ctx, stage });
        try {
            const result = await work();
            this.logger.info("MISSION_STAGE_DONE", { ...ctx, stage });
            return result;
        }
        catch (e) {
            this.logger.error("MISSION_STAGE_ERROR", { ...ctx, stage, err: e.message || String(e) });
            throw e;
        }
    }
    extractBackendErrorDetail(data) {
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
        }
        catch (e) {
            return {};
        }
    }
    async doMission(name, action, ctx) {
        try {
            const handleFailure = async (e) => {
                const status = e.response?.status;
                const backendError = this.extractBackendErrorDetail(e.response?.data);
                if (status === 401) {
                    this.logger.error(`MISSION_FAILED (401): ${name}`, {
                        ...ctx, detail: e.response?.data, ...backendError,
                        failedUrl: e.config?.url, usingProxy: this.acc.proxy || undefined
                    });
                    if (this.acc.proxy)
                        e.__proxyAuthIssue = true;
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
                if ((status === 429 || (0, errorUtils_1.isNetworkError)(e)) && this.acc.proxy) {
                    await (0, async_1.sleep)(env_1.ENV.API_RETRY_BACKOFF_MS);
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
        }
        catch (e) {
            throw e;
        }
    }
}
exports.EricWorker = EricWorker;
