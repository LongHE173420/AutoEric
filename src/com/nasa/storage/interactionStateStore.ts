import axios from "axios";
import { ENV } from "../config/env";
import { AsyncStore } from "./asyncStore";

type HashRecord = Record<string, number>;

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
    const out: HashRecord = {};
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

export class InteractionStateStore {
  private readonly baseUrl = String(ENV.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
  private readonly token = String(ENV.UPSTASH_REDIS_REST_TOKEN || "").trim();
  private readonly keyPrefix = String(ENV.REDIS_KEY_PREFIX || "ae").trim() || "ae";
  private backendAnnounced = false;

  private get redisEnabled() {
    return !!(this.baseUrl && this.token);
  }

  getBackendInfo() {
    return {
      backend: this.redisEnabled ? "redis" as const : "json_fallback" as const,
      keyPrefix: this.keyPrefix,
      redisConfigured: this.redisEnabled
    };
  }

  private announceBackend(source: "redis" | "json_fallback", storeKey?: string) {
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

  private normalizeValues(values: Iterable<string>) {
    return Array.from(
      new Set(
        Array.from(values)
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
  }

  private redisKey(storeKey: string) {
    return `${this.keyPrefix}:interaction:${storeKey}`;
  }

  private async getHash(key: string): Promise<HashRecord> {
    if (!this.redisEnabled) {
      return {};
    }

    try {
      const res = await axios.get(`${this.baseUrl}/hgetall/${encodeURIComponent(key)}`, {
        headers: {
          Authorization: `Bearer ${this.token}`
        }
      });

      return mapFromRedisHashResult(res.data?.result);
    } catch (err: any) {
      console.error("INTERACTION_REDIS_HGETALL_FAIL", key, err?.message || String(err));
      return {};
    }
  }

  private async setHashFields(key: string, fields: Record<string, string | number>) {
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
        await axios.get(pathParts.join("/"), {
          headers: {
            Authorization: `Bearer ${this.token}`
          }
        });
      } catch (err: any) {
        console.error("INTERACTION_REDIS_HSET_FAIL", key, err?.message || String(err));
      }
    }
  }

  private async deleteHashFields(key: string, fields: string[]) {
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
        await axios.get(pathParts.join("/"), {
          headers: {
            Authorization: `Bearer ${this.token}`
          }
        });
      } catch (err: any) {
        console.error("INTERACTION_REDIS_HDEL_FAIL", key, err?.message || String(err));
      }
    }
  }

  private loadLegacyValues(storeKeys: string[]) {
    const merged: string[] = [];

    for (const storeKey of storeKeys) {
      const stored = AsyncStore.getItem<string[]>(storeKey);
      if (Array.isArray(stored)) {
        merged.push(...stored.map((value) => String(value || "").trim()).filter(Boolean));
      }
    }

    return this.normalizeValues(merged);
  }

  private async seedRedisFromLegacy(key: string, values: string[]) {
    if (!this.redisEnabled || values.length === 0) {
      return;
    }

    const now = Date.now();
    const fields: Record<string, number> = {};
    values.forEach((value, index) => {
      fields[value] = now - values.length + index;
    });

    await this.setHashFields(key, fields);
  }

  async loadIds(storeKey: string, options?: { legacyKeys?: string[]; limit?: number }): Promise<Set<string>> {
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

  async saveIds(storeKey: string, values: Iterable<string>, options?: { limit?: number }) {
    const limit = Math.max(1, Number(options?.limit) || 500);
    const normalizedValues = this.normalizeValues(values).slice(-limit);

    if (!this.redisEnabled) {
      this.announceBackend("json_fallback", storeKey);
      AsyncStore.setItem(storeKey, normalizedValues);
      return;
    }

    this.announceBackend("redis", storeKey);
    const redisKey = this.redisKey(storeKey);
    const existing = await this.getHash(redisKey);
    const next: HashRecord = {};
    let timestamp = Date.now();

    for (const value of normalizedValues) {
      if (Object.prototype.hasOwnProperty.call(existing, value)) {
        next[value] = existing[value];
      } else {
        next[value] = timestamp++;
      }
    }

    const sortedEntries = Object.entries(next).sort((a, b) => toFiniteNumber(a[1], 0) - toFiniteNumber(b[1], 0));
    const keptEntries = sortedEntries.slice(-limit);
    const keptMap: HashRecord = Object.fromEntries(keptEntries);

    const toDelete = Object.keys(existing).filter((field) => !Object.prototype.hasOwnProperty.call(keptMap, field));
    const toUpsert: Record<string, number> = {};

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

let sharedInteractionStateStore: InteractionStateStore | null = null;

export function getSharedInteractionStateStore() {
  if (!sharedInteractionStateStore) {
    sharedInteractionStateStore = new InteractionStateStore();
  }
  return sharedInteractionStateStore;
}
