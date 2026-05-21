import axios from "axios";
import { ENV } from "../config/env";

export type PlannerDayState = {
  postCarry: number;
  surfCarry: number;
  lastPostRuns: Record<string, number>;
  lastSurfRuns: Record<string, number>;
};

type CarryState = {
  postCarry: number;
  surfCarry: number;
};

const FALLBACK_DAY_STATE = new Map<string, PlannerDayState>();

function toFiniteNumber(value: any, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cloneDayState(state?: PlannerDayState): PlannerDayState {
  return {
    postCarry: toFiniteNumber(state?.postCarry, 0),
    surfCarry: toFiniteNumber(state?.surfCarry, 0),
    lastPostRuns: { ...(state?.lastPostRuns || {}) },
    lastSurfRuns: { ...(state?.lastSurfRuns || {}) }
  };
}

function mapFromRedisHashResult(result: any): Record<string, number> {
  if (!result) {
    return {};
  }

  if (Array.isArray(result)) {
    const out: Record<string, number> = {};
    for (let i = 0; i < result.length; i += 2) {
      const key = String(result[i] ?? "").trim();
      if (!key) {
        continue;
      }
      out[key] = toFiniteNumber(result[i + 1], 0);
    }
    return out;
  }

  if (typeof result === "object") {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(result)) {
      const normalizedKey = String(key ?? "").trim();
      if (!normalizedKey) {
        continue;
      }
      out[normalizedKey] = toFiniteNumber(value, 0);
    }
    return out;
  }

  return {};
}

export class PlannerStateStore {
  private readonly baseUrl = String(ENV.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
  private readonly token = String(ENV.UPSTASH_REDIS_REST_TOKEN || "").trim();
  private readonly keyPrefix = String(ENV.REDIS_KEY_PREFIX || "ae").trim() || "ae";
  private readonly dayTtlSeconds = 3 * 24 * 60 * 60;
  private readonly expireTouched = new Set<string>();

  private get redisEnabled() {
    return !!(this.baseUrl && this.token);
  }

  private getFallbackDayState(dayKey: string) {
    if (!FALLBACK_DAY_STATE.has(dayKey)) {
      FALLBACK_DAY_STATE.set(dayKey, {
        postCarry: 0,
        surfCarry: 0,
        lastPostRuns: {},
        lastSurfRuns: {}
      });
    }
    return FALLBACK_DAY_STATE.get(dayKey)!;
  }

  private key(dayKey: string, suffix: string) {
    return `${this.keyPrefix}:planner:${dayKey}:${suffix}`;
  }

  private async getHash(key: string): Promise<Record<string, number>> {
    if (!this.redisEnabled) {
      return {};
    }

    try {
      const encodedKey = encodeURIComponent(key);
      const res = await axios.get(`${this.baseUrl}/hgetall/${encodedKey}`, {
        headers: {
          Authorization: `Bearer ${this.token}`
        }
      });
      return mapFromRedisHashResult(res.data?.result);
    } catch (err: any) {
      console.error("PLANNER_REDIS_HGETALL_FAIL", key, err?.message || String(err));
      return {};
    }
  }

  private async redisExpire(key: string, ttlSeconds: number) {
    if (ttlSeconds <= 0) {
      return;
    }

    try {
      await axios.get(`${this.baseUrl}/expire/${encodeURIComponent(key)}/${ttlSeconds}`, {
        headers: {
          Authorization: `Bearer ${this.token}`
        }
      });
    } catch (err: any) {
      console.error("PLANNER_REDIS_EXPIRE_FAIL", key, err?.message || String(err));
    }
  }

  private async expireOnce(key: string, ttlSeconds: number) {
    if (ttlSeconds <= 0) {
      return;
    }

    const touchKey = `${key}:${ttlSeconds}`;
    if (this.expireTouched.has(touchKey)) {
      return;
    }

    this.expireTouched.add(touchKey);
    await this.redisExpire(key, ttlSeconds);
  }

  private async setHashFields(key: string, fields: Record<string, string | number>, ttlSeconds?: number) {
    if (!this.redisEnabled) {
      return;
    }

    const entries = Object.entries(fields).filter(([field]) => String(field || "").trim().length > 0);
    if (!entries.length) {
      return;
    }

    const pathParts = [`${this.baseUrl}/hset`, encodeURIComponent(key)];
    for (const [field, value] of entries) {
      pathParts.push(encodeURIComponent(field));
      pathParts.push(encodeURIComponent(String(value)));
    }

    try {
      await axios.get(pathParts.join("/"), {
        headers: {
          Authorization: `Bearer ${this.token}`
        }
      });
      if (ttlSeconds) {
        await this.expireOnce(key, ttlSeconds);
      }
    } catch (err: any) {
      console.error("PLANNER_REDIS_HSET_FAIL", key, err?.message || String(err));
    }
  }

  async getDayState(dayKey: string): Promise<PlannerDayState> {
    if (!this.redisEnabled) {
      return cloneDayState(this.getFallbackDayState(dayKey));
    }

    const [carryHash, lastPostRuns, lastSurfRuns] = await Promise.all([
      this.getHash(this.key(dayKey, "carry")),
      this.getHash(this.key(dayKey, "last_post_runs")),
      this.getHash(this.key(dayKey, "last_surf_runs"))
    ]);

    return {
      postCarry: toFiniteNumber(carryHash.postCarry, 0),
      surfCarry: toFiniteNumber(carryHash.surfCarry, 0),
      lastPostRuns,
      lastSurfRuns
    };
  }

  async saveCarry(dayKey: string, carry: CarryState) {
    const normalized: CarryState = {
      postCarry: toFiniteNumber(carry?.postCarry, 0),
      surfCarry: toFiniteNumber(carry?.surfCarry, 0)
    };

    if (!this.redisEnabled) {
      const state = this.getFallbackDayState(dayKey);
      state.postCarry = normalized.postCarry;
      state.surfCarry = normalized.surfCarry;
      return;
    }

    await this.setHashFields(this.key(dayKey, "carry"), normalized, this.dayTtlSeconds);
  }

  async recordActionRun(dayKey: string, phone: string, action: "post" | "surf", runIndex: number) {
    const normalizedPhone = String(phone || "").trim();
    if (!normalizedPhone) {
      return;
    }

    const normalizedRunIndex = Math.max(0, Math.trunc(toFiniteNumber(runIndex, 0)));
    if (!this.redisEnabled) {
      const state = this.getFallbackDayState(dayKey);
      if (action === "post") {
        state.lastPostRuns[normalizedPhone] = normalizedRunIndex;
      } else {
        state.lastSurfRuns[normalizedPhone] = normalizedRunIndex;
      }
      return;
    }

    const targetKey = this.key(dayKey, action === "post" ? "last_post_runs" : "last_surf_runs");
    await this.setHashFields(targetKey, {
      [normalizedPhone]: normalizedRunIndex
    }, this.dayTtlSeconds);
  }
}

let sharedPlannerStateStore: PlannerStateStore | null = null;

export function getSharedPlannerStateStore() {
  if (!sharedPlannerStateStore) {
    sharedPlannerStateStore = new PlannerStateStore();
  }
  return sharedPlannerStateStore;
}
