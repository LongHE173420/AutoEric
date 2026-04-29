import { UserApiService } from "../../api/user/userApiService";
import { MissionApiService } from "../../api/missions/missionApiService";
import { NotificationApiService } from "../../api/notification/notificationApiService";
import { FriendApiService } from "../../api/friend/friendApiService";
import { FeedApiService } from "../../api/feed/feedApiService";
import { ReactionApiService } from "../../api/reaction/reactionApiService";
import { AsyncStore } from "../../storage/asyncStore";
import { Log } from "../../utils/log";

type AppLogger = ReturnType<typeof Log.getLogger>;
type ActionRewardCategory = "REACTION" | "FRIEND" | "POST" | "COMMENT";
type ActionRewardScope = "DAILY" | "WEEKLY";
type ActionRewardCounterField = "reaction" | "friend" | "post" | "comment";
type ActionRewardProgressField = "reactionProgress" | "friendProgress" | "postProgress" | "commentProgress";
type WeeklyActionRewardCounterField = "weeklyReaction" | "weeklyFriend" | "weeklyPost" | "weeklyComment";
type WeeklyActionRewardProgressField = "weeklyReactionProgress" | "weeklyFriendProgress" | "weeklyPostProgress" | "weeklyCommentProgress";
type ActionRewardCounters = {
    dayKey: string;
    weekKey: string;
    reaction: number;
    friend: number;
    post: number;
    comment: number;
    reactionProgress: number;
    friendProgress: number;
    postProgress: number;
    commentProgress: number;
    weeklyReaction: number;
    weeklyFriend: number;
    weeklyPost: number;
    weeklyComment: number;
    weeklyReactionProgress: number;
    weeklyFriendProgress: number;
    weeklyPostProgress: number;
    weeklyCommentProgress: number;
};

export class AccountMissionService {
    private readonly pointBalanceSignatureByAccount = new Map<string, string>();
    private readonly streakTimeZone = "Asia/Ho_Chi_Minh";

    constructor(
        private readonly logger: AppLogger,
        private readonly proxyAgent: any
    ) { }

