"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunPlannerService = void 0;
const env_1 = require("../config/env");
const plannerStateStore_1 = require("../storage/plannerStateStore");
const AccountActivityPolicy_1 = require("./AccountActivityPolicy");
function normalizePhone(phone) {
    return String(phone || "").trim();
}
function randomInt(maxMs) {
    const limit = Math.max(0, Math.floor(Number(maxMs) || 0));
    if (limit <= 0) {
        return 0;
    }
    return Math.floor(Math.random() * (limit + 1));
}
function roundTo(value, precision = 6) {
    const factor = 10 ** precision;
    return Math.round((Number(value) || 0) * factor) / factor;
}
function pickWeightedWithoutReplacement(items, count, weightOf) {
    const pool = items
        .map((item) => ({ item, weight: Math.max(0, Number(weightOf(item)) || 0) }))
        .filter((entry) => entry.weight > 0);
    const winners = [];
    while (pool.length > 0 && winners.length < count) {
        const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
        if (!(totalWeight > 0)) {
            break;
        }
        let roll = Math.random() * totalWeight;
        let pickedIndex = pool.length - 1;
        for (let i = 0; i < pool.length; i++) {
            roll -= pool[i].weight;
            if (roll <= 0) {
                pickedIndex = i;
                break;
            }
        }
        const [picked] = pool.splice(pickedIndex, 1);
        if (picked?.item) {
            winners.push(picked.item);
        }
    }
    return winners;
}
class RunPlannerService {
    constructor(logger) {
        this.logger = logger;
        this.policy = new AccountActivityPolicy_1.AccountActivityPolicy();
        this.stateStore = (0, plannerStateStore_1.getSharedPlannerStateStore)();
    }
    async buildRunPlan(accounts, now = new Date()) {
        const dayKey = (0, AccountActivityPolicy_1.getDateKeyInTimeZone)(now);
        const state = await this.stateStore.getDayState(dayKey);
        const byPhone = {};
        const weighted = [];
        for (const acc of accounts) {
            const phone = normalizePhone(acc?.phone || acc?.username);
            if (!phone) {
                continue;
            }
            const candidate = this.policy.buildCandidate(acc?.dailyRunCount, acc?.dailyPostCount, acc?.dailySurfCount, state.lastPostRuns[phone], state.lastSurfRuns[phone], now);
            weighted.push({ phone, candidate });
        }
        const postCandidates = weighted.filter(({ candidate }) => candidate.eligibleForPost && candidate.postWeight > 0);
        const surfCandidatesAll = weighted.filter(({ candidate }) => candidate.eligibleForSurf && candidate.surfWeight > 0);
        const totalPostWeight = roundTo(postCandidates.reduce((sum, entry) => sum + entry.candidate.postWeight, 0));
        const totalSurfWeight = roundTo(surfCandidatesAll.reduce((sum, entry) => sum + entry.candidate.surfWeight, 0));
        const postCarryBefore = roundTo(state.postCarry);
        const surfCarryBefore = roundTo(state.surfCarry);
        let postCarry = roundTo(postCarryBefore + totalPostWeight);
        let surfCarry = roundTo(surfCarryBefore + totalSurfWeight);
        const desiredPostSlots = Math.max(0, Math.floor(postCarry + 1e-9));
        const selectedPostEntries = pickWeightedWithoutReplacement(postCandidates, Math.min(desiredPostSlots, postCandidates.length), (entry) => entry.candidate.postWeight);
        const selectedPostPhones = new Set(selectedPostEntries.map((entry) => entry.phone));
        postCarry = roundTo(Math.max(0, postCarry - selectedPostEntries.length));
        const surfCandidates = env_1.ENV.ALLOW_POST_AND_SURF_SAME_RUN
            ? surfCandidatesAll
            : surfCandidatesAll.filter((entry) => !selectedPostPhones.has(entry.phone));
        const desiredSurfSlots = Math.max(0, Math.floor(surfCarry + 1e-9));
        const selectedSurfEntries = pickWeightedWithoutReplacement(surfCandidates, Math.min(desiredSurfSlots, surfCandidates.length), (entry) => entry.candidate.surfWeight);
        const selectedSurfPhones = new Set(selectedSurfEntries.map((entry) => entry.phone));
        surfCarry = roundTo(Math.max(0, surfCarry - selectedSurfEntries.length));
        await this.stateStore.saveCarry(dayKey, { postCarry, surfCarry });
        for (const { phone, candidate } of weighted) {
            byPhone[phone] = this.policy.finalizeDecision(candidate, {
                shouldPost: selectedPostPhones.has(phone),
                shouldSurf: selectedSurfPhones.has(phone),
                postJitterMs: selectedPostPhones.has(phone) ? randomInt(env_1.ENV.POST_START_JITTER_MS) : 0,
                surfJitterMs: selectedSurfPhones.has(phone) ? randomInt(env_1.ENV.SURF_START_JITTER_MS) : 0
            });
        }
        const runIndexes = weighted.map(({ candidate }) => candidate.runIndex);
        const runPlan = {
            dayKey,
            byPhone,
            summary: {
                accounts: weighted.length,
                runIndexMin: runIndexes.length ? Math.min(...runIndexes) : 0,
                runIndexMax: runIndexes.length ? Math.max(...runIndexes) : 0,
                candidatePosts: postCandidates.length,
                candidateSurfs: surfCandidates.length,
                totalPostWeight,
                totalSurfWeight,
                desiredPostSlots,
                desiredSurfSlots,
                selectedPosts: selectedPostEntries.length,
                selectedSurfs: selectedSurfEntries.length,
                postCarryBefore,
                surfCarryBefore,
                postCarryAfter: postCarry,
                surfCarryAfter: surfCarry
            }
        };
        this.logger.info("ACCOUNT_ACTIVITY_RUN_PLAN", {
            dayKey,
            ...runPlan.summary
        });
        return runPlan;
    }
    async recordActionAttempt(dayKey, phone, action, runIndex) {
        await this.stateStore.recordActionRun(dayKey, phone, action, runIndex);
    }
}
exports.RunPlannerService = RunPlannerService;
