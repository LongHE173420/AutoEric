import { MissionApiService } from "../../api/missions/missionApiService";
import { DailyPointStateRecord, getSharedActionRewardStateStore } from "../../storage/actionRewardStateStore";
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

type DailyPointState = DailyPointStateRecord;

export type ActionRewardClaimResult = {
    claimedAny: boolean;
    dailyPointExhausted: boolean;
    planChanged?: boolean;
};

export type ActionRewardPlan = {
    shouldDoAction: boolean;
    reason?: "NO_DAILY_POINT" | "NO_ACTIVE_MISSION" | "ALL_SCOPES_CLAIMED";
    activeScopes: ActionRewardScope[];
    dailyPointState?: DailyPointState | null;
    dailyPointExhausted?: boolean;
};

export class AccountActionRewardService {
    private readonly timeZone = "Asia/Ho_Chi_Minh";
    private readonly stateStore = getSharedActionRewardStateStore();

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

    private async getDailyPointState(phone: string, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        return await this.stateStore.getDailyPointState(phone, dayKey);
    }

    async recordDailyPointBalance(phone: string, balanceData: any, now = new Date()) {
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

        await this.stateStore.setDailyPointState(phone, state);
        return state;
    }

    async getCachedDailyPointSummary(phone: string, now = new Date()) {
        const state = await this.getDailyPointState(phone, now);
        return state ? { ...state } : null;
    }

    async consumeCachedDailyPoint(phone: string, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        return await this.stateStore.consumeDailyPoint(phone, dayKey);
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

    private async getActionRewardCounters(phone: string, now = new Date()) {
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

    private async canClaimActionReward(phone: string, category: ActionRewardCategory, scope: ActionRewardScope, now = new Date()) {
        const counters = await this.getActionRewardCounters(phone, now);
        return this.getActionRewardQuotaFromCounters(counters, category, scope);
    }

    private getActionRewardQuotaFromCounters(counters: ActionRewardCounters, category: ActionRewardCategory, scope: ActionRewardScope) {
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

    private async markActionRewardProgress(phone: string, category: ActionRewardCategory, now = new Date()) {
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

    async markActionRewardClaimed(phone: string, category: ActionRewardCategory, scope: ActionRewardScope, target: number, now = new Date()) {
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

    private getActionRewardProgressValue(counters: ActionRewardCounters, category: ActionRewardCategory, scope: ActionRewardScope) {
        const field = this.getActionRewardProgressField(category, scope);
        return Number(counters[field] || 0);
    }

    private getRegularClaimFailureField(category: ActionRewardCategory, scope: ActionRewardScope, missionId: number) {
        return `regular:${scope}:${category}:${missionId}`;
    }

    getStreakClaimFailureField(missionId: number) {
        return `streak:${missionId}`;
    }

    async hasClaimFailure(phone: string, failureField: string, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        return await this.stateStore.hasClaimFailure(phone, dayKey, failureField);
    }

    async recordClaimFailure(phone: string, failureField: string, detail?: any, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        await this.stateStore.recordClaimFailure(phone, dayKey, failureField, detail);
    }

    async hasStreakClaimedToday(phone: string, missionId?: number, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        const record = await this.stateStore.getStreakClaim(phone, dayKey);
        const claimed = Number(record?.claimed || 0) > 0;
        if (!claimed) return false;
        return !missionId || Number(record?.missionId || 0) === Number(missionId);
    }

    async markStreakClaimed(phone: string, missionId: number, now = new Date()) {
        const dayKey = this.getDateKeyInTimeZone(now) || this.normalizeSearchText(now.toISOString().slice(0, 10));
        await this.stateStore.setStreakClaim(phone, dayKey, missionId);
        await this.consumeCachedDailyPoint(phone, now);
    }

    private async getOrFetchDailyPointState(accessToken: string, h: any, phone: string) {
        const cached = await this.getDailyPointState(phone);
        if (cached) return cached;

        const balanceRes = await MissionApiService.getPointBalance(accessToken, h, this.proxyAgent);
        const balanceData = balanceRes.data?.data || balanceRes.data || {};
        return await this.recordDailyPointBalance(phone, balanceData);
    }

    async getActionRewardPlan(
        accessToken: string,
        h: any,
        ctx: any,
        category: ActionRewardCategory
    ): Promise<ActionRewardPlan> {
        const phone = String(ctx?.phone || "").trim().toLowerCase();
        if (!phone) {
            return { shouldDoAction: false, reason: "NO_ACTIVE_MISSION", activeScopes: [] };
        }

        const dailyPointState = await this.getOrFetchDailyPointState(accessToken, h, phone);
        const dailyPointExhausted = dailyPointState.dailyRemainingPoint !== null && dailyPointState.dailyRemainingPoint <= 0;

        const res = await MissionApiService.getCurrentUserMissions(accessToken, h, this.proxyAgent);
        const missions = Array.isArray(res.data?.data || res.data) ? (res.data?.data || res.data) : [];
        const counters = await this.getActionRewardCounters(phone);
        const activeScopes: ActionRewardScope[] = [];
        let sawCandidate = false;

        for (const scope of ["DAILY", "WEEKLY"] as ActionRewardScope[]) {
            if (dailyPointExhausted && scope === "DAILY") {
                continue;
            }

            const candidate = this.findActionRewardMission(missions, category, scope);
            if (!candidate) continue;
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
    ): Promise<ActionRewardClaimResult> {
        const emptyResult: ActionRewardClaimResult = { claimedAny: false, dailyPointExhausted: false };
        try {
            const phone = String(ctx?.phone || "").trim().toLowerCase();
            if (!phone) return emptyResult;

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

                const balanceRes = await MissionApiService.getPointBalance(accessToken, h, this.proxyAgent);
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
        } catch (e: any) {
            this.logger.error("HANDLE_ACTION_REWARD_CLAIM_ERROR", {
                ...ctx,
                category,
                err: e.message || String(e)
            });
            return emptyResult;
        }
    }
}
