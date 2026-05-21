"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountActionRewardService = void 0;
const missionApiService_1 = require("../../api/missions/missionApiService");
const actionRewardStateStore_1 = require("../../storage/actionRewardStateStore");
class AccountActionRewardService {
    constructor(logger, proxyAgent) {
        this.logger = logger;
        this.proxyAgent = proxyAgent;
        this.timeZone = "Asia/Ho_Chi_Minh";
        this.stateStore = (0, actionRewardStateStore_1.getSharedActionRewardStateStore)();
    }
    normalizeSearchText(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .replace(/Đ/g, "D")
            .toLowerCase()
            .trim();
    }
    getDateKeyInTimeZone(input, timeZone = this.timeZone) {
        const date = input instanceof Date ? input : new Date(input);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(date);
        const year = parts.find((part) => part.type === "year")?.value;
        const month = parts.find((part) => part.type === "month")?.value;
        const day = parts.find((part) => part.type === "day")?.value;
        if (!year || !month || !day) {
            return null;
        }
        return `${year}-${month}-${day}`;
    }
    getWeekKeyInTimeZone(input, timeZone = this.timeZone) {
        const dateKey = this.getDateKeyInTimeZone(input, timeZone);
        if (!dateKey)
            return null;
        const [year, month, day] = dateKey.split("-").map((part) => Number(part));
        if (!year || !month || !day)
            return null;
        const localDateUtc = Date.UTC(year, month - 1, day);
        const dayOfWeek = new Date(localDateUtc).getUTCDay();
        const daysSinceMonday = (dayOfWeek + 6) % 7;
        const monday = new Date(localDateUtc - daysSinceMonday * 24 * 60 * 60 * 1000);
        const mondayYear = monday.getUTCFullYear();
        const mondayMonth = String(monday.getUTCMonth() + 1).padStart(2, "0");
        const mondayDay = String(monday.getUTCDate()).padStart(2, "0");
        return `${mondayYear}-${mondayMonth}-${mondayDay}`;
    }
    isStreakMission(mission) {
        const type = String(mission?.type || "").toUpperCase();
        const actionType = String(mission?.actionType || "").toUpperCase();
        const normalizedName = this.normalizeSearchText(mission?.name);
        const missionId = Number(mission?.missionId || mission?.id || 0);
        return (type === "STREAK_LOGIN" ||
            type === "STREAK" ||
            actionType === "LOGIN" ||
            missionId === 18 ||
            normalizedName.includes("chuoi"));
    }
    getActionRewardStoreKey(phone) {
        return `actionRewardCounters:${String(phone || "").trim().toLowerCase()}`;
    }
    getDailyPointStateStoreKey(phone) {
        return `dailyPointState:${String(phone || "").trim().toLowerCase()}`;
    }
    async getDailyPointState(phone, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        return await this.stateStore.getDailyPointState(phone, dayKey);
    }
    async recordDailyPointBalance(phone, balanceData, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        const dailyRemainingPointRaw = balanceData?.dailyRemainingPoint ?? balanceData?.remainingPoint;
        const dailyEarnedPointRaw = balanceData?.dailyEarnedPoint ?? null;
        const dailyRemainingPoint = dailyRemainingPointRaw === null || dailyRemainingPointRaw === undefined
            ? null
            : Number(dailyRemainingPointRaw);
        const dailyEarnedPoint = dailyEarnedPointRaw === null || dailyEarnedPointRaw === undefined
            ? null
            : Number(dailyEarnedPointRaw);
        const dailyPointLimit = balanceData?.maxDailyPoint !== null && balanceData?.maxDailyPoint !== undefined
            ? Number(balanceData.maxDailyPoint)
            : (dailyRemainingPoint !== null && dailyEarnedPoint !== null
                ? dailyRemainingPoint + dailyEarnedPoint
                : null);
        const state = {
            dayKey,
            dailyRemainingPoint,
            dailyEarnedPoint,
            dailyPointLimit
        };
        await this.stateStore.setDailyPointState(phone, state);
        return state;
    }
    async getCachedDailyPointSummary(phone, now = new Date()) {
        const state = await this.getDailyPointState(phone, now);
        return state ? { ...state } : null;
    }
    async consumeCachedDailyPoint(phone, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        return await this.stateStore.consumeDailyPoint(phone, dayKey);
    }
    getDailyActionRewardField(category) {
        switch (category) {
            case "REACTION":
                return "reaction";
            case "FRIEND":
                return "friend";
            case "POST":
                return "post";
            case "COMMENT":
                return "comment";
        }
    }
    getWeeklyActionRewardField(category) {
        switch (category) {
            case "REACTION":
                return "weeklyReaction";
            case "FRIEND":
                return "weeklyFriend";
            case "POST":
                return "weeklyPost";
            case "COMMENT":
                return "weeklyComment";
        }
    }
    getActionRewardField(category, scope) {
        return scope === "WEEKLY"
            ? this.getWeeklyActionRewardField(category)
            : this.getDailyActionRewardField(category);
    }
    getDailyActionRewardProgressField(category) {
        switch (category) {
            case "REACTION":
                return "reactionProgress";
            case "FRIEND":
                return "friendProgress";
            case "POST":
                return "postProgress";
            case "COMMENT":
                return "commentProgress";
        }
    }
    getWeeklyActionRewardProgressField(category) {
        switch (category) {
            case "REACTION":
                return "weeklyReactionProgress";
            case "FRIEND":
                return "weeklyFriendProgress";
            case "POST":
                return "weeklyPostProgress";
            case "COMMENT":
                return "weeklyCommentProgress";
        }
    }
    getActionRewardProgressField(category, scope) {
        return scope === "WEEKLY"
            ? this.getWeeklyActionRewardProgressField(category)
            : this.getDailyActionRewardProgressField(category);
    }
    getActionRewardLimit(category, scope) {
        switch (category) {
            case "REACTION":
            case "FRIEND":
            case "POST":
            case "COMMENT":
                return 1;
        }
    }
    getDefaultActionRewardCounters(dayKey, weekKey) {
        return {
            dayKey,
            weekKey,
            reaction: 0,
            friend: 0,
            post: 0,
            comment: 0,
            reactionProgress: 0,
            friendProgress: 0,
            postProgress: 0,
            commentProgress: 0,
            weeklyReaction: 0,
            weeklyFriend: 0,
            weeklyPost: 0,
            weeklyComment: 0,
            weeklyReactionProgress: 0,
            weeklyFriendProgress: 0,
            weeklyPostProgress: 0,
            weeklyCommentProgress: 0
        };
    }
    async getActionRewardCounters(phone, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        const weekKey = this.getWeekKeyInTimeZone(now) || dayKey;
        const dailyRecord = await this.stateStore.getActionRewardRecord(phone, "DAILY", dayKey);
        const weeklyRecord = await this.stateStore.getActionRewardRecord(phone, "WEEKLY", weekKey);
        return {
            dayKey,
            weekKey,
            reaction: Number(dailyRecord.reaction || 0),
            friend: Number(dailyRecord.friend || 0),
            post: Number(dailyRecord.post || 0),
            comment: Number(dailyRecord.comment || 0),
            reactionProgress: Number(dailyRecord.reactionProgress || 0),
            friendProgress: Number(dailyRecord.friendProgress || 0),
            postProgress: Number(dailyRecord.postProgress || 0),
            commentProgress: Number(dailyRecord.commentProgress || 0),
            weeklyReaction: Number(weeklyRecord.weeklyReaction || 0),
            weeklyFriend: Number(weeklyRecord.weeklyFriend || 0),
            weeklyPost: Number(weeklyRecord.weeklyPost || 0),
            weeklyComment: Number(weeklyRecord.weeklyComment || 0),
            weeklyReactionProgress: Number(weeklyRecord.weeklyReactionProgress || 0),
            weeklyFriendProgress: Number(weeklyRecord.weeklyFriendProgress || 0),
            weeklyPostProgress: Number(weeklyRecord.weeklyPostProgress || 0),
            weeklyCommentProgress: Number(weeklyRecord.weeklyCommentProgress || 0)
        };
    }
    async canClaimActionReward(phone, category, scope, now = new Date()) {
        const counters = await this.getActionRewardCounters(phone, now);
        return this.getActionRewardQuotaFromCounters(counters, category, scope);
    }
    getActionRewardQuotaFromCounters(counters, category, scope) {
        const limit = this.getActionRewardLimit(category, scope);
        const field = this.getActionRewardField(category, scope);
        const used = Number(counters[field] || 0);
        return {
            counters,
            limit,
            used,
            remaining: Math.max(0, limit - used),
            allowed: used < limit
        };
    }
    async markActionRewardProgress(phone, category, now = new Date()) {
        const counters = await this.getActionRewardCounters(phone, now);
        const dailyProgressField = this.getActionRewardProgressField(category, "DAILY");
        const weeklyProgressField = this.getActionRewardProgressField(category, "WEEKLY");
        const [dailyProgress, weeklyProgress] = await Promise.all([
            this.stateStore.incrementActionRewardProgress(phone, "DAILY", counters.dayKey, dailyProgressField),
            this.stateStore.incrementActionRewardProgress(phone, "WEEKLY", counters.weekKey, weeklyProgressField)
        ]);
        const nextCounters = {
            ...counters,
            [dailyProgressField]: Number(dailyProgress || 0),
            [weeklyProgressField]: Number(weeklyProgress || 0)
        };
        return {
            counters: nextCounters,
            dailyProgress: Number(nextCounters[dailyProgressField] || 0),
            weeklyProgress: Number(nextCounters[weeklyProgressField] || 0)
        };
    }
    async markActionRewardClaimed(phone, category, scope, target, now = new Date()) {
        const counters = await this.getActionRewardCounters(phone, now);
        const field = this.getActionRewardField(category, scope);
        const periodKey = scope === "WEEKLY" ? counters.weekKey : counters.dayKey;
        const used = await this.stateStore.incrementActionRewardClaimed(phone, scope, periodKey, field);
        await this.consumeCachedDailyPoint(phone, now);
        return {
            ...counters,
            [field]: Number(used || 0)
        };
    }
    isClaimableRegularMission(mission) {
        if (!mission || this.isStreakMission(mission))
            return false;
        const currentValue = Number(mission?.currentValue || 0);
        const targetValue = Number(mission?.targetValue || 0);
        const status = String(mission?.status || "").toUpperCase();
        return (status === "COMPLETED" ||
            status === "DONE" ||
            status === "SUCCESS" ||
            (targetValue > 0 && currentValue >= targetValue)) && status !== "CLAIMED";
    }
    getMissionActionCategory(mission) {
        const type = String(mission?.type || "").toUpperCase();
        const actionType = String(mission?.actionType || "").toUpperCase();
        const normalizedName = this.normalizeSearchText(mission?.name);
        const signals = [type, actionType].filter(Boolean).join(" ");
        const matchesReaction = signals.includes("REACTION") ||
            signals.includes("LIKE") ||
            signals.includes("EMOTION") ||
            normalizedName.includes("cam xuc") ||
            normalizedName.includes("tha cam xuc") ||
            normalizedName.includes("reaction") ||
            normalizedName.includes("like");
        if (matchesReaction)
            return "REACTION";
        const matchesFriend = signals.includes("FRIEND") ||
            signals.includes("ADD_FRIEND") ||
            signals.includes("SEND_FRIEND") ||
            signals.includes("FRIEND_REQUEST") ||
            normalizedName.includes("ket ban") ||
            normalizedName.includes("friend");
        if (matchesFriend)
            return "FRIEND";
        const matchesComment = signals.includes("COMMENT") ||
            normalizedName.includes("binh luan") ||
            normalizedName.includes("comment");
        if (matchesComment)
            return "COMMENT";
        const matchesPost = (signals.includes("POST") || signals.includes("CREATE_POST") || signals.includes("PUBLISH_POST")) &&
            !signals.includes("REPOST") &&
            !signals.includes("SURF") &&
            !normalizedName.includes("surf") &&
            (normalizedName.includes("dang bai") || normalizedName.includes("post") || normalizedName.includes("bai viet") || normalizedName === "");
        if (matchesPost)
            return "POST";
        return null;
    }
    inferMissionScope(mission) {
        const type = String(mission?.type || "").toUpperCase();
        return type === "WEEKLY" ? "WEEKLY" : "DAILY";
    }
    isActionRewardMission(mission, category, scope) {
        if (!mission || this.isStreakMission(mission))
            return false;
        const inferredScope = this.inferMissionScope(mission);
        if (inferredScope !== scope) {
            return false;
        }
        const status = String(mission?.status || "").toUpperCase();
        if (status === "CLAIMED" || status === "EXPIRED" || status === "DISABLED") {
            return false;
        }
        return this.getMissionActionCategory(mission) === category;
    }
    findActionRewardMission(missions, category, scope) {
        return [...(Array.isArray(missions) ? missions : [])]
            .filter((mission) => this.isActionRewardMission(mission, category, scope))
            .sort((a, b) => Number(a?.missionId || a?.id || 0) - Number(b?.missionId || b?.id || 0))
            .at(0);
    }
    summarizeMissionsForLog(missions) {
        return (Array.isArray(missions) ? missions : []).map((mission) => ({
            missionId: mission?.missionId || mission?.id || null,
            name: mission?.name || null,
            type: mission?.type || null,
            actionType: mission?.actionType || null,
            status: mission?.status || null,
            currentValue: mission?.currentValue ?? null,
            targetValue: mission?.targetValue ?? null,
            category: this.getMissionActionCategory(mission),
            claimable: this.isClaimableRegularMission(mission)
        }));
    }
    getActionRewardProgressValue(counters, category, scope) {
        const field = this.getActionRewardProgressField(category, scope);
        return Number(counters[field] || 0);
    }
    getRegularClaimFailureField(category, scope, missionId) {
        return `regular:${scope}:${category}:${missionId}`;
    }
    getStreakClaimFailureField(missionId) {
        return `streak:${missionId}`;
    }
    async hasClaimFailure(phone, failureField, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        return await this.stateStore.hasClaimFailure(phone, dayKey, failureField);
    }
    async recordClaimFailure(phone, failureField, detail, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        await this.stateStore.recordClaimFailure(phone, dayKey, failureField, detail);
    }
    async hasStreakClaimedToday(phone, missionId, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        const record = await this.stateStore.getStreakClaim(phone, dayKey);
        const claimed = Number(record?.claimed || 0) > 0;
        if (!claimed)
            return false;
        return !missionId || Number(record?.missionId || 0) === Number(missionId);
    }
    async markStreakClaimed(phone, missionId, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        await this.stateStore.setStreakClaim(phone, dayKey, missionId);
        await this.consumeCachedDailyPoint(phone, now);
    }
    async getOrFetchDailyPointState(accessToken, h, phone) {
        const cached = await this.getDailyPointState(phone);
        if (cached)
            return cached;
        const balanceRes = await missionApiService_1.MissionApiService.getPointBalance(accessToken, h, this.proxyAgent);
        const balanceData = balanceRes.data?.data || balanceRes.data || {};
        return await this.recordDailyPointBalance(phone, balanceData);
    }
    async getActionRewardPlan(accessToken, h, ctx, category) {
        const phone = String(ctx?.phone || "").trim().toLowerCase();
        if (!phone) {
            return { shouldDoAction: false, reason: "NO_ACTIVE_MISSION", activeScopes: [] };
        }
        const dailyPointState = await this.getOrFetchDailyPointState(accessToken, h, phone);
        const dailyPointExhausted = dailyPointState.dailyRemainingPoint !== null && dailyPointState.dailyRemainingPoint <= 0;
        const res = await missionApiService_1.MissionApiService.getCurrentUserMissions(accessToken, h, this.proxyAgent);
        const missions = Array.isArray(res.data?.data || res.data) ? (res.data?.data || res.data) : [];
        const counters = await this.getActionRewardCounters(phone);
        const activeScopes = [];
        let sawCandidate = false;
        for (const scope of ["DAILY", "WEEKLY"]) {
            if (dailyPointExhausted && scope === "DAILY") {
                continue;
            }
            const candidate = this.findActionRewardMission(missions, category, scope);
            if (!candidate)
                continue;
            sawCandidate = true;
            const missionId = Number(candidate?.missionId || candidate?.id || 0);
            const status = String(candidate?.status || "").toUpperCase();
            if (!missionId || status === "CLAIMED" || status === "EXPIRED" || status === "DISABLED") {
                continue;
            }
            const quota = this.getActionRewardQuotaFromCounters(counters, category, scope);
            if (!quota.allowed) {
                continue;
            }
            const failureField = this.getRegularClaimFailureField(category, scope, missionId);
            if (await this.hasClaimFailure(phone, failureField)) {
                continue;
            }
            const targetValue = Number(candidate?.targetValue || 0);
            const localProgress = this.getActionRewardProgressValue(counters, category, scope);
            const serverClaimable = this.isClaimableRegularMission(candidate);
            const readyByLocal = targetValue > 0 && localProgress >= targetValue;
            if (!serverClaimable && !readyByLocal) {
                activeScopes.push(scope);
            }
        }
        if (activeScopes.length === 0) {
            return {
                shouldDoAction: false,
                reason: sawCandidate ? "ALL_SCOPES_CLAIMED" : "NO_ACTIVE_MISSION",
                activeScopes,
                dailyPointState,
                dailyPointExhausted
            };
        }
        return {
            shouldDoAction: true,
            activeScopes,
            dailyPointState,
            dailyPointExhausted
        };
    }
    async claimRegularMission(mission, accessToken, h, ctx, doMission, category, scope) {
        const missionId = Number(mission?.missionId || mission?.id || 0);
        if (!missionId)
            return false;
        this.logger.info("MISSION_REWARD_CLAIM_REQUEST", {
            ...ctx,
            claimType: "REGULAR",
            category,
            scope,
            missionId,
            name: mission?.name || null,
            type: mission?.type || null,
            actionType: mission?.actionType || null,
            cv: mission?.currentValue ?? 0,
            tv: mission?.targetValue ?? 0,
            status: mission?.status || null
        });
        const result = await doMission(`ClaimMission_${scope}_${category}_${missionId}`, () => missionApiService_1.MissionApiService.claimMissionReward(accessToken, missionId, h, this.proxyAgent), ctx);
        return result !== null;
    }
    async handleActionRewardClaim(accessToken, h, ctx, doMission, category) {
        const emptyResult = { claimedAny: false, dailyPointExhausted: false };
        try {
            const phone = String(ctx?.phone || "").trim().toLowerCase();
            if (!phone)
                return emptyResult;
            const progress = await this.markActionRewardProgress(phone, category);
            const cachedDailyPointState = await this.getDailyPointState(phone);
            if (cachedDailyPointState && cachedDailyPointState.dailyRemainingPoint !== null && cachedDailyPointState.dailyRemainingPoint <= 0) {
                this.logger.info("AUTO_MISSION_REWARD_SKIPPED_CACHED_NO_DAILY_POINT", {
                    ...ctx,
                    category,
                    dailyRemainingPoint: cachedDailyPointState.dailyRemainingPoint,
                    dailyEarnedPoint: cachedDailyPointState.dailyEarnedPoint,
                    dailyPointLimit: cachedDailyPointState.dailyPointLimit,
                    dayKey: cachedDailyPointState.dayKey
                });
                return { claimedAny: false, dailyPointExhausted: false, planChanged: true };
            }
            let claimedAny = false;
            let dailyPointExhausted = false;
            let planChanged = false;
            const lastCandidates = {};
            const res = await missionApiService_1.MissionApiService.getCurrentUserMissions(accessToken, h, this.proxyAgent);
            const missions = Array.isArray(res.data?.data || res.data) ? (res.data?.data || res.data) : [];
            for (const scope of ["DAILY", "WEEKLY"]) {
                const candidate = this.findActionRewardMission(missions, category, scope);
                if (!candidate)
                    continue;
                const missionId = candidate?.missionId || candidate?.id || null;
                const missionStatus = String(candidate?.status || "").toUpperCase();
                lastCandidates[scope] = {
                    missionId,
                    name: candidate?.name || null,
                    type: candidate?.type || null,
                    actionType: candidate?.actionType || null,
                    status: missionStatus,
                    currentValue: candidate?.currentValue ?? null,
                    targetValue: candidate?.targetValue ?? null
                };
                this.logger.info("AUTO_MISSION_REWARD_CANDIDATE", {
                    ...ctx,
                    category,
                    scope,
                    missionId,
                    status: missionStatus,
                    currentValue: candidate?.currentValue ?? null,
                    targetValue: candidate?.targetValue ?? null
                });
                if (missionStatus === "CLAIMED" || missionStatus === "EXPIRED" || missionStatus === "DISABLED") {
                    continue;
                }
                const quota = this.getActionRewardQuotaFromCounters(progress.counters, category, scope);
                if (!quota.allowed) {
                    this.logger.info("AUTO_MISSION_REWARD_LIMIT_REACHED", {
                        ...ctx,
                        category,
                        scope,
                        used: quota.used,
                        limit: quota.limit,
                        dayKey: quota.counters.dayKey,
                        weekKey: quota.counters.weekKey
                    });
                    continue;
                }
                const targetValue = Number(candidate?.targetValue || 0);
                const localProgress = this.getActionRewardProgressValue(progress.counters, category, scope);
                const serverClaimable = this.isClaimableRegularMission(candidate);
                const readyByLocal = targetValue > 0 && localProgress >= targetValue;
                if (!serverClaimable && !readyByLocal) {
                    this.logger.info("AUTO_MISSION_REWARD_NOT_READY", {
                        ...ctx,
                        category,
                        scope,
                        missionId,
                        status: missionStatus,
                        currentValue: candidate?.currentValue ?? null,
                        targetValue: candidate?.targetValue ?? null,
                        localProgress,
                        serverClaimable
                    });
                    continue;
                }
                const failureField = this.getRegularClaimFailureField(category, scope, Number(missionId));
                if (await this.hasClaimFailure(phone, failureField)) {
                    this.logger.info("AUTO_MISSION_REWARD_CLAIM_FAILED_CACHED", {
                        ...ctx,
                        category,
                        scope,
                        missionId,
                        status: missionStatus
                    });
                    continue;
                }
                const balanceRes = await missionApiService_1.MissionApiService.getPointBalance(accessToken, h, this.proxyAgent);
                const balanceData = balanceRes.data?.data || balanceRes.data || {};
                const dailyPointState = await this.recordDailyPointBalance(phone, balanceData);
                const dailyRemainingPoint = Number(dailyPointState.dailyRemainingPoint ?? 0);
                if (dailyRemainingPoint <= 0) {
                    dailyPointExhausted = true;
                    this.logger.info("AUTO_MISSION_REWARD_SKIPPED_NO_DAILY_POINT", {
                        ...ctx,
                        category,
                        scope,
                        dailyRemainingPoint,
                        balance: balanceData
                    });
                    continue;
                }
                this.logger.info("AUTO_MISSION_REWARD_ATTEMPT_CLAIM", {
                    ...ctx,
                    category,
                    scope,
                    missionId,
                    status: missionStatus,
                    currentValue: candidate?.currentValue ?? null,
                    targetValue: candidate?.targetValue ?? null,
                    localProgress,
                    serverClaimable,
                    dailyRemainingPoint
                });
                const claimed = await this.claimRegularMission(candidate, accessToken, h, ctx, doMission, category, scope);
                if (!claimed) {
                    await this.recordClaimFailure(phone, failureField, {
                        category,
                        scope,
                        missionId,
                        status: missionStatus
                    });
                    planChanged = true;
                    continue;
                }
                const target = Number(candidate?.targetValue || 0);
                const claimedCounters = await this.markActionRewardClaimed(phone, category, scope, target);
                this.logger.info("AUTO_MISSION_REWARD_CLAIMED", {
                    ...ctx,
                    category,
                    scope,
                    missionId,
                    target,
                    counters: claimedCounters
                });
                claimedAny = true;
                planChanged = true;
                const pointAfterClaim = await this.getDailyPointState(phone);
                if (pointAfterClaim && pointAfterClaim.dailyRemainingPoint !== null && Number(pointAfterClaim.dailyRemainingPoint) <= 0) {
                    dailyPointExhausted = true;
                    this.logger.info("AUTO_MISSION_REWARD_STOP_DAILY_POINT_EXHAUSTED", {
                        ...ctx,
                        category,
                        scope,
                        missionId,
                        dailyRemainingPoint: pointAfterClaim.dailyRemainingPoint,
                        dailyEarnedPoint: pointAfterClaim.dailyEarnedPoint,
                        dailyPointLimit: pointAfterClaim.dailyPointLimit
                    });
                }
            }
            if (Object.keys(lastCandidates).length === 0) {
                this.logger.info("AUTO_MISSION_REWARD_NO_CANDIDATE", {
                    ...ctx,
                    category,
                    totalMissions: missions.length
                });
            }
            return { claimedAny, dailyPointExhausted, planChanged };
        }
        catch (e) {
            this.logger.error("HANDLE_ACTION_REWARD_CLAIM_ERROR", {
                ...ctx,
                category,
                err: e.message || String(e)
            });
            return emptyResult;
        }
    }
}
exports.AccountActionRewardService = AccountActionRewardService;
