import { FeedApiService } from "../../api/feed/feedApiService";
import { SurfApiService } from "../../api/surf/surfApiService";
import { ReactionApiService } from "../../api/reaction/reactionApiService";
import { CommentApiService } from "../../api/comment/commentApiService";
import { OpenAiCommentService } from "../../api/openai/openAiCommentService";
import { AccountMissionService } from "../missions/AccountMissionService";
import { AsyncStore } from "../../storage/asyncStore";
import { Log } from "../../utils/log";

type AppLogger = ReturnType<typeof Log.getLogger>;

export class InteractionService {
    constructor(
        private readonly logger: AppLogger,
        private readonly proxyAgent: any,
        private readonly currentPhone: string,
        private readonly currentUserId?: string | null
    ) { }

    private getInteractionStoreKey() {
        return `interactedPosts:${String(this.currentPhone || "").trim().toLowerCase()}`;
    }

    private getCommentedPostStoreKey() {
        return `commentedPosts:${String(this.currentPhone || "").trim().toLowerCase()}`;
    }

    private getReactedPostStoreKey() {
        return `reactedPosts:${String(this.currentPhone || "").trim().toLowerCase()}`;
    }

    private getSeenPostIds(): Set<string> {
        try {
            const key = this.getInteractionStoreKey();
            const stored = AsyncStore.getItem<string[]>(key);
            return new Set(Array.isArray(stored) ? stored.map(v => String(v)) : []);
        } catch (e: any) {
            this.logger.warn("LOAD_SEEN_POST_IDS_FAILED", { phone: this.currentPhone, err: e.message || String(e) });
            return new Set();
        }
    }

    private saveSeenPostIds(values: Iterable<string>) {
        try {
            const key = this.getInteractionStoreKey();
            const unique = Array.from(new Set(Array.from(values).map(v => String(v)).filter(Boolean)));
            AsyncStore.setItem(key, unique.slice(-300));
        } catch (e: any) {
            this.logger.warn("SAVE_SEEN_POST_IDS_FAILED", { phone: this.currentPhone, err: e.message || String(e) });
        }
    }

    private getCommentedPostIds(): Set<string> {
        try {
            const key = this.getCommentedPostStoreKey();
            const stored = AsyncStore.getItem<string[]>(key);
            const legacy = AsyncStore.getItem<string[]>(this.getInteractionStoreKey());
            const merged = [
                ...(Array.isArray(legacy) ? legacy : []),
                ...(Array.isArray(stored) ? stored : [])
            ];
            return new Set(merged.map(v => String(v)));
        } catch (e: any) {
            this.logger.warn("LOAD_COMMENTED_POST_IDS_FAILED", { phone: this.currentPhone, err: e.message || String(e) });
            return new Set();
        }
    }

    private saveCommentedPostIds(values: Iterable<string>) {
        try {
            const key = this.getCommentedPostStoreKey();
            const unique = Array.from(new Set(Array.from(values).map(v => String(v)).filter(Boolean)));
            AsyncStore.setItem(key, unique.slice(-500));
        } catch (e: any) {
            this.logger.warn("SAVE_COMMENTED_POST_IDS_FAILED", { phone: this.currentPhone, err: e.message || String(e) });
        }
    }

    private getReactedPostIds(): Set<string> {
        try {
            const key = this.getReactedPostStoreKey();
            const stored = AsyncStore.getItem<string[]>(key);
            return new Set(Array.isArray(stored) ? stored.map(v => String(v)) : []);
        } catch (e: any) {
            this.logger.warn("LOAD_REACTED_POST_IDS_FAILED", { phone: this.currentPhone, err: e.message || String(e) });
            return new Set();
        }
    }

    private saveReactedPostIds(values: Iterable<string>) {
        try {
            const key = this.getReactedPostStoreKey();
            const unique = Array.from(new Set(Array.from(values).map(v => String(v)).filter(Boolean)));
            AsyncStore.setItem(key, unique.slice(-500));
        } catch (e: any) {
            this.logger.warn("SAVE_REACTED_POST_IDS_FAILED", { phone: this.currentPhone, err: e.message || String(e) });
        }
    }

