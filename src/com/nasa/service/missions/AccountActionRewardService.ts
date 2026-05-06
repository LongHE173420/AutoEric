import { MissionApiService } from "../../api/missions/missionApiService";
import { AsyncStore } from "../../storage/asyncStore";
import { Log } from "../../utils/log";

type AppLogger = ReturnType<typeof Log.getLogger>;

export type ActionRewardCategory = "REACTION" | "FRIEND" | "POST" | "COMMENT";
export type ActionRewardScope = "DAILY" | "WEEKLY";
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

type DailyPointState = {
    dayKey: string;
    dailyRemainingPoint: number | null;
    dailyEarnedPoint: number | null;
    dailyPointLimit: number | null;
};

export class AccountActionRewardService {
    private readonly timeZone = "Asia/Ho_Chi_Minh";

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

    private getDateKeyInTimeZone(input: number | Date, timeZone = this.timeZone) {
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

    private getWeekKeyInTimeZone(input: number | Date, timeZone = this.timeZone) {
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

    private isStreakMission(mission: any) {
        const type = String(mission?.type || "").toUpperCase();
        const actionType = String(mission?.actionType || "").toUpperCase();
        const normalizedName = this.normalizeSearchText(mission?.name);
        const missionId = Number(mission?.missionId || mission?.id || 0);

        return (
            type === "STREAK_LOGIN" ||
            type === "STREAK" ||
            actionType === "LOGIN" ||
            missionId === 18 ||
            normalizedName.includes("chuoi")
        );
    }

    private getActionRewardStoreKey(phone: string) {
        return `actionRewardCounters:${String(phone || "").trim().toLowerCase()}`;
    }

    private getDailyPointStateStoreKey(phone: string) {
        return `dailyPointState:${String(phone || "").trim().toLowerCase()}`;
    }

    private getDailyPointState(phone: string, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        const stored = AsyncStore.getItem<DailyPointState>(this.getDailyPointStateStoreKey(phone));

        if (!stored || stored.dayKey !== dayKey) {
            return null;
        }

        return stored;
    }

    private saveDailyPointState(phone: string, state: DailyPointState) {
        AsyncStore.setItem(this.getDailyPointStateStoreKey(phone), state);
    }

    recordDailyPointBalance(phone: string, balanceData: any, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        const dailyRemainingPointRaw = balanceData?.dailyRemainingPoint ?? balanceData?.remainingPoint;
        const dailyEarnedPointRaw = balanceData?.dailyEarnedPoint ?? null;
        const dailyRemainingPoint =
            dailyRemainingPointRaw === null || dailyRemainingPointRaw === undefined
                ? null
                : Number(dailyRemainingPointRaw);
        const dailyEarnedPoint =
            dailyEarnedPointRaw === null || dailyEarnedPointRaw === undefined
                ? null
                : Number(dailyEarnedPointRaw);
        const dailyPointLimit =
            balanceData?.maxDailyPoint !== null && balanceData?.maxDailyPoint !== undefined
                ? Number(balanceData.maxDailyPoint)
                : (dailyRemainingPoint !== null && dailyEarnedPoint !== null
                    ? dailyRemainingPoint + dailyEarnedPoint
                    : null);

        const state: DailyPointState = {
            dayKey,
            dailyRemainingPoint,
            dailyEarnedPoint,
            dailyPointLimit
        };

        this.saveDailyPointState(phone, state);
        return state;
    }

    getCachedDailyPointSummary(phone: string, now = new Date()) {
        const state = this.getDailyPointState(phone, now);
        return state ? { ...state } : null;
    }

    private consumeCachedDailyPoint(phone: string, now = new Date()) {
        const current = this.getDailyPointState(phone, now);
        if (!current) return null;

        const next: DailyPointState = {
            ...current,
            dailyRemainingPoint: current.dailyRemainingPoint === null
                ? null
                : Math.max(0, current.dailyRemainingPoint - 1),
            dailyEarnedPoint: current.dailyEarnedPoint === null
                ? null
                : current.dailyEarnedPoint + 1
        };

        this.saveDailyPointState(phone, next);
        return next;
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

    markActionRewardClaimed(phone: string, category: ActionRewardCategory, scope: ActionRewardScope, target: number, now = new Date()) {
        const counters = this.getActionRewardCounters(phone, now);
        const field = this.getActionRewardField(category, scope);
        const progressField = this.getActionRewardProgressField(category, scope);

        counters[field] = Number(counters[field] || 0) + 1;
        counters[progressField] = Math.max(0, Number(counters[progressField] || 0) - target);
        this.saveActionRewardCounters(phone, counters);
        this.consumeCachedDailyPoint(phone, now);
        return counters;
    }

    isClaimableRegularMission(mission: any) {
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

    getMissionActionCategory(mission: any): ActionRewardCategory | null {
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

    inferMissionScope(mission: any): ActionRewardScope {
        const type = String(mission?.type || "").toUpperCase();
        return type === "WEEKLY" ? "WEEKLY" : "DAILY";
    }

    private isActionRewardMission(mission: any, category: ActionRewardCategory, scope: ActionRewardScope) {
        if (!mission || this.isStreakMission(mission)) return false;

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
            .sort((a, b) => Number(a?.missionId || a?.id || 0) - Number(b?.missionId || b?.id || 0))
            .at(0);
    }

    summarizeMissionsForLog(missions: any[]) {
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

            this.markActionRewardProgress(phone, category);

            const cachedDailyPointState = this.getDailyPointState(phone);
            if (cachedDailyPointState && cachedDailyPointState.dailyRemainingPoint !== null && cachedDailyPointState.dailyRemainingPoint <= 0) {
                this.logger.info("AUTO_MISSION_REWARD_SKIPPED_CACHED_NO_DAILY_POINT", {
                    ...ctx,
                    category,
                    dailyRemainingPoint: cachedDailyPointState.dailyRemainingPoint,
                    dailyEarnedPoint: cachedDailyPointState.dailyEarnedPoint,
                    dailyPointLimit: cachedDailyPointState.dailyPointLimit,
                    dayKey: cachedDailyPointState.dayKey
                });
                return false;
            }

            let claimedAny = false;
            const lastCandidates: Record<string, any> = {};
            const res = await MissionApiService.getCurrentUserMissions(accessToken, h, this.proxyAgent);
            const missions = Array.isArray(res.data?.data || res.data) ? (res.data?.data || res.data) : [];

            for (const scope of ["DAILY", "WEEKLY"] as ActionRewardScope[]) {
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

                if (missionStatus === "CLAIMED" || missionStatus === "EXPIRED" || missionStatus === "DISABLED") {
                    continue;
                }

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

                const balanceRes = await MissionApiService.getPointBalance(accessToken, h, this.proxyAgent);
                const balanceData = balanceRes.data?.data || balanceRes.data || {};
                const dailyPointState = this.recordDailyPointBalance(phone, balanceData);
                const dailyRemainingPoint = Number(dailyPointState.dailyRemainingPoint ?? 0);

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
}
