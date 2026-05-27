"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionService = void 0;
const feedApiService_1 = require("../../api/feed/feedApiService");
const surfApiService_1 = require("../../api/surf/surfApiService");
const reactionApiService_1 = require("../../api/reaction/reactionApiService");
const AccountMissionService_1 = require("../missions/AccountMissionService");
const interactionStateStore_1 = require("../../storage/interactionStateStore");
const env_1 = require("../../config/env");
class InteractionService {
    constructor(logger, proxyAgent, currentPhone, currentUserId) {
        this.logger = logger;
        this.proxyAgent = proxyAgent;
        this.currentPhone = currentPhone;
        this.currentUserId = currentUserId;
        this.interactionStore = (0, interactionStateStore_1.getSharedInteractionStateStore)();
    }
    getInteractionStoreKey() {
        return `interactedPosts:${String(this.currentPhone || "").trim().toLowerCase()}`;
    }
    getReactedPostStoreKey() {
        return `reactedPosts:${String(this.currentPhone || "").trim().toLowerCase()}`;
    }
    getStoreTypeFromKey(storeKey) {
        if (storeKey.startsWith("reactedPosts:"))
            return "reactedPosts";
        if (storeKey.startsWith("interactedPosts:"))
            return "interactedPosts";
        return "unknown";
    }
    logRedisStoreOperation(event, storeKey, count) {
        const backendInfo = this.interactionStore.getBackendInfo();
        if (backendInfo.backend !== "redis") {
            return;
        }
        this.logger.info(event, {
            phone: this.currentPhone,
            backend: backendInfo.backend,
            keyPrefix: backendInfo.keyPrefix,
            storeKey,
            storeType: this.getStoreTypeFromKey(storeKey),
            count: Math.max(0, Number(count) || 0)
        });
    }
    async getSeenPostIds() {
        try {
            const key = this.getInteractionStoreKey();
            const values = await this.interactionStore.loadIds(key, { limit: 300 });
            this.logRedisStoreOperation("INTERACTION_REDIS_LOAD", key, values.size);
            return values;
        }
        catch (e) {
            this.logger.warn("LOAD_SEEN_POST_IDS_FAILED", { phone: this.currentPhone, err: e.message || String(e) });
            return new Set();
        }
    }
    async saveSeenPostIds(values) {
        try {
            const key = this.getInteractionStoreKey();
            const snapshot = Array.from(values);
            await this.interactionStore.saveIds(key, snapshot, { limit: 300 });
            this.logRedisStoreOperation("INTERACTION_REDIS_SAVE", key, snapshot.length);
        }
        catch (e) {
            this.logger.warn("SAVE_SEEN_POST_IDS_FAILED", { phone: this.currentPhone, err: e.message || String(e) });
        }
    }
    async getReactedPostIds() {
        try {
            const key = this.getReactedPostStoreKey();
            const values = await this.interactionStore.loadIds(key, { limit: 500 });
            this.logRedisStoreOperation("INTERACTION_REDIS_LOAD", key, values.size);
            return values;
        }
        catch (e) {
            this.logger.warn("LOAD_REACTED_POST_IDS_FAILED", { phone: this.currentPhone, err: e.message || String(e) });
            return new Set();
        }
    }
    async saveReactedPostIds(values) {
        try {
            const key = this.getReactedPostStoreKey();
            const snapshot = Array.from(values);
            await this.interactionStore.saveIds(key, snapshot, { limit: 500 });
            this.logRedisStoreOperation("INTERACTION_REDIS_SAVE", key, snapshot.length);
        }
        catch (e) {
            this.logger.warn("SAVE_REACTED_POST_IDS_FAILED", { phone: this.currentPhone, err: e.message || String(e) });
        }
    }
    extractReactionCodes(payload) {
        try {
            const candidates = [];
            if (Array.isArray(payload))
                candidates.push(...payload);
            if (Array.isArray(payload?.data))
                candidates.push(...payload.data);
            if (Array.isArray(payload?.data?.data))
                candidates.push(...payload.data.data);
            if (Array.isArray(payload?.data?.items))
                candidates.push(...payload.data.items);
            if (Array.isArray(payload?.items))
                candidates.push(...payload.items);
            const codes = candidates
                .map((item) => String(item?.reactionTypeCode ||
                item?.code ||
                item?.type ||
                item?.name ||
                "").trim().toUpperCase())
                .filter(Boolean);
            return Array.from(new Set(codes));
        }
        catch (e) {
            this.logger.error("EXTRACT_REACTION_CODES_ERROR", { err: e.message || String(e) });
            return [];
        }
    }
    normalizeId(value) {
        const id = String(value ?? "").trim();
        return id || null;
    }
    extractPostAuthorId(post) {
        return this.normalizeId(post?.authorId ??
            post?.userId ??
            post?.accountId ??
            post?.ownerId ??
            post?.createdBy ??
            post?.author?.id ??
            post?.author?.userId ??
            post?.author?.accountId ??
            post?.user?.id ??
            post?.user?.userId ??
            post?.user?.accountId ??
            post?.account?.id ??
            post?.account?.userId ??
            post?.account?.accountId);
    }
    extractPostAuthorName(post) {
        return String(post?.authorName ??
            post?.author?.name ??
            post?.author?.fullName ??
            post?.user?.name ??
            post?.user?.fullName ??
            post?.account?.name ??
            "").trim();
    }
    sanitizePostText(value) {
        return String(value ?? "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }
    parseStructuredContentSegments(raw) {
        const segments = [];
        const input = String(raw || "").trim();
        if (!input)
            return segments;
        for (let i = 0; i < input.length; i++) {
            if (input[i] !== "!" || input[i + 1] !== "{")
                continue;
            let cursor = i + 1;
            let depth = 0;
            let inString = false;
            let escaped = false;
            for (; cursor < input.length; cursor++) {
                const ch = input[cursor];
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (ch === "\\") {
                    escaped = true;
                    continue;
                }
                if (ch === "\"") {
                    inString = !inString;
                    continue;
                }
                if (inString)
                    continue;
                if (ch === "{")
                    depth++;
                if (ch === "}") {
                    depth--;
                    if (depth === 0) {
                        segments.push(input.slice(i + 1, cursor + 1));
                        i = cursor;
                        break;
                    }
                }
            }
        }
        return segments;
    }
    extractTextFromStructuredContent(raw) {
        const input = String(raw || "").trim();
        if (!input)
            return "";
        const texts = [];
        const segments = this.parseStructuredContentSegments(input);
        if (segments.length === 0 && input.startsWith("{") && input.endsWith("}")) {
            segments.push(input);
        }
        for (const segment of segments) {
            try {
                const parsed = JSON.parse(segment);
                const text = this.sanitizePostText(parsed?.text ??
                    parsed?.content ??
                    parsed?.caption ??
                    parsed?.description ??
                    parsed?.title ??
                    "");
                if (text) {
                    texts.push(text);
                }
            }
            catch {
                continue;
            }
        }
        return texts.join(" ").trim();
    }
    extractPostText(post) {
        const directCandidates = [
            post?.caption,
            post?.text,
            post?.description,
            post?.title,
            post?.message,
            post?.content?.text,
            post?.content?.caption,
            post?.content?.description
        ];
        for (const candidate of directCandidates) {
            const normalized = this.sanitizePostText(candidate);
            if (normalized) {
                return normalized.slice(0, 700);
            }
        }
        const rawContent = typeof post?.content === "string" ? post.content.trim() : "";
        if (!rawContent)
            return "";
        const structuredText = this.extractTextFromStructuredContent(rawContent);
        if (structuredText) {
            return structuredText.slice(0, 700);
        }
        if (rawContent.startsWith("!{"))
            return "";
        return this.sanitizePostText(rawContent).slice(0, 700);
    }
    async handleFeedAndInteract(accessToken, h, ctx, doMission) {
        try {
            const missionSvc = new AccountMissionService_1.AccountMissionService(this.logger, this.proxyAgent);
            const phone = String(ctx?.phone || this.currentPhone || "").trim().toLowerCase();
            const cachedDailyPointState = phone ? await missionSvc.getCachedDailyPointSummary(phone) : null;
            const lightFeedMode = Boolean(cachedDailyPointState &&
                cachedDailyPointState.dailyRemainingPoint !== null &&
                cachedDailyPointState.dailyRemainingPoint <= 0);
            const backendInfo = this.interactionStore.getBackendInfo();
            const backendStateKey = `${backendInfo.backend}:${backendInfo.keyPrefix}:${lightFeedMode ? "light" : "full"}`;
            if (!InteractionService.announcedStoreStates.has(backendStateKey)) {
                InteractionService.announcedStoreStates.add(backendStateKey);
                this.logger.info("INTERACTION_STORE_STATUS", {
                    ...ctx,
                    backend: backendInfo.backend,
                    keyPrefix: backendInfo.keyPrefix,
                    redisConfigured: backendInfo.redisConfigured,
                    lightFeedMode
                });
            }
            const pagesToLoad = lightFeedMode
                ? Math.max(1, Number(env_1.ENV.FEED_LIGHT_MODE_PAGES || 1))
                : Math.max(1, Number(env_1.ENV.FEED_PAGES || 3));
            let allItems = [];
            let lastPostId = "";
            let lastCreatedAt = Date.now();
            const reactionCodes = ["LIKE"];
            if (lightFeedMode) {
                this.logger.info("FEED_LIGHT_MODE_NO_DAILY_POINT", {
                    ...ctx,
                    dayKey: cachedDailyPointState?.dayKey,
                    dailyRemainingPoint: cachedDailyPointState?.dailyRemainingPoint,
                    dailyEarnedPoint: cachedDailyPointState?.dailyEarnedPoint,
                    dailyPointLimit: cachedDailyPointState?.dailyPointLimit,
                    pagesToLoad
                });
            }
            await reactionApiService_1.ReactionApiService.listReactions(accessToken, h, 50, 0, this.proxyAgent)
                .then(reactionRes => {
                const codes = this.extractReactionCodes(reactionRes.data);
                if (codes.length > 0) {
                    reactionCodes.length = 0;
                    reactionCodes.push(...codes);
                }
            })
                .catch((err) => {
                this.logger.warn("FAILED_TO_FETCH_REACTION_CODES", { ...ctx, err: err?.message });
            });
            this.logger.info("REACTION_CODES_READY", { ...ctx, reactionCodes });
            for (let page = 0; page < pagesToLoad; page++) {
                await doMission(`FeedHome_Page_${page + 1}`, async () => {
                    let res = await feedApiService_1.FeedApiService.getFeedHome(accessToken, h, lastPostId, lastCreatedAt, 10, this.proxyAgent);
                    let isEmpty = true;
                    if (res.data) {
                        if (Array.isArray(res.data) && res.data.length > 0)
                            isEmpty = false;
                        else if (Array.isArray(res.data.data) && res.data.data.length > 0)
                            isEmpty = false;
                        else if (res.data.data && Array.isArray(res.data.data.items) && res.data.data.items.length > 0)
                            isEmpty = false;
                        else if (Array.isArray(res.data.items) && res.data.items.length > 0)
                            isEmpty = false;
                    }
                    if (isEmpty && page === 0) {
                        res = await feedApiService_1.FeedApiService.getFeedHomeFree(h, 10, 0, this.proxyAgent);
                    }
                    let items = [];
                    if (res.data) {
                        if (Array.isArray(res.data))
                            items = res.data;
                        else if (Array.isArray(res.data.data))
                            items = res.data.data;
                        else if (res.data.data && Array.isArray(res.data.data.items))
                            items = res.data.data.items;
                        else if (Array.isArray(res.data.items))
                            items = res.data.items;
                        else if (res.data.data && res.data.data.data && Array.isArray(res.data.data.data))
                            items = res.data.data.data;
                    }
                    if (items.length > 0) {
                        const lastItem = items[items.length - 1];
                        lastPostId = lastItem.id || "";
                        lastCreatedAt = lastItem.createdAt || Date.now();
                        allItems = allItems.concat(items);
                    }
                    return res;
                }, ctx);
                if (page < pagesToLoad - 1)
                    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1500));
            }
            if (!lightFeedMode) {
                await doMission("SurfHome", () => surfApiService_1.SurfApiService.getSurfHome(accessToken, h, "", Math.floor(Date.now() / 1000), 4, this.proxyAgent), ctx);
            }
            this.logger.info("DEBUG_FEEDHOME", { itemsLength: allItems.length, pagesScrolled: pagesToLoad });
            if (lightFeedMode) {
                this.logger.info("FEED_LIGHT_MODE_CONTINUE_FOR_WEEKLY_PROGRESS", {
                    ...ctx,
                    itemsLength: allItems.length,
                    pagesScrolled: pagesToLoad,
                    dailyRemainingPoint: cachedDailyPointState?.dailyRemainingPoint,
                    dailyEarnedPoint: cachedDailyPointState?.dailyEarnedPoint,
                    dailyPointLimit: cachedDailyPointState?.dailyPointLimit
                });
            }
            if (allItems.length > 0) {
                const uniqueItems = Array.from(new Map(allItems.map(i => [i.id, i])).values());
                const seenPostIds = await this.getSeenPostIds();
                const reactedPostIds = await this.getReactedPostIds();
                const unseenItems = uniqueItems.filter((item) => !seenPostIds.has(String(item?.id || "")));
                const interactItems = uniqueItems;
                let reactionPlan = await missionSvc.getActionRewardPlan(accessToken, h, ctx, "REACTION");
                const maxReactionsPerRun = Math.max(0, Number(env_1.ENV.INTERACTION_MAX_REACTIONS_PER_RUN || 0));
                let reactionsDoneThisRun = 0;
                let reactionSkipLogged = false;
                let reactionLimitLogged = false;
                let stopForDailyPoint = false;
                const logActionSkip = (category, plan) => {
                    const skipEvent = plan?.reason === "NO_DAILY_POINT"
                        ? "ACTION_REWARD_ACTION_SKIPPED_NO_DAILY_POINT"
                        : plan?.reason === "ALL_SCOPES_CLAIMED"
                            ? "ACTION_REWARD_ACTION_SKIPPED_ALL_SCOPES_CLAIMED"
                            : "ACTION_REWARD_ACTION_SKIPPED_NO_ACTIVE_MISSION";
                    this.logger.info(skipEvent, {
                        ...ctx,
                        category,
                        reason: plan?.reason || null,
                        activeScopes: plan?.activeScopes || [],
                        dailyPointState: plan?.dailyPointState || null
                    });
                };
                this.logger.info("MISSION_ACTION_DEPENDENT_START", {
                    ...ctx,
                    parsedItemCount: interactItems.length,
                    uniqueItemCount: uniqueItems.length,
                    unseenItemCount: unseenItems.length,
                    seenItemCount: seenPostIds.size,
                    reactedPostCount: reactedPostIds.size,
                    maxReactionsPerRun
                });
                if (interactItems.length === 0) {
                    this.logger.info("NO_POSTS_FOR_INTERACTION", {
                        ...ctx,
                        uniqueItemCount: uniqueItems.length,
                        seenItemCount: seenPostIds.size
                    });
                    return;
                }
                for (let i = 0; i < interactItems.length; i++) {
                    const reactionLimitReached = reactionsDoneThisRun >= maxReactionsPerRun;
                    if (stopForDailyPoint ||
                        (!reactionPlan.shouldDoAction || reactionLimitReached)) {
                        break;
                    }
                    const post = interactItems[i];
                    const postId = post.id;
                    const authorId = this.extractPostAuthorId(post);
                    const currentUserId = this.normalizeId(this.currentUserId);
                    const isOwnPost = Boolean(authorId && currentUserId && authorId === currentUserId);
                    const alreadyReacted = reactedPostIds.has(String(postId));
                    if (!reactionPlan.shouldDoAction) {
                        if (!reactionSkipLogged) {
                            reactionSkipLogged = true;
                            logActionSkip("REACTION", reactionPlan);
                        }
                    }
                    else if (reactionLimitReached) {
                        if (!reactionLimitLogged) {
                            reactionLimitLogged = true;
                            this.logger.info("ACTION_REWARD_ACTION_SKIPPED_RUN_LIMIT", {
                                ...ctx,
                                category: "REACTION",
                                done: reactionsDoneThisRun,
                                limit: maxReactionsPerRun
                            });
                        }
                    }
                    else if (alreadyReacted) {
                        this.logger.info("SKIP_REACTION_ALREADY_REACTED", { ...ctx, postId: String(postId) });
                    }
                    else if (isOwnPost) {
                        this.logger.info("SKIP_REACTION_OWN_POST", { ...ctx, postId: String(postId), authorId });
                    }
                    else {
                        const rType = reactionCodes[Math.floor(Math.random() * reactionCodes.length)] || "LIKE";
                        const reactionCtx = { ...ctx, postId: String(postId), reactionType: rType };
                        this.logger.info("REACTION_SELECTED", reactionCtx);
                        await doMission(`PostReaction_${postId}`, () => reactionApiService_1.ReactionApiService.sendReaction(accessToken, postId, rType, h, this.proxyAgent), reactionCtx);
                        const rewardResult = await missionSvc.handleActionRewardClaim(accessToken, h, ctx, doMission, "REACTION");
                        reactedPostIds.add(String(postId));
                        reactionsDoneThisRun++;
                        await this.saveReactedPostIds(reactedPostIds);
                        if (rewardResult.dailyPointExhausted) {
                            stopForDailyPoint = true;
                            break;
                        }
                        if (rewardResult.planChanged || rewardResult.claimedAny) {
                            reactionPlan = await missionSvc.getActionRewardPlan(accessToken, h, ctx, "REACTION");
                        }
                    }
                    seenPostIds.add(String(postId));
                }
                await this.saveSeenPostIds(seenPostIds);
                await this.saveReactedPostIds(reactedPostIds);
            }
        }
        catch (e) {
            this.logger.error("INTERACT_WITH_POSTS_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
exports.InteractionService = InteractionService;
InteractionService.announcedStoreStates = new Set();