    private extractReactionCodes(payload: any): string[] {
        try {
            const candidates: any[] = [];

            if (Array.isArray(payload)) candidates.push(...payload);
            if (Array.isArray(payload?.data)) candidates.push(...payload.data);
            if (Array.isArray(payload?.data?.data)) candidates.push(...payload.data.data);
            if (Array.isArray(payload?.data?.items)) candidates.push(...payload.data.items);
            if (Array.isArray(payload?.items)) candidates.push(...payload.items);

            const codes = candidates
                .map((item) => String(
                    item?.reactionTypeCode ||
                    item?.code ||
                    item?.type ||
                    item?.name ||
                    ""
                ).trim().toUpperCase())
                .filter(Boolean);

            return Array.from(new Set(codes));
        } catch (e: any) {
            this.logger.error("EXTRACT_REACTION_CODES_ERROR", { err: e.message || String(e) });
            return [];
        }
    }

    private normalizeId(value: any) {
        const id = String(value ?? "").trim();
        return id || null;
    }

    private extractPostAuthorId(post: any) {
        return this.normalizeId(
            post?.authorId ??
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
            post?.account?.accountId
        );
    }

    private extractPostAuthorName(post: any) {
        return String(
            post?.authorName ??
            post?.author?.name ??
            post?.author?.fullName ??
            post?.user?.name ??
            post?.user?.fullName ??
            post?.account?.name ??
            ""
        ).trim();
    }