    private normalizeSearchText(value: any) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .replace(/Đ/g, "D")
            .toLowerCase()
            .trim();
    }

    private getActionRewardStoreKey(phone: string) {
        return `actionRewardCounters:${String(phone || "").trim().toLowerCase()}`;
    }

    private getDailyActionRewardField(category: ActionRewardCategory): ActionRewardCounterField {
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

    private getWeeklyActionRewardField(category: ActionRewardCategory): WeeklyActionRewardCounterField {
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

    private getActionRewardField(category: ActionRewardCategory, scope: ActionRewardScope) {
        return scope === "WEEKLY"
            ? this.getWeeklyActionRewardField(category)
            : this.getDailyActionRewardField(category);
    }

    private getDailyActionRewardProgressField(category: ActionRewardCategory): ActionRewardProgressField {
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

    private getWeeklyActionRewardProgressField(category: ActionRewardCategory): WeeklyActionRewardProgressField {
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

    private getActionRewardProgressField(category: ActionRewardCategory, scope: ActionRewardScope) {
        return scope === "WEEKLY"
            ? this.getWeeklyActionRewardProgressField(category)
            : this.getDailyActionRewardProgressField(category);
    }

    private getActionRewardLimit(category: ActionRewardCategory, scope: ActionRewardScope) {
        switch (category) {
            case "REACTION":
            case "FRIEND":
            case "POST":
            case "COMMENT":
                return 1;
        }
    }

    private getDefaultActionRewardCounters(dayKey: string, weekKey: string): ActionRewardCounters {
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

    private getActionRewardCounters(phone: string, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        const weekKey = this.getWeekKeyInTimeZone(now) || dayKey;
        const key = this.getActionRewardStoreKey(phone);
        const stored = AsyncStore.getItem<ActionRewardCounters>(key);

        if (!stored) {
            return this.getDefaultActionRewardCounters(dayKey, weekKey);
        }

        const sameDay = stored.dayKey === dayKey;
        const sameWeek = stored.weekKey === weekKey;

        return {
            dayKey,
            weekKey,
            reaction: sameDay ? Number(stored.reaction || 0) : 0,
            friend: sameDay ? Number(stored.friend || 0) : 0,
            post: sameDay ? Number(stored.post || 0) : 0,
            comment: sameDay ? Number(stored.comment || 0) : 0,
            reactionProgress: sameDay ? Number(stored.reactionProgress || 0) : 0,
            friendProgress: sameDay ? Number(stored.friendProgress || 0) : 0,
            postProgress: sameDay ? Number(stored.postProgress || 0) : 0,
            commentProgress: sameDay ? Number(stored.commentProgress || 0) : 0,
            weeklyReaction: sameWeek ? Number(stored.weeklyReaction || 0) : 0,
            weeklyFriend: sameWeek ? Number(stored.weeklyFriend || 0) : 0,
            weeklyPost: sameWeek ? Number(stored.weeklyPost || 0) : 0,
            weeklyComment: sameWeek ? Number(stored.weeklyComment || 0) : 0,
            weeklyReactionProgress: sameWeek ? Number(stored.weeklyReactionProgress || 0) : 0,
            weeklyFriendProgress: sameWeek ? Number(stored.weeklyFriendProgress || 0) : 0,
            weeklyPostProgress: sameWeek ? Number(stored.weeklyPostProgress || 0) : 0,
            weeklyCommentProgress: sameWeek ? Number(stored.weeklyCommentProgress || 0) : 0
        };
    }

    private saveActionRewardCounters(phone: string, counters: ActionRewardCounters) {
        AsyncStore.setItem(this.getActionRewardStoreKey(phone), counters);
    }

    private canClaimActionReward(phone: string, category: ActionRewardCategory, scope: ActionRewardScope, now = new Date()) {
        const counters = this.getActionRewardCounters(phone, now);
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

    private markActionRewardProgress(phone: string, category: ActionRewardCategory, now = new Date()) {
        const counters = this.getActionRewardCounters(phone, now);
        const dailyProgressField = this.getActionRewardProgressField(category, "DAILY");
        const weeklyProgressField = this.getActionRewardProgressField(category, "WEEKLY");

        counters[dailyProgressField] = Number(counters[dailyProgressField] || 0) + 1;
        counters[weeklyProgressField] = Number(counters[weeklyProgressField] || 0) + 1;
        this.saveActionRewardCounters(phone, counters);

        return {
            counters,
            dailyProgress: Number(counters[dailyProgressField] || 0),
            weeklyProgress: Number(counters[weeklyProgressField] || 0)
        };
    }

    private markActionRewardClaimed(phone: string, category: ActionRewardCategory, scope: ActionRewardScope, target: number, now = new Date()) {
        const counters = this.getActionRewardCounters(phone, now);
        const field = this.getActionRewardField(category, scope);
        const progressField = this.getActionRewardProgressField(category, scope);

        counters[field] = Number(counters[field] || 0) + 1;
        counters[progressField] = Math.max(0, Number(counters[progressField] || 0) - target);
        this.saveActionRewardCounters(phone, counters);
        return counters;
    }

    private syncActionRewardProgressFromMission(phone: string, category: ActionRewardCategory, scope: ActionRewardScope, mission: any, now = new Date()) {
        const backendCurrentValue = Number(mission?.currentValue);
        if (!Number.isFinite(backendCurrentValue) || backendCurrentValue < 0) return null;

        const counters = this.getActionRewardCounters(phone, now);
        const progressField = this.getActionRewardProgressField(category, scope);
        counters[progressField] = Math.max(
            Number(counters[progressField] || 0),
            Math.floor(backendCurrentValue)
        );
        this.saveActionRewardCounters(phone, counters);
        return counters;
    }

    private isClaimableRegularMission(mission: any) {
        if (!mission || this.isStreakMission(mission)) return false;

        const currentValue = Number(mission?.currentValue || 0);
        const targetValue = Number(mission?.targetValue || 0);
        const status = String(mission?.status || "").toUpperCase();

        return (
            status === "COMPLETED" ||
            status === "DONE" ||
            status === "SUCCESS" ||
            (targetValue > 0 && currentValue >= targetValue)
        ) && status !== "CLAIMED";
    }

    private getMissionActionCategory(mission: any): ActionRewardCategory | null {
        const type = String(mission?.type || "").toUpperCase();
        const actionType = String(mission?.actionType || "").toUpperCase();
        const normalizedName = this.normalizeSearchText(mission?.name);
        const signals = [type, actionType].filter(Boolean).join(" ");

        const matchesReaction =
            signals.includes("REACTION") ||
            signals.includes("LIKE") ||
            signals.includes("EMOTION") ||
            normalizedName.includes("cam xuc") ||
            normalizedName.includes("tha cam xuc") ||
            normalizedName.includes("reaction") ||
            normalizedName.includes("like");

        if (matchesReaction) return "REACTION";

        const matchesFriend =
            signals.includes("FRIEND") ||
            signals.includes("ADD_FRIEND") ||
            signals.includes("SEND_FRIEND") ||
            signals.includes("FRIEND_REQUEST") ||
            normalizedName.includes("ket ban") ||
            normalizedName.includes("friend");

        if (matchesFriend) return "FRIEND";

        const matchesComment =
            signals.includes("COMMENT") ||
            normalizedName.includes("binh luan") ||
            normalizedName.includes("comment");

        if (matchesComment) return "COMMENT";

        const matchesPost =
            (signals.includes("POST") || signals.includes("CREATE_POST") || signals.includes("PUBLISH_POST")) &&
            !signals.includes("REPOST") &&
            !signals.includes("SURF") &&
            !normalizedName.includes("surf") &&
            (normalizedName.includes("dang bai") || normalizedName.includes("post") || normalizedName.includes("bai viet") || normalizedName === "");

        if (matchesPost) return "POST";

        return null;
    }

    private inferMissionScope(mission: any): ActionRewardScope {
        const type = String(mission?.type || "").toUpperCase();
        return type === "WEEKLY" ? "WEEKLY" : "DAILY";
    }

    private isActionRewardMission(mission: any, category: ActionRewardCategory, scope: ActionRewardScope) {
        if (!mission || this.isStreakMission(mission)) return false;

        // Infer scope from mission.type: only "WEEKLY" counts as weekly, everything else is DAILY.
        // This mirrors the same logic used in claimAllMissions so that missions whose
        // type field is the action name (e.g. "REACTION", "COMMENT") are not incorrectly
        // filtered out when scope is "DAILY".
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

    private findActionRewardMission(missions: any[], category: ActionRewardCategory, scope: ActionRewardScope) {
        return [...(Array.isArray(missions) ? missions : [])]
            .filter((mission) => this.isActionRewardMission(mission, category, scope))
            .sort((a, b) => {
                return Number(a?.missionId || a?.id || 0) - Number(b?.missionId || b?.id || 0);
            })
            .at(0);
    }

    private summarizeMissionsForLog(missions: any[]) {
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

    private async claimRegularMission(
        mission: any,
        accessToken: string,
        h: any,
        ctx: any,
        doMission: Function,
        category: ActionRewardCategory,
        scope: ActionRewardScope
    ) {
        const missionId = Number(mission?.missionId || mission?.id || 0);
        if (!missionId) return false;

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

        const result = await doMission(
            `ClaimMission_${scope}_${category}_${missionId}`,
            () => MissionApiService.claimMissionReward(accessToken, missionId, h, this.proxyAgent),
            ctx
        );

        return result !== null;
    }

    async handleActionRewardClaim(
        accessToken: string,
        h: any,
        ctx: any,
        doMission: Function,
        category: ActionRewardCategory
    ) {
        try {
            const phone = String(ctx?.phone || "").trim().toLowerCase();
            if (!phone) return false;

            // Tăng local progress counter (dùng để track claim limit mỗi ngày)
            this.markActionRewardProgress(phone, category);

            let claimedAny = false;
            const lastCandidates: Record<string, any> = {};

            // Fetch missions một lần duy nhất
            const res = await MissionApiService.getCurrentUserMissions(accessToken, h, this.proxyAgent);
            const missions = Array.isArray(res.data?.data || res.data) ? (res.data?.data || res.data) : [];

            for (const scope of (["DAILY", "WEEKLY"] as ActionRewardScope[])) {
                const candidate = this.findActionRewardMission(missions, category, scope);
                if (!candidate) continue;

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

                // Bỏ qua nếu đã claimed/expired
                if (missionStatus === "CLAIMED" || missionStatus === "EXPIRED" || missionStatus === "DISABLED") {
                    continue;
                }

                // Kiểm tra quota local (tránh spam claim)
                const quota = this.canClaimActionReward(phone, category, scope);
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

                // Kiểm tra daily point balance
                const balanceRes = await MissionApiService.getPointBalance(accessToken, h, this.proxyAgent);
                const balanceData = balanceRes.data?.data || balanceRes.data || {};
                const dailyRemainingPoint = Number(balanceData?.dailyRemainingPoint ?? balanceData?.remainingPoint ?? 0);

                if (dailyRemainingPoint <= 0) {
                    this.logger.info("AUTO_MISSION_REWARD_SKIPPED_NO_DAILY_POINT", {
                        ...ctx,
                        category,
                        scope,
                        dailyRemainingPoint,
                        balance: balanceData
                    });
                    continue;
                }

                // Claim ngay - backend tự quyết định dựa trên tiến trình nội bộ của nó.
                // Backend không expose currentValue realtime nên không thể chờ nó update.
                // Nếu chưa đủ điều kiện → backend trả 400/409 → doMission bỏ qua lặng lẽ.
                // Nếu đủ điều kiện → backend trả success → điểm được cộng.
                this.logger.info("AUTO_MISSION_REWARD_ATTEMPT_CLAIM", {
                    ...ctx,
                    category,
                    scope,
                    missionId,
                    status: missionStatus,
                    currentValue: candidate?.currentValue ?? null,
                    targetValue: candidate?.targetValue ?? null,
                    dailyRemainingPoint
                });

                const claimed = await this.claimRegularMission(candidate, accessToken, h, ctx, doMission, category, scope);
                if (!claimed) {
                    continue;
                }

                const target = Number(candidate?.targetValue || 0);
                const claimedCounters = this.markActionRewardClaimed(phone, category, scope, target);
                this.logger.info("AUTO_MISSION_REWARD_CLAIMED", {
                    ...ctx,
                    category,
                    scope,
                    missionId,
                    target,
                    counters: claimedCounters
                });
                claimedAny = true;
            }

            if (Object.keys(lastCandidates).length === 0) {
                this.logger.info("AUTO_MISSION_REWARD_NO_CANDIDATE", {
                    ...ctx,
                    category,
                    totalMissions: missions.length
                });
            }

            return claimedAny;
        } catch (e: any) {
            this.logger.error("HANDLE_ACTION_REWARD_CLAIM_ERROR", {
                ...ctx,
                category,
                err: e.message || String(e)
            });
            return false;
        }
    }

    async handleProfileAndSocial(accessToken: string, h: any, ctx: any, doMission: Function) {
        try {
            await doMission("ProfileMe", () => UserApiService.getProfileMe(accessToken, h, this.proxyAgent), ctx);
            await doMission("MyFriends", () => FriendApiService.getMyFriends(accessToken, h, this.proxyAgent), ctx);
            await doMission("Notifications", () => NotificationApiService.listNotifications(accessToken, h, 10, 0, this.proxyAgent), ctx);
        } catch (e: any) {
            this.logger.error("HANDLE_PROFILE_AND_SOCIAL_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }

    async handleRewardClaiming(accessToken: string, h: any, ctx: any, doMission: Function) {
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
        } catch (e: any) {
            this.logger.error("HANDLE_REWARD_CLAIMING_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }

    private summarizeMissionProgress(missions: any[]) {
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

    private getMissionStatusSignature(summary: any) {
        try {
            return JSON.stringify(summary);
        } catch (e: any) {
            return `UNSERIALIZABLE:${e.message || String(e)}`;
        }
    }

    private getPointBalanceSummary(balanceData: any, dailyRemainingPoint: any, dailyEarnedPoint: any, dailyPointLimit: any) {
        return {
            balance: balanceData?.balance ?? null,
            dailyRemainingPoint,
            dailyEarnedPoint,
            dailyPointLimit
        };
    }

    private isStreakMission(mission: any) {
        const type = String(mission?.type || "").toUpperCase();
        const actionType = String(mission?.actionType || "").toUpperCase();
        const name = String(mission?.name || "").toLowerCase();
        const missionId = Number(mission?.missionId || mission?.id || 0);

        return (
            type === "STREAK_LOGIN" ||
            type === "STREAK" ||
            actionType === "LOGIN" ||
            missionId === 18 ||
            name.includes("chuỗi")
        );
    }

    private getDateKeyInTimeZone(input: number | Date, timeZone = this.streakTimeZone) {
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

    private getWeekKeyInTimeZone(input: number | Date, timeZone = this.streakTimeZone) {
        const dateKey = this.getDateKeyInTimeZone(input, timeZone);
        if (!dateKey) return null;

        const [year, month, day] = dateKey.split("-").map((part) => Number(part));
        if (!year || !month || !day) return null;

        const localDateUtc = Date.UTC(year, month - 1, day);
        const dayOfWeek = new Date(localDateUtc).getUTCDay();
        const daysSinceMonday = (dayOfWeek + 6) % 7;
        const monday = new Date(localDateUtc - daysSinceMonday * 24 * 60 * 60 * 1000);
        const mondayYear = monday.getUTCFullYear();
        const mondayMonth = String(monday.getUTCMonth() + 1).padStart(2, "0");
        const mondayDay = String(monday.getUTCDate()).padStart(2, "0");

        return `${mondayYear}-${mondayMonth}-${mondayDay}`;
    }

    private getStreakClaimState(mission: any, now = new Date()) {
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

    private async processMissionsAndRewards(
        accessToken: string,
        h: any,
        ctx: any,
        doMission: Function,
        options?: {
            logMissionFetch?: boolean;
            logMissionDetail?: boolean;
            missionDetailPhase?: string;
        }
    ): Promise<{ missions: any[]; }> {
        try {
            const logMissionFetch = options?.logMissionFetch ?? true;
            const logMissionDetail = options?.logMissionDetail ?? true;
            const missionDetailPhase = options?.missionDetailPhase ?? null;

            // 1. Check daily point balance FIRST
            const balanceRes = await MissionApiService.getPointBalance(accessToken, h, this.proxyAgent);
            const balanceData = balanceRes.data?.data || balanceRes.data;
            const dailyRemainingPoint = balanceData?.dailyRemainingPoint ?? balanceData?.remainingPoint ?? null;
            const dailyEarnedPoint = balanceData?.dailyEarnedPoint ?? null;
            const dailyPointLimit =
                balanceData?.maxDailyPoint ??
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
            const res = await MissionApiService.getCurrentUserMissions(accessToken, h, this.proxyAgent);
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
                    missions: this.summarizeMissionsForLog(missions)
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

            // 3. Claim all eligible missions
            await this.claimAllMissions(missions, accessToken, h, ctx, doMission, {
                logMissionDetail,
                missionDetailPhase
            });
            return { missions: Array.isArray(missions) ? missions : [] };
        } catch (e: any) {
            this.logger.error("MISSION_PROCESSING_ERROR", { ...ctx, err: e.message || String(e) });
            return { missions: [] };
        }
    }

    async handleActivityGeneration(accessToken: string, h: any, ctx: any, doMission: Function) {
        try {
            await doMission("BackgroundColor", () => FeedApiService.getFeedBackgroundColor(accessToken, h, this.proxyAgent), ctx);
            await doMission("ReactionList", () => ReactionApiService.listReactions(accessToken, h, 10, 0, this.proxyAgent), ctx);
        } catch (e: any) {
            this.logger.error("HANDLE_ACTIVITY_GENERATION_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }

    private async claimAllMissions(
        missions: any[],
        accessToken: string,
        h: any,
        ctx: any,
        doMission: Function,
        options?: {
            logMissionDetail?: boolean;
            missionDetailPhase?: string | null;
        }
    ) {
        try {
            const logMissionDetail = options?.logMissionDetail ?? true;

            for (const m of missions) {
                const missionId = m.missionId || m.id;
                if (!missionId) continue;

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
                        await doMission(`ClaimStreak_${missionId}`, () => MissionApiService.claimStreakMissionReward(accessToken, missionId, nextMilestone, h, this.proxyAgent), ctx);
                    } else if (logMissionDetail) {
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

                if (this.isClaimableRegularMission(m)) {
                    const category = this.getMissionActionCategory(m);
                    const scope = String(m?.type || "").toUpperCase() === "WEEKLY" ? "WEEKLY" : "DAILY";

                    this.logger.info("MISSION_REWARD_CLAIM_REQUEST", {
                        ...ctx,
                        claimType: "REGULAR",
                        category,
                        scope,
                        missionId,
                        name: m.name || null,
                        type: m.type || null,
                        actionType: m.actionType || null,
                        status: m.status || null,
                        cv: m.currentValue ?? 0,
                        tv: m.targetValue ?? 0
                    });

                    await doMission(
                        `ClaimMission_${scope}_${missionId}`,
                        () => MissionApiService.claimMissionReward(accessToken, Number(missionId), h, this.proxyAgent),
                        ctx
                    );

                    const phone = String(ctx?.phone || "").trim().toLowerCase();
                    if (phone && category) {
                        this.markActionRewardClaimed(
                            phone,
                            category,
                            scope as ActionRewardScope,
                            Number(m?.targetValue || 0)
                        );
                    }
                    continue;
                }

                if (logMissionDetail) {
                    this.logger.debug(`SKIP_NON_STREAK_MISSION_IN_REWARD_STAGE_${missionId}`, {
                        ...ctx,
                        missionId,
                        category: this.getMissionActionCategory(m),
                        type: m.type || null,
                        actionType: m.actionType || null,
                        status: m.status || null
                    });
                }
            }
        } catch (e: any) {
            this.logger.error("CLAIM_ALL_MISSIONS_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
