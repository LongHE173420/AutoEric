"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountMissionRewardService = void 0;
const missionApiService_1 = require("../../api/missions/missionApiService");
class AccountMissionRewardService {
    constructor(logger, proxyAgent, actionRewardService) {
        this.logger = logger;
        this.proxyAgent = proxyAgent;
        this.actionRewardService = actionRewardService;
        this.pointBalanceSignatureByAccount = new Map();
        this.streakTimeZone = "Asia/Ho_Chi_Minh";
    }
    async handleRewardClaiming(accessToken, h, ctx, doMission) {
        try {
            const initialResult = await this.processMissionsAndRewards(accessToken, h, ctx, doMission, {
                logMissionFetch: true,
                logMissionDetail: false,
                missionDetailPhase: "INITIAL"
            });
            if (initialResult.dailyClaimLimitReached) {
                return;
            }
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
                if (result.dailyClaimLimitReached) {
                    return;
                }
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
            name.includes("chu"));
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
            const phone = String(ctx?.phone || "").trim().toLowerCase();
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
            const dailyClaimLimitReached = dailyRemainingPoint !== null && Number(dailyRemainingPoint) <= 0;
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
            if (phone) {
                this.actionRewardService.recordDailyPointBalance(phone, balanceData);
            }
            if (dailyClaimLimitReached) {
                this.logger.info("DAILY_LIMIT_REACHED_SKIP_CLAIMS", {
                    ...ctx,
                    dailyRemainingPoint,
                    dailyEarnedPoint,
                    dailyPointLimit
                });
            }
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
                this.logger.debug("MISSION_LIST_DETAIL", {
                    ...ctx,
                    phase: missionDetailPhase,
                    missions: this.actionRewardService.summarizeMissionsForLog(missions)
                });
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
            await this.claimAllMissions(missions, accessToken, h, ctx, doMission, logMissionDetail, dailyClaimLimitReached);
            return { missions: Array.isArray(missions) ? missions : [], dailyClaimLimitReached };
        }
        catch (e) {
            this.logger.error("MISSION_PROCESSING_ERROR", { ...ctx, err: e.message || String(e) });
            return { missions: [], dailyClaimLimitReached: false };
        }
    }
    async claimAllMissions(missions, accessToken, h, ctx, doMission, logMissionDetail, dailyClaimLimitReached) {
        try {
            for (const mission of missions) {
                const missionId = mission.missionId || mission.id;
                if (!missionId)
                    continue;
                if (dailyClaimLimitReached) {
                    if (logMissionDetail && (this.isStreakMission(mission) || this.actionRewardService.isClaimableRegularMission(mission))) {
                        this.logger.debug(`SKIP_MISSION_CLAIM_DAILY_LIMIT_${missionId}`, {
                            ...ctx,
                            missionId,
                            name: mission.name || null,
                            type: mission.type || null,
                            actionType: mission.actionType || null,
                            status: mission.status || null
                        });
                    }
                    continue;
                }
                if (this.isStreakMission(mission)) {
                    const currentValue = mission.currentValue ?? 0;
                    const nextMilestone = currentValue + 1;
                    const streakClaimState = this.getStreakClaimState(mission);
                    if (streakClaimState.canClaimToday) {
                        this.logger.info("STREAK_MISSION_REWARD_CLAIM_REQUEST", {
                            ...ctx,
                            claimType: "STREAK",
                            missionId,
                            name: mission.name || null,
                            cv: currentValue,
                            nextMilestone,
                            tv: mission.targetValue ?? 0,
                            todayKey: streakClaimState.todayKey,
                            lastClaimDateKey: streakClaimState.lastClaimDateKey,
                            timeZone: this.streakTimeZone
                        });
                        await doMission(`ClaimStreak_${missionId}`, () => missionApiService_1.MissionApiService.claimStreakMissionReward(accessToken, missionId, nextMilestone, h, this.proxyAgent), ctx);
                    }
                    else if (logMissionDetail) {
                        this.logger.debug(`SKIP_STREAK_MISSION_${missionId}`, {
                            ...ctx,
                            name: mission.name || null,
                            type: mission.type || null,
                            actionType: mission.actionType || null,
                            status: mission.status || null,
                            isClaimed: streakClaimState.isClaimed,
                            alreadyClaimedToday: streakClaimState.alreadyClaimedToday,
                            cv: currentValue,
                            tv: mission.targetValue ?? 0,
                            lastStreakDate: mission.lastStreakDate ?? null,
                            lastClaimDateKey: streakClaimState.lastClaimDateKey,
                            todayKey: streakClaimState.todayKey,
                            timeZone: this.streakTimeZone
                        });
                    }
                    continue;
                }
                if (this.actionRewardService.isClaimableRegularMission(mission)) {
                    const category = this.actionRewardService.getMissionActionCategory(mission);
                    const scope = this.actionRewardService.inferMissionScope(mission);
                    this.logger.info("MISSION_REWARD_CLAIM_REQUEST", {
                        ...ctx,
                        claimType: "REGULAR",
                        category,
                        scope,
                        missionId,
                        name: mission.name || null,
                        type: mission.type || null,
                        actionType: mission.actionType || null,
                        status: mission.status || null,
                        cv: mission.currentValue ?? 0,
                        tv: mission.targetValue ?? 0
                    });
                    await doMission(`ClaimMission_${scope}_${missionId}`, () => missionApiService_1.MissionApiService.claimMissionReward(accessToken, Number(missionId), h, this.proxyAgent), ctx);
                    const phone = String(ctx?.phone || "").trim().toLowerCase();
                    if (phone && category) {
                        this.actionRewardService.markActionRewardClaimed(phone, category, scope, Number(mission?.targetValue || 0));
                    }
                    continue;
                }
                if (logMissionDetail) {
                    this.logger.debug(`SKIP_NON_STREAK_MISSION_IN_REWARD_STAGE_${missionId}`, {
                        ...ctx,
                        missionId,
                        category: this.actionRewardService.getMissionActionCategory(mission),
                        type: mission.type || null,
                        actionType: mission.actionType || null,
                        status: mission.status || null
                    });
                }
            }
        }
        catch (e) {
            this.logger.error("CLAIM_ALL_MISSIONS_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
exports.AccountMissionRewardService = AccountMissionRewardService;
