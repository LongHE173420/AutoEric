import { FeedApiService } from "../../api/feed/feedApiService";
import { SurfApiService } from "../../api/surf/surfApiService";
import { ReactionApiService } from "../../api/reaction/reactionApiService";
import { CommentApiService } from "../../api/comment/commentApiService";
import { OpenAiCommentService } from "../../api/openai/openAiCommentService";
import { AccountMissionService } from "./AccountMissionService";
import { AsyncStore } from "../../storage/asyncStore";
import { Log } from "../../utils/log";

type AppLogger = ReturnType<typeof Log.getLogger>;

export class InteractionService {
    private readonly commentTemplates = [
        "Hay qu\u00e1",
        "B\u00e0i n\u00e0y \u1ed5n",
        "N\u1ed9i dung \u0111\u01b0\u1ee3c \u0111\u00f3",
        "Xem c\u0169ng kh\u00e1 hay",
        "B\u00ecnh lu\u1eadn r\u1ea5t t\u1ef1 nhi\u00ean"
    ];

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
            return new Set(Array.isArray(stored) ? stored.map(v => String(v)) : []);
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

    private extractPostText(post: any) {
        const raw = String(post?.content ?? post?.caption ?? post?.text ?? post?.description ?? "").trim();
        if (!raw) return "";
        if (raw.startsWith("!{")) return "";
        return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 700);
    }

    private getFallbackComment(index: number) {
        return this.commentTemplates[index % this.commentTemplates.length];
    }

    private async generateCommentForPost(post: any, index: number, ctx: any) {
        const openAiDebug = OpenAiCommentService.getDebugInfo();

        if (!OpenAiCommentService.isEnabled()) {
            this.logger.warn("OPENAI_COMMENT_DISABLED", { ...ctx, reason: "OPENAI_API_KEY_EMPTY", openAi: openAiDebug });
            return this.getFallbackComment(index);
        }

        try {
            const generated = await OpenAiCommentService.generateComment({
                postText: this.extractPostText(post),
                authorName: this.extractPostAuthorName(post)
            });

            if (generated) {
                this.logger.info("OPENAI_COMMENT_GENERATED", { ...ctx, length: generated.length, openAi: openAiDebug });
                return generated;
            }

            this.logger.warn("OPENAI_COMMENT_EMPTY_RESPONSE", { ...ctx, openAi: openAiDebug });
        } catch (e: any) {
            this.logger.warn("OPENAI_COMMENT_GENERATION_FAILED", {
                ...ctx,
                err: e.message || String(e),
                status: e.response?.status,
                responseData: e.response?.data,
                openAi: openAiDebug
            });
        }

        this.logger.info("OPENAI_COMMENT_FALLBACK_USED", { ...ctx, openAi: openAiDebug });
        return this.getFallbackComment(index);
    }

    async handleFeedAndInteract(accessToken: string, h: any, ctx: any, doMission: Function) {
        try {
            const missionSvc = new AccountMissionService(this.logger, this.proxyAgent);
            let allItems: any[] = [];
            let lastPostId = "";
            let lastCreatedAt = Date.now();
            const reactionCodes = ["LIKE"];

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

            for (let page = 0; page < 3; page++) {
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

                if (page < 2) await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1500));
            }

            await doMission("SurfHome", () => SurfApiService.getSurfHome(accessToken, h, "", Math.floor(Date.now() / 1000), 4, this.proxyAgent), ctx);

            this.logger.info("DEBUG_FEEDHOME", { itemsLength: allItems.length, pagesScrolled: 3 });

            if (allItems.length > 0) {
                const uniqueItems = Array.from(new Map(allItems.map(i => [i.id, i])).values());
                const seenPostIds = this.getSeenPostIds();
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

                    if (alreadyReacted) {
                        this.logger.info("SKIP_REACTION_ALREADY_REACTED", { ...ctx, postId: String(postId) });
                    } else {
                        const rType = reactionCodes[Math.floor(Math.random() * reactionCodes.length)] || "LIKE";
                        await doMission(`PostReaction_${postId}`, () => ReactionApiService.sendReaction(accessToken, postId, rType, h, this.proxyAgent), ctx);
                        await missionSvc.handleActionRewardClaim(accessToken, h, ctx, doMission, "REACTION");
                        reactedPostIds.add(String(postId));
                    }

                    if (isOwnPost) {
                        this.logger.info("SKIP_COMMENT_OWN_POST", { ...ctx, postId: String(postId), authorId });
                    } else {
                        const commentText = await this.generateCommentForPost(post, i, ctx);
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
                        await missionSvc.handleActionRewardClaim(accessToken, h, ctx, doMission, "COMMENT");
                    }

                    seenPostIds.add(String(postId));
                }

                this.saveSeenPostIds(seenPostIds);
                this.saveReactedPostIds(reactedPostIds);
            }
        } catch (e: any) {
            this.logger.error("INTERACT_WITH_POSTS_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
