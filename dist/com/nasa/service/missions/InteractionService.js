"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionService = void 0;
const feedApiService_1 = require("../../api/feed/feedApiService");
const surfApiService_1 = require("../../api/surf/surfApiService");
const reactionApiService_1 = require("../../api/reaction/reactionApiService");
const AccountMissionService_1 = require("./AccountMissionService");
const asyncStore_1 = require("../../storage/asyncStore");
class InteractionService {
    constructor(logger, proxyAgent, currentPhone) {
        this.logger = logger;
        this.proxyAgent = proxyAgent;
        this.currentPhone = currentPhone;
    }
    getInteractionStoreKey() {
        return `interactedPosts:${String(this.currentPhone || "").trim().toLowerCase()}`;
    }
    getSeenPostIds() {
        try {
            const key = this.getInteractionStoreKey();
            const stored = asyncStore_1.AsyncStore.getItem(key);
            return new Set(Array.isArray(stored) ? stored.map(v => String(v)) : []);
        }
        catch (e) {
            this.logger.warn("LOAD_SEEN_POST_IDS_FAILED", { phone: this.currentPhone, err: e.message || String(e) });
            return new Set();
        }
    }
    saveSeenPostIds(values) {
        try {
            const key = this.getInteractionStoreKey();
            const unique = Array.from(new Set(Array.from(values).map(v => String(v)).filter(Boolean)));
            asyncStore_1.AsyncStore.setItem(key, unique.slice(-300));
        }
        catch (e) {
            this.logger.warn("SAVE_SEEN_POST_IDS_FAILED", { phone: this.currentPhone, err: e.message || String(e) });
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
    async handleFeedAndInteract(accessToken, h, ctx, doMission) {
        try {
            const missionSvc = new AccountMissionService_1.AccountMissionService(this.logger, this.proxyAgent);
            let allItems = [];
            let lastPostId = "";
            let lastCreatedAt = Date.now();
            const reactionCodes = ["LIKE"];
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
            for (let page = 0; page < 3; page++) {
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
                if (page < 2)
                    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1500));
            }
            await doMission("SurfHome", () => surfApiService_1.SurfApiService.getSurfHome(accessToken, h, "", Math.floor(Date.now() / 1000), 4, this.proxyAgent), ctx);
            this.logger.info("DEBUG_FEEDHOME", { itemsLength: allItems.length, pagesScrolled: 3 });
            if (allItems.length > 0) {
                const uniqueItems = Array.from(new Map(allItems.map(i => [i.id, i])).values());
                const seenPostIds = this.getSeenPostIds();
                const unseenItems = uniqueItems.filter((item) => !seenPostIds.has(String(item?.id || "")));
                const interactItems = unseenItems.slice(0, 5);
                this.logger.info("MISSION_ACTION_DEPENDENT_START", {
                    ...ctx,
                    parsedItemCount: interactItems.length,
                    uniqueItemCount: uniqueItems.length,
                    unseenItemCount: unseenItems.length,
                    seenItemCount: seenPostIds.size
                });
                if (interactItems.length === 0) {
                    this.logger.info("NO_UNSEEN_POSTS_FOR_INTERACTION", {
                        ...ctx,
                        uniqueItemCount: uniqueItems.length,
                        seenItemCount: seenPostIds.size
                    });
                    return;
                }
                for (let i = 0; i < interactItems.length; i++) {
                    const post = interactItems[i];
                    const postId = post.id;
                    const rType = reactionCodes[Math.floor(Math.random() * reactionCodes.length)] || "LIKE";
                    await doMission(`PostReaction_${postId}`, () => reactionApiService_1.ReactionApiService.sendReaction(accessToken, postId, rType, h, this.proxyAgent), ctx);
                    await missionSvc.handleActionRewardClaim(accessToken, h, ctx, doMission, "REACTION");
                    await doMission(`PostShare_${postId}`, () => feedApiService_1.FeedApiService.repostPost(accessToken, postId, h, this.proxyAgent), ctx);
                    seenPostIds.add(String(postId));
                }
                this.saveSeenPostIds(seenPostIds);
            }
        }
        catch (e) {
            this.logger.error("INTERACT_WITH_POSTS_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
exports.InteractionService = InteractionService;
