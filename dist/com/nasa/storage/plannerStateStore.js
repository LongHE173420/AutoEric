"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerStateStore = void 0;
exports.getSharedPlannerStateStore = getSharedPlannerStateStore;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const FALLBACK_DAY_STATE = new Map();
function toFiniteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}
function cloneDayState(state) {
    return {
        postCarry: toFiniteNumber(state?.postCarry, 0),
        surfCarry: toFiniteNumber(state?.surfCarry, 0),
        lastPostRuns: { ...(state?.lastPostRuns || {}) },
        lastSurfRuns: { ...(state?.lastSurfRuns || {}) }
    };
}
function mapFromRedisHashResult(result) {
    if (!result) {
        return {};
    }
    if (Array.isArray(result)) {
        const out = {};
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
        const out = {};
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
class PlannerStateStore {
    constructor() {
        this.baseUrl = String(env_1.ENV.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
        this.token = String(env_1.ENV.UPSTASH_REDIS_REST_TOKEN || "").trim();
        this.keyPrefix = String(env_1.ENV.REDIS_KEY_PREFIX || "ae").trim() || "ae";
    }
    get redisEnabled() {
        return !!(this.baseUrl && this.token);
    }
    getFallbackDayState(dayKey) {
        if (!FALLBACK_DAY_STATE.has(dayKey)) {
            FALLBACK_DAY_STATE.set(dayKey, {
                postCarry: 0,
                surfCarry: 0,
                lastPostRuns: {},
                lastSurfRuns: {}
            });
        }
        return FALLBACK_DAY_STATE.get(dayKey);
    }
    key(dayKey, suffix) {
        return `${this.keyPrefix}:planner:${dayKey}:${suffix}`;
    }
    async getHash(key) {
        if (!this.redisEnabled) {
            return {};
        }
        try {
            const encodedKey = encodeURIComponent(key);
            const res = await axios_1.default.get(`${this.baseUrl}/hgetall/${encodedKey}`, {
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            });
            return mapFromRedisHashResult(res.data?.result);
        }
        catch (err) {
            console.error("PLANNER_REDIS_HGETALL_FAIL", key, err?.message || String(err));
            return {};
        }
    }
    async setHashFields(key, fields) {
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
            await axios_1.default.get(pathParts.join("/"), {
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            });
        }
        catch (err) {
            console.error("PLANNER_REDIS_HSET_FAIL", key, err?.message || String(err));
        }
    }
    async getDayState(dayKey) {
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
    async saveCarry(dayKey, carry) {
        const normalized = {
            postCarry: toFiniteNumber(carry?.postCarry, 0),
            surfCarry: toFiniteNumber(carry?.surfCarry, 0)
        };
        if (!this.redisEnabled) {
            const state = this.getFallbackDayState(dayKey);
            state.postCarry = normalized.postCarry;
            state.surfCarry = normalized.surfCarry;
            return;
        }
        await this.setHashFields(this.key(dayKey, "carry"), normalized);
    }
    async recordActionRun(dayKey, phone, action, runIndex) {
        const normalizedPhone = String(phone || "").trim();
        if (!normalizedPhone) {
            return;
        }
        const normalizedRunIndex = Math.max(0, Math.trunc(toFiniteNumber(runIndex, 0)));
        if (!this.redisEnabled) {
            const state = this.getFallbackDayState(dayKey);
            if (action === "post") {
                state.lastPostRuns[normalizedPhone] = normalizedRunIndex;
            }
            else {
                state.lastSurfRuns[normalizedPhone] = normalizedRunIndex;
            }
            return;
        }
        const targetKey = this.key(dayKey, action === "post" ? "last_post_runs" : "last_surf_runs");
        await this.setHashFields(targetKey, {
            [normalizedPhone]: normalizedRunIndex
        });
    }
}
exports.PlannerStateStore = PlannerStateStore;
let sharedPlannerStateStore = null;
function getSharedPlannerStateStore() {
    if (!sharedPlannerStateStore) {
        sharedPlannerStateStore = new PlannerStateStore();
    }
    return sharedPlannerStateStore;
}
