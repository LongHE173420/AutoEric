import axios from "axios";
import { ENV } from "../config/env";
import { AsyncStore } from "./asyncStore";

type HashRecord = Record<string, any>;

export type DailyPointStateRecord = {
  dayKey: string;
  dailyRemainingPoint: number | null;
  dailyEarnedPoint: number | null;
  dailyPointLimit: number | null;
};

function toFiniteNumber(value: any, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function mapFromRedisHashResult(result: any): HashRecord {
  if (!result) {
    return {};
  }

  if (Array.isArray(result)) {
    const out: HashRecord = {};
    for (let index = 0; index < result.length; index += 2) {
      const key = String(result[index] ?? "").trim();
      if (!key) continue;
      out[key] = result[index + 1];
    }
    return out;
  }

  if (typeof result === "object") {
    return { ...result };
  }

  return {};
}

function normalizePhone(phone: string) {
  return String(phone || "").trim().toLowerCase();
}

export class ActionRewardStateStore {
  private readonly baseUrl = String(ENV.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
  private readonly token = String(ENV.UPSTASH_REDIS_REST_TOKEN || "").trim();
  private readonly keyPrefix = String(ENV.REDIS_KEY_PREFIX || "ae").trim() || "ae";
  private readonly dailyTtlSeconds = 3 * 24 * 60 * 60;
  private readonly weeklyTtlSeconds = 14 * 24 * 60 * 60;
  private readonly failureTtlSeconds = 24 * 60 * 60;
  private readonly hashCache = new Map<string, HashRecord>();
  private readonly expireTouched = new Set<string>();

  private get redisEnabled() {
    return Boolean(this.baseUrl && this.token);
  }

  getBackendInfo() {
    return {
      backend: this.redisEnabled ? "redis" as const : "json_fallback" as const,
      keyPrefix: this.keyPrefix,
      redisConfigured: this.redisEnabled
    };
  }

  private actionRewardKey(phone: string, scope: "DAILY" | "WEEKLY", periodKey: string) {
    const normalizedScope = scope.toLowerCase();
    return `${this.keyPrefix}:actionReward:${normalizePhone(phone)}:${normalizedScope}:${periodKey}`;
  }

  private dailyPointKey(phone: string, dayKey: string) {
    return `${this.keyPrefix}:dailyPoint:${normalizePhone(phone)}:${dayKey}`;
  }

  private streakClaimKey(phone: string, dayKey: string) {
    return `${this.keyPrefix}:streakClaim:${normalizePhone(phone)}:${dayKey}`;
  }

  private claimFailureKey(phone: string, dayKey: string) {
    return `${this.keyPrefix}:claimFailure:${normalizePhone(phone)}:${dayKey}`;
  }

  private ttlForScope(scope: "DAILY" | "WEEKLY") {
    return scope === "WEEKLY" ? this.weeklyTtlSeconds : this.dailyTtlSeconds;
  }

  private async redisGetHash(key: string): Promise<HashRecord> {
    try {
      const res = await axios.get(`${this.baseUrl}/hgetall/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      return mapFromRedisHashResult(res.data?.result);
    } catch (err: any) {
      console.error("ACTION_REWARD_REDIS_HGETALL_FAIL", key, err?.message || String(err));
      return {};
    }
  }

  private async redisSetHashFields(key: string, fields: HashRecord) {
    const entries = Object.entries(fields).filter(([field]) => String(field || "").trim());
    if (!entries.length) return;

    const chunkSize = 40;
    for (let index = 0; index < entries.length; index += chunkSize) {
      const chunk = entries.slice(index, index + chunkSize);
      const pathParts = [`${this.baseUrl}/hset`, encodeURIComponent(key)];

      for (const [field, value] of chunk) {
        pathParts.push(encodeURIComponent(field));
        pathParts.push(encodeURIComponent(String(value)));
      }

      try {
        await axios.get(pathParts.join("/"), {
          headers: { Authorization: `Bearer ${this.token}` }
        });
      } catch (err: any) {
        console.error("ACTION_REWARD_REDIS_HSET_FAIL", key, err?.message || String(err));
      }
    }
  }

  private async redisIncrementHashField(key: string, field: string, amount: number) {
    try {
      const res = await axios.get(
        `${this.baseUrl}/hincrby/${encodeURIComponent(key)}/${encodeURIComponent(field)}/${encodeURIComponent(String(amount))}`,
        { headers: { Authorization: `Bearer ${this.token}` } }
      );
      return toFiniteNumber(res.data?.result, 0);
    } catch (err: any) {
      console.error("ACTION_REWARD_REDIS_HINCRBY_FAIL", key, field, err?.message || String(err));
      const current = await this.getHash(key);
      const next = toFiniteNumber(current[field], 0) + amount;
      await this.setHashFields(key, { [field]: next });
      return next;
    }
  }

  private async redisExpire(key: string, ttlSeconds: number) {
    if (ttlSeconds <= 0) return;
    try {
      await axios.get(`${this.baseUrl}/expire/${encodeURIComponent(key)}/${ttlSeconds}`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
    } catch (err: any) {
      console.error("ACTION_REWARD_REDIS_EXPIRE_FAIL", key, err?.message || String(err));
    }
  }

  private getHash(key: string): HashRecord | Promise<HashRecord> {
    const cached = this.hashCache.get(key);
    if (cached) {
      return { ...cached };
    }

    if (this.redisEnabled) {
      return this.redisGetHash(key).then((record) => {
        this.hashCache.set(key, { ...record });
        return { ...record };
      });
    }

    const record = AsyncStore.getItem<HashRecord>(key) || {};
    this.hashCache.set(key, { ...record });
    return { ...record };
  }

  private async expireOnce(key: string, ttlSeconds: number) {
    if (ttlSeconds <= 0) return;

    const touchKey = `${key}:${ttlSeconds}`;
    if (this.expireTouched.has(touchKey)) {
      return;
    }

    this.expireTouched.add(touchKey);
    await this.redisExpire(key, ttlSeconds);
  }

  private async setHashFields(key: string, fields: HashRecord, ttlSeconds?: number) {
    if (this.redisEnabled) {
      await this.redisSetHashFields(key, fields);
      const current = this.hashCache.get(key) || {};
      this.hashCache.set(key, { ...current, ...fields });
      if (ttlSeconds) {
        await this.expireOnce(key, ttlSeconds);
      }
      return;
    }

    const current = AsyncStore.getItem<HashRecord>(key) || {};
    const next = { ...current, ...fields };
    AsyncStore.setItem(key, next);
    this.hashCache.set(key, { ...next });
  }

  private async incrementHashField(key: string, field: string, amount: number, ttlSeconds?: number) {
    if (this.redisEnabled) {
      const next = await this.redisIncrementHashField(key, field, amount);
      const current = this.hashCache.get(key) || {};
      this.hashCache.set(key, { ...current, [field]: next });
      if (ttlSeconds) {
        await this.expireOnce(key, ttlSeconds);
      }
      return next;
    }

    const current = AsyncStore.getItem<HashRecord>(key) || {};
    const next = toFiniteNumber(current[field], 0) + amount;
    const record = { ...current, [field]: next };
    AsyncStore.setItem(key, record);
    this.hashCache.set(key, { ...record });
    return next;
  }

  async getActionRewardRecord(phone: string, scope: "DAILY" | "WEEKLY", periodKey: string) {
    return await this.getHash(this.actionRewardKey(phone, scope, periodKey));
  }

  async incrementActionRewardProgress(phone: string, scope: "DAILY" | "WEEKLY", periodKey: string, field: string) {
    return await this.incrementHashField(
      this.actionRewardKey(phone, scope, periodKey),
      field,
      1,
      this.ttlForScope(scope)
    );
  }

  async incrementActionRewardClaimed(phone: string, scope: "DAILY" | "WEEKLY", periodKey: string, field: string) {
    return await this.incrementHashField(
      this.actionRewardKey(phone, scope, periodKey),
      field,
      1,
      this.ttlForScope(scope)
    );
  }

  async setDailyPointState(phone: string, state: DailyPointStateRecord) {
    await this.setHashFields(this.dailyPointKey(phone, state.dayKey), state, this.dailyTtlSeconds);
  }

  async getDailyPointState(phone: string, dayKey: string): Promise<DailyPointStateRecord | null> {
    const record = await this.getHash(this.dailyPointKey(phone, dayKey));
    if (!record || Object.keys(record).length === 0) {
      return null;
    }

    return {
      dayKey: String(record.dayKey || dayKey),
      dailyRemainingPoint: record.dailyRemainingPoint === null || record.dailyRemainingPoint === undefined
        ? null
        : Number(record.dailyRemainingPoint),
      dailyEarnedPoint: record.dailyEarnedPoint === null || record.dailyEarnedPoint === undefined
        ? null
        : Number(record.dailyEarnedPoint),
      dailyPointLimit: record.dailyPointLimit === null || record.dailyPointLimit === undefined
        ? null
        : Number(record.dailyPointLimit)
    };
  }

  async consumeDailyPoint(phone: string, dayKey: string) {
    const current = await this.getDailyPointState(phone, dayKey);
    if (!current) return null;

    const next: DailyPointStateRecord = {
      ...current,
      dailyRemainingPoint: current.dailyRemainingPoint === null
        ? null
        : Math.max(0, current.dailyRemainingPoint - 1),
      dailyEarnedPoint: current.dailyEarnedPoint === null
        ? null
        : current.dailyEarnedPoint + 1
    };

    await this.setDailyPointState(phone, next);
    return next;
  }

  async getStreakClaim(phone: string, dayKey: string) {
    return await this.getHash(this.streakClaimKey(phone, dayKey));
  }

  async setStreakClaim(phone: string, dayKey: string, missionId: number) {
    await this.setHashFields(this.streakClaimKey(phone, dayKey), {
      claimed: 1,
      missionId,
      claimedAt: Date.now()
    }, this.dailyTtlSeconds);
  }

  async hasClaimFailure(phone: string, dayKey: string, failureField: string) {
    const record = await this.getHash(this.claimFailureKey(phone, dayKey));
    return Object.prototype.hasOwnProperty.call(record, failureField);
  }

  async recordClaimFailure(phone: string, dayKey: string, failureField: string, detail?: any) {
    await this.setHashFields(this.claimFailureKey(phone, dayKey), {
      [failureField]: JSON.stringify({
        failedAt: Date.now(),
        detail: detail || null
      })
    }, this.failureTtlSeconds);
  }
}

let sharedActionRewardStateStore: ActionRewardStateStore | null = null;

export function getSharedActionRewardStateStore() {
  if (!sharedActionRewardStateStore) {
    sharedActionRewardStateStore = new ActionRewardStateStore();
  }
  return sharedActionRewardStateStore;
}
