import { ENV } from "../config/env";

const TIME_ZONE = "Asia/Ho_Chi_Minh";

export type AccountActivityDecision = {
    dayKey: string;
    dailyRunLimit: number;
    runIndex: number;
    remainingRuns: number;
    runProgressPercent: number;
    postChancePercent: number;
    surfChancePercent: number;
    shouldPost: boolean;
    shouldSurf: boolean;
    postsDone: number;
    surfsDone: number;
    remainingPostQuota: number;
    remainingSurfQuota: number;
    postWeight: number;
    surfWeight: number;
    eligibleForPost: boolean;
    eligibleForSurf: boolean;
    postGapRunsRemaining: number;
    surfGapRunsRemaining: number;
    decisionSource: "legacy_random" | "planner";
    postJitterMs: number;
    surfJitterMs: number;
};

export type AccountActivityCandidate = AccountActivityDecision;

function pad(value: number, length = 2) {
    return String(Math.trunc(Math.abs(value))).padStart(length, "0");
}

export function getDateKeyInTimeZone(now = new Date(), timeZone = TIME_ZONE) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(now);

    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (!year || !month || !day) {
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    return `${year}-${month}-${day}`;
}

export class AccountActivityPolicy {
    private readonly dailyRunLimit = Math.max(1, ENV.ACCOUNT_DAILY_RUN_LIMIT);
    private readonly dailyPostLimit = Math.max(0, ENV.ACCOUNT_DAILY_POST_LIMIT);
    private readonly dailySurfLimit = Math.max(0, ENV.ACCOUNT_DAILY_SURF_LIMIT);
    private readonly postMinGapRuns = Math.max(0, ENV.POST_MIN_GAP_RUNS);
    private readonly surfMinGapRuns = Math.max(0, ENV.SURF_MIN_GAP_RUNS);

    private shouldScheduleAction(remainingQuota: number, probability: number) {
        if (remainingQuota <= 0) return false;
        return Math.random() < probability;
    }

    private getGapRunsRemaining(lastActionRunIndex: number, currentRunIndex: number, minGapRuns: number) {
        if (lastActionRunIndex <= 0 || minGapRuns <= 0) {
            return 0;
        }

        const runDistance = currentRunIndex - lastActionRunIndex;
        if (runDistance > minGapRuns) {
            return 0;
        }

        return Math.max(0, minGapRuns - runDistance + 1);
    }

    buildCandidate(
        currentDailyRunCount = 0,
        currentDailyPostCount = 0,
        currentDailySurfCount = 0,
        lastPostRunIndex = 0,
        lastSurfRunIndex = 0,
        now = new Date()
    ): AccountActivityCandidate {
        const normalizedRunCount = Math.max(0, Number(currentDailyRunCount) || 0);
        const normalizedPostCount = Math.max(0, Number(currentDailyPostCount) || 0);
        const normalizedSurfCount = Math.max(0, Number(currentDailySurfCount) || 0);
        const normalizedLastPostRunIndex = Math.max(0, Number(lastPostRunIndex) || 0);
        const normalizedLastSurfRunIndex = Math.max(0, Number(lastSurfRunIndex) || 0);
        const runIndex = normalizedRunCount + 1;
        const remainingRuns = Math.max(1, this.dailyRunLimit - normalizedRunCount);
        const remainingPostQuota = Math.max(0, this.dailyPostLimit - normalizedPostCount);
        const remainingSurfQuota = Math.max(0, this.dailySurfLimit - normalizedSurfCount);
        const runProgressRatio = Math.min(1, Math.max(0, runIndex / this.dailyRunLimit));
        const runProgressPercent = Math.round(runProgressRatio * 10000) / 100;
        const postGapRunsRemaining = this.getGapRunsRemaining(normalizedLastPostRunIndex, runIndex, this.postMinGapRuns);
        const surfGapRunsRemaining = this.getGapRunsRemaining(normalizedLastSurfRunIndex, runIndex, this.surfMinGapRuns);
        const eligibleForPost = remainingPostQuota > 0 && postGapRunsRemaining === 0;
        const eligibleForSurf = remainingSurfQuota > 0 && surfGapRunsRemaining === 0;
        const postWeight = eligibleForPost ? remainingPostQuota / remainingRuns : 0;
        const surfWeight = eligibleForSurf ? remainingSurfQuota / remainingRuns : 0;
        const postChancePercent = Math.round(postWeight * 10000) / 100;
        const surfChancePercent = Math.round(surfWeight * 10000) / 100;

        return {
            dayKey: getDateKeyInTimeZone(now),
            dailyRunLimit: this.dailyRunLimit,
            runIndex,
            remainingRuns,
            runProgressPercent,
            postChancePercent,
            surfChancePercent,
            shouldPost: false,
            shouldSurf: false,
            postsDone: normalizedPostCount,
            surfsDone: normalizedSurfCount,
            remainingPostQuota,
            remainingSurfQuota,
            postWeight,
            surfWeight,
            eligibleForPost,
            eligibleForSurf,
            postGapRunsRemaining,
            surfGapRunsRemaining,
            decisionSource: "planner",
            postJitterMs: 0,
            surfJitterMs: 0
        };
    }

    finalizeDecision(
        candidate: AccountActivityCandidate,
        overrides?: Partial<Pick<AccountActivityDecision, "shouldPost" | "shouldSurf" | "postJitterMs" | "surfJitterMs">>
    ): AccountActivityDecision {
        return {
            ...candidate,
            shouldPost: Boolean(overrides?.shouldPost),
            shouldSurf: Boolean(overrides?.shouldSurf),
            postJitterMs: Math.max(0, Number(overrides?.postJitterMs) || 0),
            surfJitterMs: Math.max(0, Number(overrides?.surfJitterMs) || 0),
            decisionSource: "planner"
        };
    }

    decideRun(
        currentDailyRunCount = 0,
        currentDailyPostCount = 0,
        currentDailySurfCount = 0,
        now = new Date()
    ): AccountActivityDecision {
        const candidate = this.buildCandidate(
            currentDailyRunCount,
            currentDailyPostCount,
            currentDailySurfCount,
            0,
            0,
            now
        );
        const runProgressRatio = Math.min(1, Math.max(0, candidate.runIndex / this.dailyRunLimit));
        const shouldPost = this.shouldScheduleAction(candidate.remainingPostQuota, runProgressRatio);
        const shouldSurf = this.shouldScheduleAction(candidate.remainingSurfQuota, runProgressRatio);

        return {
            ...candidate,
            postChancePercent: candidate.remainingPostQuota > 0 ? candidate.runProgressPercent : 0,
            surfChancePercent: candidate.remainingSurfQuota > 0 ? candidate.runProgressPercent : 0,
            shouldPost,
            shouldSurf,
            postWeight: candidate.remainingPostQuota > 0 ? runProgressRatio : 0,
            surfWeight: candidate.remainingSurfQuota > 0 ? runProgressRatio : 0,
            eligibleForPost: candidate.remainingPostQuota > 0,
            eligibleForSurf: candidate.remainingSurfQuota > 0,
            decisionSource: "legacy_random"
        };
    }
}
