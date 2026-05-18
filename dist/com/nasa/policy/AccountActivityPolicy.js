"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountActivityPolicy = void 0;
exports.getDateKeyInTimeZone = getDateKeyInTimeZone;
const env_1 = require("../config/env");
const TIME_ZONE = "Asia/Ho_Chi_Minh";
function pad(value, length = 2) {
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
class AccountActivityPolicy {
    constructor() {
        this.dailyRunLimit = Math.max(1, env_1.ENV.ACCOUNT_DAILY_RUN_LIMIT);
        this.dailyPostLimit = Math.max(0, env_1.ENV.ACCOUNT_DAILY_POST_LIMIT);
        this.dailySurfLimit = Math.max(0, env_1.ENV.ACCOUNT_DAILY_SURF_LIMIT);
        this.postMinGapRuns = Math.max(0, env_1.ENV.POST_MIN_GAP_RUNS);
        this.surfMinGapRuns = Math.max(0, env_1.ENV.SURF_MIN_GAP_RUNS);
    }
    shouldScheduleAction(remainingQuota, probability) {
        if (remainingQuota <= 0)
            return false;
        return Math.random() < probability;
    }
    getGapRunsRemaining(lastActionRunIndex, currentRunIndex, minGapRuns) {
        if (lastActionRunIndex <= 0 || minGapRuns <= 0) {
            return 0;
        }
        const runDistance = currentRunIndex - lastActionRunIndex;
        if (runDistance > minGapRuns) {
            return 0;
        }
        return Math.max(0, minGapRuns - runDistance + 1);
    }
    buildCandidate(currentDailyRunCount = 0, currentDailyPostCount = 0, currentDailySurfCount = 0, lastPostRunIndex = 0, lastSurfRunIndex = 0, now = new Date()) {
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
    finalizeDecision(candidate, overrides) {
        return {
            ...candidate,
            shouldPost: Boolean(overrides?.shouldPost),
            shouldSurf: Boolean(overrides?.shouldSurf),
            postJitterMs: Math.max(0, Number(overrides?.postJitterMs) || 0),
            surfJitterMs: Math.max(0, Number(overrides?.surfJitterMs) || 0),
            decisionSource: "planner"
        };
    }
    decideRun(currentDailyRunCount = 0, currentDailyPostCount = 0, currentDailySurfCount = 0, now = new Date()) {
        const candidate = this.buildCandidate(currentDailyRunCount, currentDailyPostCount, currentDailySurfCount, 0, 0, now);
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
exports.AccountActivityPolicy = AccountActivityPolicy;
