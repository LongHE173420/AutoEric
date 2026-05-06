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
};

function pad(value: number, length = 2) {
    return String(Math.trunc(Math.abs(value))).padStart(length, "0");
}

function getDateKeyInTimeZone(now = new Date(), timeZone = TIME_ZONE) {
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

    private shouldScheduleAction(remainingQuota: number, probability: number) {
        if (remainingQuota <= 0) return false;
        return Math.random() < probability;
    }

    decideRun(
        currentDailyRunCount = 0,
        currentDailyPostCount = 0,
        currentDailySurfCount = 0,
        now = new Date()
    ): AccountActivityDecision {
        const normalizedRunCount = Math.max(0, Number(currentDailyRunCount) || 0);
        const normalizedPostCount = Math.max(0, Number(currentDailyPostCount) || 0);
        const normalizedSurfCount = Math.max(0, Number(currentDailySurfCount) || 0);
        const runIndex = normalizedRunCount + 1;
        const remainingRuns = Math.max(1, this.dailyRunLimit - normalizedRunCount);
        const remainingPostQuota = Math.max(0, this.dailyPostLimit - normalizedPostCount);
        const remainingSurfQuota = Math.max(0, this.dailySurfLimit - normalizedSurfCount);
        const runProgressRatio = Math.min(1, Math.max(0, runIndex / this.dailyRunLimit));
        const runProgressPercent = Math.round(runProgressRatio * 10000) / 100;
        const postChancePercent = remainingPostQuota > 0 ? runProgressPercent : 0;
        const surfChancePercent = remainingSurfQuota > 0 ? runProgressPercent : 0;

        let shouldPost = this.shouldScheduleAction(remainingPostQuota, runProgressRatio);
        let shouldSurf = this.shouldScheduleAction(remainingSurfQuota, runProgressRatio);

        return {
            dayKey: getDateKeyInTimeZone(now),
            dailyRunLimit: this.dailyRunLimit,
            runIndex,
            remainingRuns,
            runProgressPercent,
            postChancePercent,
            surfChancePercent,
            shouldPost,
            shouldSurf,
            postsDone: normalizedPostCount,
            surfsDone: normalizedSurfCount,
            remainingPostQuota,
            remainingSurfQuota
        };
    }
}
