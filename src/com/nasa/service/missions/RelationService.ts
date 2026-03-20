import { FriendApiService } from "../../api/friend/friendApiService";
import { UserApiService } from "../../api/user/userApiService";
import { Log } from "../../utils/log";

type AppLogger = ReturnType<typeof Log.getLogger>;

export class RelationService {
    constructor(
        private readonly logger: AppLogger,
        private readonly api: any,
        private readonly proxyAgent: any
    ) { }

    async handleFriendManagement(accessToken: string, h: any, ctx: any, doMission: Function) {
        let receivedReqs: any = null;
        await doMission("GetReceivedFriendRequests", async () => {
            const res = await FriendApiService.getReceivedRequests(accessToken, h, 10, 0, this.proxyAgent);
            receivedReqs = res.data;
            return res;
        }, ctx);

        if (receivedReqs?.data && Array.isArray(receivedReqs.data.items) && receivedReqs.data.items.length > 0) {
            for (const req of receivedReqs.data.items) {
                const senderId = req.senderId || req.userId || req.id;
                if (senderId) {
                    await doMission(`AcceptFriend_${senderId}`, () =>
                        FriendApiService.acceptFriendRequest(accessToken, String(senderId), h, this.proxyAgent), ctx);
                }
            }
        }

        let suggestItems: any[] = [];
        let retryCount = 0;
        const maxRetries = 3;
        const keywords = ["thang"];

        try {
            while (suggestItems.length === 0 && retryCount < maxRetries) {
                const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
                this.logger.info(`TRYING_KEYWORD: ${randomKeyword} (Attempt ${retryCount + 1})`, ctx);
                const res = await UserApiService.searchUsers(accessToken, randomKeyword, undefined, undefined, undefined, 5, 0, h, this.proxyAgent);
                const suggests: any = res.data;

                if (suggests) {
                    if (Array.isArray(suggests)) suggestItems = suggests;
                    else if (Array.isArray(suggests.data)) suggestItems = suggests.data;
                    else if (suggests.data && Array.isArray(suggests.data.items)) suggestItems = suggests.data.items;
                    else if (Array.isArray(suggests.items)) suggestItems = suggests.items;
                    else if (suggests.data && suggests.data.data && Array.isArray(suggests.data.data)) suggestItems = suggests.data.data;
                }

                if (suggestItems.length > 0) break;
                retryCount++;
                if (retryCount < maxRetries) await new Promise(resolve => setTimeout(resolve, 1500));
            }
        } catch (e: any) {
            this.logger.warn("MISSION_ERROR_IGNORED: searchUsers", { ...ctx, error: e.message });
        }

        if (suggestItems.length > 0) {
            const friendUsers = suggestItems
                .filter(u => u.friendshipStatus === "FRIENDS")
                .map(u => ({
                    userId: String(u.userId || u.accountId || u.id || ""),
                    name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim(),
                    friendshipStatus: u.friendshipStatus
                }));

            this.logger.info("FRIEND_SEARCH_RESULTS", {
                ...ctx,
                total: suggestItems.length,
                users: suggestItems.map(u => ({
                    userId: String(u.userId || u.accountId || u.id || ""),
                    name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim(),
                    friendshipStatus: u.friendshipStatus || ""
                }))
            });

            if (friendUsers.length > 0) {
                this.logger.info("ALREADY_FRIENDS_LIST", {
                    ...ctx,
                    total: friendUsers.length,
                    users: friendUsers
                });
            }
        }

        if (suggestItems.length > 0) {
            const validUsers = suggestItems.filter(u => u.friendshipStatus === "NONE").slice(0, 3);
            for (const user of validUsers) {
                const receiverId = String(user.userId || user.accountId || user.id);
                if (receiverId && receiverId !== "undefined") {
                    await doMission(`SendFriendRequest_${receiverId}`, () =>
                        FriendApiService.sendFriendRequest(accessToken, receiverId, h, this.proxyAgent), ctx);
                }
            }
        }
    }
}
