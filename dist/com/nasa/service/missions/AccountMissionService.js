"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountMissionService = void 0;
const userApiService_1 = require("../../api/user/userApiService");
const missionApiService_1 = require("../../api/missions/missionApiService");
const notificationApiService_1 = require("../../api/notification/notificationApiService");
const friendApiService_1 = require("../../api/friend/friendApiService");
const feedApiService_1 = require("../../api/feed/feedApiService");
const reactionApiService_1 = require("../../api/reaction/reactionApiService");
class AccountMissionService {
    constructor(logger, proxyAgent) {
        this.logger = logger;
        this.proxyAgent = proxyAgent;
        this.pointBalanceSignatureByAccount = new Map();
        this.streakTimeZone = "Asia/Ho_Chi_Minh";
    }
    async handleProfileAndSocial(accessToken, h, ctx, doMission) {
        try {
            await doMission("ProfileMe", () => userApiService_1.UserApiService.getProfileMe(accessToken, h, this.proxyAgent), ctx);
            await doMission("MyFriends", () => friendApiService_1.FriendApiService.getMyFriends(accessToken, h, this.proxyAgent), ctx);
            await doMission("Notifications", () => notificationApiService_1.NotificationApiService.listNotifications(accessToken, h, 10, 0, this.proxyAgent), ctx);
        }
        catch (e) {
            this.logger.error("HANDLE_PROFILE_AND_SOCIAL_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
    async handleRewardClaiming(accessToken, h, ctx, doMission) {
        try {
            await this.processMissionsAndRewards(accessToken, h, ctx, doMission, {
                logMissionFetch: true,
                logMissionDetail: false,
                missionDetailPhase: "INITIAL"
            });
            const pollDelaysMs = [0, 5000, 10000];
            for (let attemptIndex = 0; attemptIndex < pollDelaysMs.length; attemptIndex++) {
                const delayMs = pollDelaysMs[attemptIndex];
                if (delayMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                }
                const result = await this.processMissionsAndRewards(accessToken, h, ctx, doMission, {
                    logMissionFetch: attemptIndex === 0,
                    logMissionDetail: attemptIndex === 0,
                    missionDetailPhase: attemptIndex === 0 ? "RECHECK" : undefined
                });
                const summary = this.summarizeMissionProgress(result.missions);
                if (summary.anyNonStreakProgress || summary.claimableNonStreakCount > 0) {
                    return;
                }
            }
        }
        catch (e) {
            this.logger.error("HANDLE_REWARD_CLAIMING_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
    summarizeMissionProgress(missions) {
        const nonStreakMissions = Array.isArray(missions)
            ? missions.filter((mission) => {
                const type = String(mission?.type || "").toUpperCase();
                return type !== "STREAK_LOGIN" && type !== "STREAK";
            })
            : [];
        const progressedNonStreakMissions = nonStreakMissions.filter((mission) => {
            const currentValue = Number(mission?.currentValue || 0);
            const targetValue = Number(mission?.targetValue || 0);
            const status = String(mission?.status || "").toUpperCase();
            return currentValue > 0 || status === "COMPLETED" || status === "DONE" || (targetValue > 0 && currentValue >= targetValue);
        });
        const claimableNonStreakMissions = nonStreakMissions.filter((mission) => {
            const currentValue = Number(mission?.currentValue || 0);
            const targetValue = Number(mission?.targetValue || 0);
            const status = String(mission?.status || "").toUpperCase();
            return (status === "COMPLETED" || status === "DONE" || (targetValue > 0 && currentValue >= targetValue)) && status !== "CLAIMED";
        });
        return {
            nonStreakMissionCount: nonStreakMissions.length,
            progressedNonStreakCount: progressedNonStreakMissions.length,
            claimableNonStreakCount: claimableNonStreakMissions.length,
            anyNonStreakProgress: progressedNonStreakMissions.length > 0,
            progressedMissionIds: progressedNonStreakMissions.map((mission) => mission?.missionId || mission?.id).filter(Boolean)
        };
    }
    getMissionStatusSignature(summary) {
        try {
            return JSON.stringify(summary);
        }
        catch (e) {
            return `UNSERIALIZABLE:${e.message || String(e)}`;
        }
    }
    getPointBalanceSummary(balanceData, dailyRemainingPoint, dailyEarnedPoint, dailyPointLimit) {
        return {
            balance: balanceData?.balance ?? null,
            dailyRemainingPoint,
            dailyEarnedPoint,
            dailyPointLimit
        };
    }
    isStreakMission(mission) {
        const type = String(mission?.type || "").toUpperCase();
        const actionType = String(mission?.actionType || "").toUpperCase();
        const name = String(mission?.name || "").toLowerCase();
        const missionId = Number(mission?.missionId || mission?.id || 0);
        return (type === "STREAK_LOGIN" ||
            type === "STREAK" ||
            actionType === "LOGIN" ||
            missionId === 18 ||
            name.includes("chuỗi"));
    }
    getDateKeyInTimeZone(input, timeZone = this.streakTimeZone) {
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
    getStreakClaimState(mission, now = new Date()) {
        const lastDateTs = Number(mission?.lastStreakDate || 0);
        const todayKey = this.getDateKeyInTimeZone(now);
        const lastClaimDateKey = lastDateTs > 0 ? this.getDateKeyInTimeZone(lastDateTs) : null;
        const isClaimed = String(mission?.status || "").toUpperCase() === "CLAIMED";
        const alreadyClaimedToday = Boolean(lastClaimDateKey && todayKey && lastClaimDateKey === todayKey);
        return {
            isClaimed,
            lastDateTs,
            lastClaimDateKey,
            todayKey,
            alreadyClaimedToday,
            canClaimToday: Boolean(todayKey) && !isClaimed && !alreadyClaimedToday
        };
    }
    async processMissionsAndRewards(accessToken, h, ctx, doMission, options) {
        try {
            const logMissionFetch = options?.logMissionFetch ?? true;
            const logMissionDetail = options?.logMissionDetail ?? true;
            const missionDetailPhase = options?.missionDetailPhase ?? null;
            // 1. Check daily point balance FIRST
            const balanceRes = await missionApiService_1.MissionApiService.getPointBalance(accessToken, h, this.proxyAgent);
            const balanceData = balanceRes.data?.data || balanceRes.data;
            const dailyRemainingPoint = balanceData?.dailyRemainingPoint ?? balanceData?.remainingPoint ?? null;
            const dailyEarnedPoint = balanceData?.dailyEarnedPoint ?? null;
            const dailyPointLimit = balanceData?.maxDailyPoint ??
                (typeof dailyRemainingPoint === "number" && typeof dailyEarnedPoint === "number"
                    ? dailyRemainingPoint + dailyEarnedPoint
                    : null);
            const pointBalanceSummary = this.getPointBalanceSummary(balanceData, dailyRemainingPoint, dailyEarnedPoint, dailyPointLimit);
            const pointBalanceSignature = this.getMissionStatusSignature(pointBalanceSummary);
            const pointBalanceLogKey = String(ctx?.phone || ctx?.row || "UNKNOWN");
            const previousPointBalanceSignature = this.pointBalanceSignatureByAccount.get(pointBalanceLogKey);
            if (previousPointBalanceSignature !== pointBalanceSignature) {
                this.logger.info("OK: PointBalance", {
                    ...ctx,
                    balance: balanceData,
                    dailyRemainingPoint,
                    dailyEarnedPoint,
                    dailyPointLimit
                });
                this.pointBalanceSignatureByAccount.set(pointBalanceLogKey, pointBalanceSignature);
            }
            if (dailyRemainingPoint !== null && dailyRemainingPoint <= 0) {
                this.logger.info("DAILY_LIMIT_REACHED_BUT_STILL_CHECKING_MISSIONS", {
                    ...ctx,
                    dailyRemainingPoint,
                    dailyEarnedPoint,
                    dailyPointLimit
                });
                // We DO NOT return here, instead allow the bot to claim already completed missions/check-ins.
            }
            // 2. Get mission list
            const res = await missionApiService_1.MissionApiService.getCurrentUserMissions(accessToken, h, this.proxyAgent);
            if (logMissionFetch) {
                this.logger.info("OK: Missions", ctx);
                this.logger.info("MISSION_LIST_FETCHED", {
                    ...ctx,
                    phase: missionDetailPhase,
                    missionCount: Array.isArray(res.data?.data || res.data) ? (res.data?.data || res.data).length : 0
                });
            }
            const missions = res.data?.data || res.data || [];
            if (logMissionDetail) {
                const streakMission = Array.isArray(missions)
                    ? missions.find((mission) => Number(mission?.missionId || mission?.id || 0) === 18 || String(mission?.actionType || "").toUpperCase() === "LOGIN")
                    : null;
                if (streakMission) {
                    this.logger.debug("MISSION_18_RAW", {
                        ...ctx,
                        phase: missionDetailPhase,
                        mission: {
                            missionId: streakMission?.missionId || streakMission?.id || null,
                            name: streakMission?.name || null,
                            type: streakMission?.type || null,
                            actionType: streakMission?.actionType || null,
                            status: streakMission?.status || null,
                            currentValue: streakMission?.currentValue ?? null,
                            targetValue: streakMission?.targetValue ?? null,
                            lastStreakDate: streakMission?.lastStreakDate ?? null
                        }
                    });
                }
            }
            // 3. Claim all eligible missions
            await this.claimAllMissions(missions, accessToken, h, ctx, doMission, {
                logMissionDetail,
                missionDetailPhase
            });
            return { missions: Array.isArray(missions) ? missions : [] };
        }
        catch (e) {
            this.logger.error("MISSION_PROCESSING_ERROR", { ...ctx, err: e.message || String(e) });
            return { missions: [] };
        }
    }
    async handleActivityGeneration(accessToken, h, ctx, doMission) {
        try {
            await doMission("BackgroundColor", () => feedApiService_1.FeedApiService.getFeedBackgroundColor(accessToken, h, this.proxyAgent), ctx);
            await doMission("ReactionList", () => reactionApiService_1.ReactionApiService.listReactions(accessToken, h, 10, 0, this.proxyAgent), ctx);
        }
        catch (e) {
            this.logger.error("HANDLE_ACTIVITY_GENERATION_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
    async claimAllMissions(missions, accessToken, h, ctx, doMission, options) {
        try {
            const logMissionDetail = options?.logMissionDetail ?? true;
            for (const m of missions) {
                const missionId = m.missionId || m.id;
                if (!missionId)
                    continue;
                const isStreak = this.isStreakMission(m);
                if (isStreak) {
                    const cv = m.currentValue ?? 0;
                    const nextMilestone = cv + 1;
                    const streakClaimState = this.getStreakClaimState(m);
                    if (streakClaimState.canClaimToday) {
                        this.logger.info("STREAK_MISSION_REWARD_CLAIM_REQUEST", {
                            ...ctx,
                            claimType: "STREAK",
                            missionId,
                            name: m.name || null,
                            cv,
                            nextMilestone,
                            tv: m.targetValue ?? 0,
                            todayKey: streakClaimState.todayKey,
                            lastClaimDateKey: streakClaimState.lastClaimDateKey,
                            timeZone: this.streakTimeZone
                        });
                        await doMission(`ClaimStreak_${missionId}`, () => missionApiService_1.MissionApiService.claimStreakMissionReward(accessToken, missionId, nextMilestone, h, this.proxyAgent), ctx);
                    }
                    else if (logMissionDetail) {
                        this.logger.debug(`SKIP_STREAK_MISSION_${missionId}`, {
                            ...ctx,
                            name: m.name || null,
                            type: m.type || null,
                            actionType: m.actionType || null,
                            status: m.status || null,
                            isClaimed: streakClaimState.isClaimed,
                            alreadyClaimedToday: streakClaimState.alreadyClaimedToday,
                            cv,
                            tv: m.targetValue ?? 0,
                            lastStreakDate: m.lastStreakDate ?? null,
                            lastClaimDateKey: streakClaimState.lastClaimDateKey,
                            todayKey: streakClaimState.todayKey,
                            timeZone: this.streakTimeZone
                        });
                    }
                    continue;
                }
            }
        }
        catch (e) {
            this.logger.error("CLAIM_ALL_MISSIONS_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
exports.AccountMissionService = AccountMissionService;
