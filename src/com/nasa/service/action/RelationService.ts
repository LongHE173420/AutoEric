import { FriendApiService } from "../../api/friend/friendApiService";
import { getUsersForFriendRequest, recordFriendRequest, updateFriendRequestStatus } from "../../data/mysqlStore";
import { AccountMissionService } from "../missions/AccountMissionService";
import { Log } from "../../utils/log";

type AppLogger = ReturnType<typeof Log.getLogger>;

export class RelationService {
    constructor(
        private readonly logger: AppLogger,
        private readonly proxyAgent: any,
        private readonly currentPhone: string
    ) { }

    async handleFriendManagement(accessToken: string, h: any, ctx: any, doMission: Function) {
        try {
            const missionSvc = new AccountMissionService(this.logger, this.proxyAgent);
            let receivedReqs: any = null;
            await doMission("GetReceivedFriendRequests", async () => {
                const res = await FriendApiService.getReceivedRequests(accessToken, h, 10, 0, this.proxyAgent);
                receivedReqs = res.data;
                return res;
            }, ctx);

            const items = Array.isArray(receivedReqs?.data) ? receivedReqs.data : (receivedReqs?.data?.items || []);
            if (items.length > 0) {
                for (const req of items) {
                    const senderId = req.senderId || req.userId || req.id;
                    if (senderId) {
                        let acceptSuccess = false;
                        let acceptConflict = false;
                        await doMission(`AcceptFriend_${senderId}`, async () => {
                            const res = await FriendApiService.acceptFriendRequest(accessToken, String(senderId), h, this.proxyAgent).catch((e: any) => {
                                if (e.response?.status === 409) acceptConflict = true;
                                throw e; // let doMission handle it
                            });
                            acceptSuccess = true;
                            return res;
                        }, ctx);

                        if (acceptSuccess || acceptConflict) {
                            await updateFriendRequestStatus(String(senderId), this.currentPhone, 'ACCEPTED').catch(() => {});
                        }
                    }
                }
            }

            const friendPlan = await missionSvc.getActionRewardPlan(accessToken, h, ctx, "FRIEND");
            if (!friendPlan.shouldDoAction) {
                this.logger.info(
                    friendPlan.reason === "NO_DAILY_POINT"
                        ? "ACTION_REWARD_ACTION_SKIPPED_NO_DAILY_POINT"
                        : friendPlan.reason === "ALL_SCOPES_CLAIMED"
                            ? "ACTION_REWARD_ACTION_SKIPPED_ALL_SCOPES_CLAIMED"
                            : "ACTION_REWARD_ACTION_SKIPPED_NO_ACTIVE_MISSION",
                    {
                        ...ctx,
                        category: "FRIEND",
                        reason: friendPlan.reason || null,
                        activeScopes: friendPlan.activeScopes,
                        dailyPointState: friendPlan.dailyPointState || null
                    }
                );
                return;
            }

            let targetUsers: any[] = [];
            await getUsersForFriendRequest(this.currentPhone, 3).then(users => {
                targetUsers = users;
                if (targetUsers.length > 0) {
                    this.logger.info("INTERNAL_FRIEND_TARGETS_FOUND", {
                        ...ctx,
                        total: targetUsers.length,
                        users: targetUsers
                    });
                } else {
                    this.logger.info("NO_INTERNAL_FRIEND_TARGETS", ctx);
                }
            }).catch((e: any) => {
                this.logger.error("FETCH_FRIEND_TARGETS_ERROR", { ...ctx, error: e.message });
            });

            for (const user of targetUsers) {
                const receiverId = user.app_user_id;
                const receiverPhone = user.phone;
                if (receiverId) {
                    let success = false;
                    await doMission(`SendInternalFriendRequest_${receiverPhone}`, async () => {
                        const res = await FriendApiService.sendFriendRequest(accessToken, receiverId, h, this.proxyAgent);
                        success = true;
                        return res;
                    }, ctx);

                    if (success) {
                        await recordFriendRequest(this.currentPhone, receiverPhone, receiverId).catch(() => {});
                        await missionSvc.handleActionRewardClaim(accessToken, h, ctx, doMission, "FRIEND");
                    }
                }
            }
        } catch (e: any) {
            this.logger.error("HANDLE_FRIEND_MANAGEMENT_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
