"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountDailyRunPlanService = void 0;
const env_1 = require("../../config/env");
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
class AccountDailyRunPlanService {
    constructor() {
        this.dailyRunLimit = Math.max(1, env_1.ENV.ACCOUNT_DAILY_RUN_LIMIT);
        this.dailyPostLimit = Math.max(0, env_1.ENV.ACCOUNT_DAILY_POST_LIMIT);
        this.dailySurfLimit = Math.max(0, env_1.ENV.ACCOUNT_DAILY_SURF_LIMIT);
    }
    shouldScheduleAction(done, limit, remainingRuns) {
        const remainingQuota = Math.max(0, limit - done);
        if (remainingQuota <= 0)
            return false;
        if (remainingRuns <= remainingQuota)
            return true;
        return Math.random() < (remainingQuota / remainingRuns);
    }
    decideRun(currentDailyRunCount = 0, currentDailyPostCount = 0, currentDailySurfCount = 0, now = new Date()) {
        const normalizedRunCount = Math.max(0, Number(currentDailyRunCount) || 0);
        const normalizedPostCount = Math.max(0, Number(currentDailyPostCount) || 0);
        const normalizedSurfCount = Math.max(0, Number(currentDailySurfCount) || 0);
        const runIndex = normalizedRunCount + 1;
        const remainingRuns = Math.max(1, this.dailyRunLimit - normalizedRunCount);
        const remainingPostQuota = Math.max(0, this.dailyPostLimit - normalizedPostCount);
        const remainingSurfQuota = Math.max(0, this.dailySurfLimit - normalizedSurfCount);
        const postForced = remainingPostQuota > 0 && remainingRuns <= remainingPostQuota;
        const surfForced = remainingSurfQuota > 0 && remainingRuns <= remainingSurfQuota;
        let shouldPost = this.shouldScheduleAction(normalizedPostCount, this.dailyPostLimit, remainingRuns);
        let shouldSurf = this.shouldScheduleAction(normalizedSurfCount, this.dailySurfLimit, remainingRuns);
        if (shouldPost && shouldSurf && !(postForced && surfForced)) {
            if (postForced && !surfForced) {
                shouldSurf = false;
            }
            else if (surfForced && !postForced) {
                shouldPost = false;
            }
            else if (Math.random() < 0.5) {
                shouldSurf = false;
            }
            else {
                shouldPost = false;
            }
        }
        return {
            dayKey: getDateKeyInTimeZone(now),
            dailyRunLimit: this.dailyRunLimit,
            runIndex,
            remainingRuns,
            shouldPost,
            shouldSurf,
            postsDone: normalizedPostCount,
            surfsDone: normalizedSurfCount,
            remainingPostQuota,
            remainingSurfQuota
        };
    }
}
exports.AccountDailyRunPlanService = AccountDailyRunPlanService;
