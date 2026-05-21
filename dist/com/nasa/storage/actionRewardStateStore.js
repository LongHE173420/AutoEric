"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionRewardStateStore = void 0;
exports.getSharedActionRewardStateStore = getSharedActionRewardStateStore;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const asyncStore_1 = require("./asyncStore");
function toFiniteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}
function mapFromRedisHashResult(result) {
    if (!result) {
        return {};
    }
    if (Array.isArray(result)) {
        const out = {};
        for (let index = 0; index < result.length; index += 2) {
            const key = String(result[index] ?? "").trim();
            if (!key)
                continue;
            out[key] = result[index + 1];
        }
        return out;
    }
    if (typeof result === "object") {
        return { ...result };
    }
    return {};
}
function normalizePhone(phone) {
    return String(phone || "").trim().toLowerCase();
}
class ActionRewardStateStore {
    constructor() {
        this.baseUrl = String(env_1.ENV.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
        this.token = String(env_1.ENV.UPSTASH_REDIS_REST_TOKEN || "").trim();
        this.keyPrefix = String(env_1.ENV.REDIS_KEY_PREFIX || "ae").trim() || "ae";
        this.dailyTtlSeconds = 3 * 24 * 60 * 60;
        this.weeklyTtlSeconds = 14 * 24 * 60 * 60;
        this.failureTtlSeconds = 24 * 60 * 60;
        this.hashCache = new Map();
        this.expireTouched = new Set();
    }
    get redisEnabled() {
        return Boolean(this.baseUrl && this.token);
    }
    getBackendInfo() {
        return {
            backend: this.redisEnabled ? "redis" : "json_fallback",
            keyPrefix: this.keyPrefix,
            redisConfigured: this.redisEnabled
        };
    }
    actionRewardKey(phone, scope, periodKey) {
        const normalizedScope = scope.toLowerCase();
        return `${this.keyPrefix}:actionReward:${normalizePhone(phone)}:${normalizedScope}:${periodKey}`;
    }
    dailyPointKey(phone, dayKey) {
        return `${this.keyPrefix}:dailyPoint:${normalizePhone(phone)}:${dayKey}`;
    }
    streakClaimKey(phone, dayKey) {
        return `${this.keyPrefix}:streakClaim:${normalizePhone(phone)}:${dayKey}`;
    }
    claimFailureKey(phone, dayKey) {
        return `${this.keyPrefix}:claimFailure:${normalizePhone(phone)}:${dayKey}`;
    }
    ttlForScope(scope) {
        return scope === "WEEKLY" ? this.weeklyTtlSeconds : this.dailyTtlSeconds;
    }
    async redisGetHash(key) {
        try {
            const res = await axios_1.default.get(`${this.baseUrl}/hgetall/${encodeURIComponent(key)}`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            return mapFromRedisHashResult(res.data?.result);
        }
        catch (err) {
            console.error("ACTION_REWARD_REDIS_HGETALL_FAIL", key, err?.message || String(err));
            return {};
        }
    }
    async redisSetHashFields(key, fields) {
        const entries = Object.entries(fields).filter(([field]) => String(field || "").trim());
        if (!entries.length)
            return;
        const chunkSize = 40;
        for (let index = 0; index < entries.length; index += chunkSize) {
            const chunk = entries.slice(index, index + chunkSize);
            const pathParts = [`${this.baseUrl}/hset`, encodeURIComponent(key)];
            for (const [field, value] of chunk) {
                pathParts.push(encodeURIComponent(field));
                pathParts.push(encodeURIComponent(String(value)));
            }
            try {
                await axios_1.default.get(pathParts.join("/"), {
                    headers: { Authorization: `Bearer ${this.token}` }
                });
            }
            catch (err) {
                console.error("ACTION_REWARD_REDIS_HSET_FAIL", key, err?.message || String(err));
            }
        }
    }
    async redisIncrementHashField(key, field, amount) {
        try {
            const res = await axios_1.default.get(`${this.baseUrl}/hincrby/${encodeURIComponent(key)}/${encodeURIComponent(field)}/${encodeURIComponent(String(amount))}`, { headers: { Authorization: `Bearer ${this.token}` } });
            return toFiniteNumber(res.data?.result, 0);
        }
        catch (err) {
            console.error("ACTION_REWARD_REDIS_HINCRBY_FAIL", key, field, err?.message || String(err));
            const current = await this.getHash(key);
            const next = toFiniteNumber(current[field], 0) + amount;
            await this.setHashFields(key, { [field]: next });
            return next;
        }
    }
    async redisExpire(key, ttlSeconds) {
        if (ttlSeconds <= 0)
            return;
        try {
            await axios_1.default.get(`${this.baseUrl}/expire/${encodeURIComponent(key)}/${ttlSeconds}`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
        }
        catch (err) {
            console.error("ACTION_REWARD_REDIS_EXPIRE_FAIL", key, err?.message || String(err));
        }
    }
    getHash(key) {
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
        const record = asyncStore_1.AsyncStore.getItem(key) || {};
        this.hashCache.set(key, { ...record });
        return { ...record };
    }
    async expireOnce(key, ttlSeconds) {
        if (ttlSeconds <= 0)
            return;
        const touchKey = `${key}:${ttlSeconds}`;
        if (this.expireTouched.has(touchKey)) {
            return;
        }
        this.expireTouched.add(touchKey);
        await this.redisExpire(key, ttlSeconds);
    }
    async setHashFields(key, fields, ttlSeconds) {
        if (this.redisEnabled) {
            await this.redisSetHashFields(key, fields);
            const current = this.hashCache.get(key) || {};
            this.hashCache.set(key, { ...current, ...fields });
            if (ttlSeconds) {
                await this.expireOnce(key, ttlSeconds);
            }
            return;
        }
        const current = asyncStore_1.AsyncStore.getItem(key) || {};
        const next = { ...current, ...fields };
        asyncStore_1.AsyncStore.setItem(key, next);
        this.hashCache.set(key, { ...next });
    }
    async incrementHashField(key, field, amount, ttlSeconds) {
        if (this.redisEnabled) {
            const next = await this.redisIncrementHashField(key, field, amount);
            const current = this.hashCache.get(key) || {};
            this.hashCache.set(key, { ...current, [field]: next });
            if (ttlSeconds) {
                await this.expireOnce(key, ttlSeconds);
            }
            return next;
        }
        const current = asyncStore_1.AsyncStore.getItem(key) || {};
        const next = toFiniteNumber(current[field], 0) + amount;
        const record = { ...current, [field]: next };
        asyncStore_1.AsyncStore.setItem(key, record);
        this.hashCache.set(key, { ...record });
        return next;
    }
    async getActionRewardRecord(phone, scope, periodKey) {
        return await this.getHash(this.actionRewardKey(phone, scope, periodKey));
    }
    async incrementActionRewardProgress(phone, scope, periodKey, field) {
        return await this.incrementHashField(this.actionRewardKey(phone, scope, periodKey), field, 1, this.ttlForScope(scope));
    }
    async incrementActionRewardClaimed(phone, scope, periodKey, field) {
        return await this.incrementHashField(this.actionRewardKey(phone, scope, periodKey), field, 1, this.ttlForScope(scope));
    }
    async setDailyPointState(phone, state) {
        await this.setHashFields(this.dailyPointKey(phone, state.dayKey), state, this.dailyTtlSeconds);
    }
    async getDailyPointState(phone, dayKey) {
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
    async consumeDailyPoint(phone, dayKey) {
        const current = await this.getDailyPointState(phone, dayKey);
        if (!current)
            return null;
        const next = {
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
    async getStreakClaim(phone, dayKey) {
        return await this.getHash(this.streakClaimKey(phone, dayKey));
    }
    async setStreakClaim(phone, dayKey, missionId) {
        await this.setHashFields(this.streakClaimKey(phone, dayKey), {
            claimed: 1,
            missionId,
            claimedAt: Date.now()
        }, this.dailyTtlSeconds);
    }
    async hasClaimFailure(phone, dayKey, failureField) {
        const record = await this.getHash(this.claimFailureKey(phone, dayKey));
        return Object.prototype.hasOwnProperty.call(record, failureField);
    }
    async recordClaimFailure(phone, dayKey, failureField, detail) {
        await this.setHashFields(this.claimFailureKey(phone, dayKey), {
            [failureField]: JSON.stringify({
                failedAt: Date.now(),
                detail: detail || null
            })
        }, this.failureTtlSeconds);
    }
}
exports.ActionRewardStateStore = ActionRewardStateStore;
let sharedActionRewardStateStore = null;
function getSharedActionRewardStateStore() {
    if (!sharedActionRewardStateStore) {
        sharedActionRewardStateStore = new ActionRewardStateStore();
    }
    return sharedActionRewardStateStore;
}
