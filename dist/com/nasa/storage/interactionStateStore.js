"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionStateStore = void 0;
exports.getSharedInteractionStateStore = getSharedInteractionStateStore;
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
class InteractionStateStore {
    constructor() {
        this.baseUrl = String(env_1.ENV.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
        this.token = String(env_1.ENV.UPSTASH_REDIS_REST_TOKEN || "").trim();
        this.keyPrefix = String(env_1.ENV.REDIS_KEY_PREFIX || "ae").trim() || "ae";
        this.backendAnnounced = false;
    }
    get redisEnabled() {
        return !!(this.baseUrl && this.token);
    }
    getBackendInfo() {
        return {
            backend: this.redisEnabled ? "redis" : "json_fallback",
            keyPrefix: this.keyPrefix,
            redisConfigured: this.redisEnabled
        };
    }
    announceBackend(source, storeKey) {
        if (this.backendAnnounced) {
            return;
        }
        this.backendAnnounced = true;
        console.info("INTERACTION_STORE_BACKEND", {
            backend: source,
            storeKey,
            keyPrefix: this.keyPrefix
        });
    }
    normalizeValues(values) {
        return Array.from(new Set(Array.from(values)
            .map((value) => String(value || "").trim())
            .filter(Boolean)));
    }
    redisKey(storeKey) {
        return `${this.keyPrefix}:interaction:${storeKey}`;
    }
    async getHash(key) {
        if (!this.redisEnabled) {
            return {};
        }
        try {
            const res = await axios_1.default.get(`${this.baseUrl}/hgetall/${encodeURIComponent(key)}`, {
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            });
            return mapFromRedisHashResult(res.data?.result);
        }
        catch (err) {
            console.error("INTERACTION_REDIS_HGETALL_FAIL", key, err?.message || String(err));
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
                    headers: {
                        Authorization: `Bearer ${this.token}`
                    }
                });
            }
            catch (err) {
                console.error("INTERACTION_REDIS_HSET_FAIL", key, err?.message || String(err));
            }
        }
    }
    async deleteHashFields(key, fields) {
        if (!this.redisEnabled) {
            return;
        }
        const normalizedFields = fields.map((field) => String(field || "").trim()).filter(Boolean);
        if (!normalizedFields.length) {
            return;
        }
        const chunkSize = 80;
        for (let index = 0; index < normalizedFields.length; index += chunkSize) {
            const chunk = normalizedFields.slice(index, index + chunkSize);
            const pathParts = [`${this.baseUrl}/hdel`, encodeURIComponent(key)];
            for (const field of chunk) {
                pathParts.push(encodeURIComponent(field));
            }
            try {
                await axios_1.default.get(pathParts.join("/"), {
                    headers: {
                        Authorization: `Bearer ${this.token}`
                    }
                });
            }
            catch (err) {
                console.error("INTERACTION_REDIS_HDEL_FAIL", key, err?.message || String(err));
            }
        }
    }
    loadLegacyValues(storeKeys) {
        const merged = [];
        for (const storeKey of storeKeys) {
            const stored = asyncStore_1.AsyncStore.getItem(storeKey);
            if (Array.isArray(stored)) {
                merged.push(...stored.map((value) => String(value || "").trim()).filter(Boolean));
            }
        }
        return this.normalizeValues(merged);
    }
    async seedRedisFromLegacy(key, values) {
        if (!this.redisEnabled || values.length === 0) {
            return;
        }
        const now = Date.now();
        const fields = {};
        values.forEach((value, index) => {
            fields[value] = now - values.length + index;
        });
        await this.setHashFields(key, fields);
    }
    async loadIds(storeKey, options) {
        const limit = Math.max(1, Number(options?.limit) || 500);
        const legacyKeys = [storeKey, ...(options?.legacyKeys || [])];
        if (!this.redisEnabled) {
            this.announceBackend("json_fallback", storeKey);
            return new Set(this.loadLegacyValues(legacyKeys).slice(-limit));
        }
        this.announceBackend("redis", storeKey);
        const redisKey = this.redisKey(storeKey);
        const existing = await this.getHash(redisKey);
        let entries = Object.entries(existing);
        if (!entries.length) {
            const legacyValues = this.loadLegacyValues(legacyKeys).slice(-limit);
            await this.seedRedisFromLegacy(redisKey, legacyValues);
            if (legacyValues.length > 0) {
                console.info("INTERACTION_STORE_SEEDED_FROM_LEGACY", {
                    storeKey,
                    redisKey,
                    count: legacyValues.length
                });
            }
            return new Set(legacyValues);
        }
        if (entries.length > limit) {
            entries.sort((a, b) => toFiniteNumber(a[1], 0) - toFiniteNumber(b[1], 0));
            const toDelete = entries.slice(0, Math.max(0, entries.length - limit)).map(([field]) => field);
            await this.deleteHashFields(redisKey, toDelete);
            entries = entries.slice(-limit);
        }
        entries.sort((a, b) => toFiniteNumber(a[1], 0) - toFiniteNumber(b[1], 0));
        return new Set(entries.map(([field]) => field));
    }
    async saveIds(storeKey, values, options) {
        const limit = Math.max(1, Number(options?.limit) || 500);
        const normalizedValues = this.normalizeValues(values).slice(-limit);
        if (!this.redisEnabled) {
            this.announceBackend("json_fallback", storeKey);
            asyncStore_1.AsyncStore.setItem(storeKey, normalizedValues);
            return;
        }
        this.announceBackend("redis", storeKey);
        const redisKey = this.redisKey(storeKey);
        const existing = await this.getHash(redisKey);
        const next = {};
        let timestamp = Date.now();
        for (const value of normalizedValues) {
            if (Object.prototype.hasOwnProperty.call(existing, value)) {
                next[value] = existing[value];
            }
            else {
                next[value] = timestamp++;
            }
        }
        const sortedEntries = Object.entries(next).sort((a, b) => toFiniteNumber(a[1], 0) - toFiniteNumber(b[1], 0));
        const keptEntries = sortedEntries.slice(-limit);
        const keptMap = Object.fromEntries(keptEntries);
        const toDelete = Object.keys(existing).filter((field) => !Object.prototype.hasOwnProperty.call(keptMap, field));
        const toUpsert = {};
        for (const [field, value] of keptEntries) {
            if (!Object.prototype.hasOwnProperty.call(existing, field) || toFiniteNumber(existing[field], 0) !== toFiniteNumber(value, 0)) {
                toUpsert[field] = value;
            }
        }
        await Promise.all([
            this.setHashFields(redisKey, toUpsert),
            this.deleteHashFields(redisKey, toDelete)
        ]);
    }
}
exports.InteractionStateStore = InteractionStateStore;
let sharedInteractionStateStore = null;
function getSharedInteractionStateStore() {
    if (!sharedInteractionStateStore) {
        sharedInteractionStateStore = new InteractionStateStore();
    }
    return sharedInteractionStateStore;
}
