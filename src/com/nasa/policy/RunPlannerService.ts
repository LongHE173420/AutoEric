import { ENV } from "../config/env";
import { getSharedPlannerStateStore } from "../storage/plannerStateStore";
import {
  AccountActivityCandidate,
  AccountActivityDecision,
  AccountActivityPolicy,
  getDateKeyInTimeZone
} from "./AccountActivityPolicy";

type AppLogger = {
  debug: (msg: string, obj?: any) => void;
  info: (msg: string, obj?: any) => void;
  warn: (msg: string, obj?: any) => void;
  error: (msg: string, obj?: any) => void;
};

export type RunPlan = {
  dayKey: string;
  byPhone: Record<string, AccountActivityDecision>;
  summary: {
    accounts: number;
    runIndexMin: number;
    runIndexMax: number;
    candidatePosts: number;
    candidateSurfs: number;
    totalPostWeight: number;
    totalSurfWeight: number;
    desiredPostSlots: number;
    desiredSurfSlots: number;
    selectedPosts: number;
    selectedSurfs: number;
    postCarryBefore: number;
    surfCarryBefore: number;
    postCarryAfter: number;
    surfCarryAfter: number;
  };
};

type WeightedCandidate = {
  phone: string;
  candidate: AccountActivityCandidate;
};

function normalizePhone(phone: any) {
  return String(phone || "").trim();
}

function randomInt(maxMs: number) {
  const limit = Math.max(0, Math.floor(Number(maxMs) || 0));
  if (limit <= 0) {
    return 0;
  }
  return Math.floor(Math.random() * (limit + 1));
}

function roundTo(value: number, precision = 6) {
  const factor = 10 ** precision;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function pickWeightedWithoutReplacement(
  items: WeightedCandidate[],
  count: number,
  weightOf: (item: WeightedCandidate) => number
) {
  const pool = items
    .map((item) => ({ item, weight: Math.max(0, Number(weightOf(item)) || 0) }))
    .filter((entry) => entry.weight > 0);
  const winners: WeightedCandidate[] = [];

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

export class RunPlannerService {
  private readonly policy = new AccountActivityPolicy();
  private readonly stateStore = getSharedPlannerStateStore();

  constructor(private readonly logger: AppLogger) {}

  async buildRunPlan(accounts: any[], now = new Date()): Promise<RunPlan> {
    const dayKey = getDateKeyInTimeZone(now);
    const state = await this.stateStore.getDayState(dayKey);
    const byPhone: Record<string, AccountActivityDecision> = {};
    const weighted: WeightedCandidate[] = [];

    for (const acc of accounts) {
      const phone = normalizePhone(acc?.phone || acc?.username);
      if (!phone) {
        continue;
      }

      const candidate = this.policy.buildCandidate(
        acc?.dailyRunCount,
        acc?.dailyPostCount,
        acc?.dailySurfCount,
        state.lastPostRuns[phone],
        state.lastSurfRuns[phone],
        now
      );

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
    const selectedPostEntries = pickWeightedWithoutReplacement(
      postCandidates,
      Math.min(desiredPostSlots, postCandidates.length),
      (entry) => entry.candidate.postWeight
    );
    const selectedPostPhones = new Set(selectedPostEntries.map((entry) => entry.phone));
    postCarry = roundTo(Math.max(0, postCarry - selectedPostEntries.length));

    const surfCandidates = ENV.ALLOW_POST_AND_SURF_SAME_RUN
      ? surfCandidatesAll
      : surfCandidatesAll.filter((entry) => !selectedPostPhones.has(entry.phone));
    const desiredSurfSlots = Math.max(0, Math.floor(surfCarry + 1e-9));
    const selectedSurfEntries = pickWeightedWithoutReplacement(
      surfCandidates,
      Math.min(desiredSurfSlots, surfCandidates.length),
      (entry) => entry.candidate.surfWeight
    );
    const selectedSurfPhones = new Set(selectedSurfEntries.map((entry) => entry.phone));
    surfCarry = roundTo(Math.max(0, surfCarry - selectedSurfEntries.length));

    await this.stateStore.saveCarry(dayKey, { postCarry, surfCarry });

    for (const { phone, candidate } of weighted) {
      byPhone[phone] = this.policy.finalizeDecision(candidate, {
        shouldPost: selectedPostPhones.has(phone),
        shouldSurf: selectedSurfPhones.has(phone),
        postJitterMs: selectedPostPhones.has(phone) ? randomInt(ENV.POST_START_JITTER_MS) : 0,
        surfJitterMs: selectedSurfPhones.has(phone) ? randomInt(ENV.SURF_START_JITTER_MS) : 0
      });
    }

    const runIndexes = weighted.map(({ candidate }) => candidate.runIndex);
    const runPlan: RunPlan = {
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

  async recordActionAttempt(dayKey: string, phone: string, action: "post" | "surf", runIndex: number) {
    await this.stateStore.recordActionRun(dayKey, phone, action, runIndex);
  }
}