    private sanitizePostText(value: any) {
        return String(value ?? "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    private parseStructuredContentSegments(raw: string) {
        const segments: string[] = [];
        const input = String(raw || "").trim();

        if (!input) return segments;

        for (let i = 0; i < input.length; i++) {
            if (input[i] !== "!" || input[i + 1] !== "{") continue;

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

                if (inString) continue;

                if (ch === "{") depth++;
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

    private extractTextFromStructuredContent(raw: string) {
        const input = String(raw || "").trim();
        if (!input) return "";

        const texts: string[] = [];
        const segments = this.parseStructuredContentSegments(input);

        if (segments.length === 0 && input.startsWith("{") && input.endsWith("}")) {
            segments.push(input);
        }

        for (const segment of segments) {
            try {
                const parsed = JSON.parse(segment);
                const text = this.sanitizePostText(
                    parsed?.text ??
                    parsed?.content ??
                    parsed?.caption ??
                    parsed?.description ??
                    parsed?.title ??
                    ""
                );

                if (text) {
                    texts.push(text);
                }
            } catch {
                continue;
            }
        }

        return texts.join(" ").trim();
    }

    private extractPostText(post: any) {
        const directCandidates = [
            post?.caption,
            post?.text,
            post?.description,
            post?.title,
            post?.message,
            post?.status,
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
        if (!rawContent) return "";

        const structuredText = this.extractTextFromStructuredContent(rawContent);
        if (structuredText) {
            return structuredText.slice(0, 700);
        }

        if (rawContent.startsWith("!{")) return "";
        return this.sanitizePostText(rawContent).slice(0, 700);
    }

    private async generateCommentForPost(input: { postText: string; authorName?: string; }, ctx: any) {
        const openAiDebug = OpenAiCommentService.getDebugInfo();

        if (!OpenAiCommentService.isEnabled()) {
            this.logger.warn("OPENAI_COMMENT_DISABLED", { ...ctx, reason: "OPENAI_API_KEY_EMPTY", openAi: openAiDebug });
            return null;
        }

        try {
            const generated = await OpenAiCommentService.generateComment(input);

            if (generated) {
                this.logger.info("OPENAI_COMMENT_GENERATED", { ...ctx, length: generated.length, openAi: openAiDebug });
                return generated;
            }

            this.logger.warn("OPENAI_COMMENT_EMPTY_RESPONSE", {
                ...ctx,
                openAi: openAiDebug,
                responseMeta: OpenAiCommentService.getLastResponseMeta()
            });
        } catch (e: any) {
            this.logger.warn("OPENAI_COMMENT_GENERATION_FAILED", {
                ...ctx,
                err: e.message || String(e),
                status: e.response?.status,
                responseData: e.response?.data,
                openAi: openAiDebug,
                responseMeta: OpenAiCommentService.getLastResponseMeta()
            });
        }

        return null;
    }

    async handleFeedAndInteract(accessToken: string, h: any, ctx: any, doMission: Function) {
        try {
            const missionSvc = new AccountMissionService(this.logger, this.proxyAgent);
            const phone = String(ctx?.phone || this.currentPhone || "").trim().toLowerCase();
            const cachedDailyPointState = phone ? missionSvc.getCachedDailyPointSummary(phone) : null;
            const lightFeedMode = Boolean(
                cachedDailyPointState &&
                cachedDailyPointState.dailyRemainingPoint !== null &&
                cachedDailyPointState.dailyRemainingPoint <= 0
            );
            const pagesToLoad = lightFeedMode ? 1 : 3;
            let allItems: any[] = [];
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

            await ReactionApiService.listReactions(accessToken, h, 50, 0, this.proxyAgent)
                .then(reactionRes => {
                    const codes = this.extractReactionCodes(reactionRes.data);
                    if (codes.length > 0) {
                        reactionCodes.length = 0;
                        reactionCodes.push(...codes);
                    }
                })
                .catch((err: any) => {
                    this.logger.warn("FAILED_TO_FETCH_REACTION_CODES", { ...ctx, err: err?.message });
                });

            this.logger.info("REACTION_CODES_READY", { ...ctx, reactionCodes });

            for (let page = 0; page < pagesToLoad; page++) {
                await doMission(`FeedHome_Page_${page + 1}`, async () => {
                    let res = await FeedApiService.getFeedHome(accessToken, h, lastPostId, lastCreatedAt, 10, this.proxyAgent);
                    let isEmpty = true;
                    if (res.data) {
                        if (Array.isArray(res.data) && res.data.length > 0) isEmpty = false;
                        else if (Array.isArray(res.data.data) && res.data.data.length > 0) isEmpty = false;
                        else if (res.data.data && Array.isArray(res.data.data.items) && res.data.data.items.length > 0) isEmpty = false;
                        else if (Array.isArray(res.data.items) && res.data.items.length > 0) isEmpty = false;
                    }
                    if (isEmpty && page === 0) {
                        res = await FeedApiService.getFeedHomeFree(h, 10, 0, this.proxyAgent);
                    }

                    let items: any[] = [];
                    if (res.data) {
                        if (Array.isArray(res.data)) items = res.data;
                        else if (Array.isArray(res.data.data)) items = res.data.data;
                        else if (res.data.data && Array.isArray(res.data.data.items)) items = res.data.data.items;
                        else if (Array.isArray(res.data.items)) items = res.data.items;
                        else if (res.data.data && res.data.data.data && Array.isArray(res.data.data.data)) items = res.data.data.data;
                    }

                    if (items.length > 0) {
                        const lastItem = items[items.length - 1];
                        lastPostId = lastItem.id || "";
                        lastCreatedAt = lastItem.createdAt || Date.now();
                        allItems = allItems.concat(items);
                    }
                    return res;
                }, ctx);

                if (page < pagesToLoad - 1) await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1500));
            }

            if (!lightFeedMode) {
                await doMission("SurfHome", () => SurfApiService.getSurfHome(accessToken, h, "", Math.floor(Date.now() / 1000), 4, this.proxyAgent), ctx);
            }

            this.logger.info("DEBUG_FEEDHOME", { itemsLength: allItems.length, pagesScrolled: pagesToLoad });

            if (lightFeedMode) {
                this.logger.info("FEED_LIGHT_MODE_DONE", {
                    ...ctx,
                    itemsLength: allItems.length,
                    pagesScrolled: pagesToLoad,
                    dailyRemainingPoint: cachedDailyPointState?.dailyRemainingPoint,
                    dailyEarnedPoint: cachedDailyPointState?.dailyEarnedPoint,
                    dailyPointLimit: cachedDailyPointState?.dailyPointLimit
                });
                return;
            }

            if (allItems.length > 0) {
                const uniqueItems = Array.from(new Map(allItems.map(i => [i.id, i])).values());
                const seenPostIds = this.getSeenPostIds();
                const commentedPostIds = this.getCommentedPostIds();
                const reactedPostIds = this.getReactedPostIds();
                const unseenItems = uniqueItems.filter((item) => !seenPostIds.has(String(item?.id || "")));
                const interactItems = uniqueItems;

                this.logger.info("MISSION_ACTION_DEPENDENT_START", {
                    ...ctx,
                    parsedItemCount: interactItems.length,
                    uniqueItemCount: uniqueItems.length,
                    unseenItemCount: unseenItems.length,
                    seenItemCount: seenPostIds.size,
                    reactedPostCount: reactedPostIds.size
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
                    const post = interactItems[i];
                    const postId = post.id;
                    const authorId = this.extractPostAuthorId(post);
                    const currentUserId = this.normalizeId(this.currentUserId);
                    const isOwnPost = Boolean(authorId && currentUserId && authorId === currentUserId);
                    const alreadyReacted = reactedPostIds.has(String(postId));
                    const alreadyCommented = commentedPostIds.has(String(postId));
                    const postText = this.extractPostText(post);

                    if (alreadyReacted) {
                        this.logger.info("SKIP_REACTION_ALREADY_REACTED", { ...ctx, postId: String(postId) });
                    } else if (isOwnPost) {
                        this.logger.info("SKIP_REACTION_OWN_POST", { ...ctx, postId: String(postId), authorId });
                    } else {
                        const rType = reactionCodes[Math.floor(Math.random() * reactionCodes.length)] || "LIKE";
                        const reactionCtx = { ...ctx, postId: String(postId), reactionType: rType };
                        this.logger.info("REACTION_SELECTED", reactionCtx);
                        await doMission(`PostReaction_${postId}`, () => ReactionApiService.sendReaction(accessToken, postId, rType, h, this.proxyAgent), reactionCtx);
                        await missionSvc.handleActionRewardClaim(accessToken, h, ctx, doMission, "REACTION");
                        reactedPostIds.add(String(postId));
                    }

                    if (alreadyCommented) {
                        this.logger.info("SKIP_COMMENT_ALREADY_COMMENTED", { ...ctx, postId: String(postId) });
                    } else if (isOwnPost) {
                        this.logger.info("SKIP_COMMENT_OWN_POST", { ...ctx, postId: String(postId), authorId });
                    } else if (!postText) {
                        this.logger.info("SKIP_COMMENT_NO_CONTENT", { ...ctx, postId: String(postId) });
                    } else {
                        const commentText = await this.generateCommentForPost({
                            postText,
                            authorName: this.extractPostAuthorName(post)
                        }, {
                            ...ctx,
                            postId: String(postId)
                        });

                        if (!commentText) {
                            this.logger.warn("SKIP_COMMENT_NO_OPENAI_OUTPUT", { ...ctx, postId: String(postId) });
                            continue;
                        }

                        await doMission(
                            `PostComment_${postId}`,
                            () => CommentApiService.createComment(accessToken, {
                                postId: String(postId),
                                parentId: "",
                                level: "LEVEL_1",
                                content: commentText,
                                mentions: "",
                                media: ""
                            }, h, this.proxyAgent),
                            ctx
                        );
                        commentedPostIds.add(String(postId));
                        this.saveCommentedPostIds(commentedPostIds);
                        await missionSvc.handleActionRewardClaim(accessToken, h, ctx, doMission, "COMMENT");
                    }

                    seenPostIds.add(String(postId));
                }

                this.saveSeenPostIds(seenPostIds);
                this.saveCommentedPostIds(commentedPostIds);
                this.saveReactedPostIds(reactedPostIds);
            }
        } catch (e: any) {
            this.logger.error("INTERACT_WITH_POSTS_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
