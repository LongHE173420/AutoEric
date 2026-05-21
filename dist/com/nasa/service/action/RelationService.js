"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelationService = void 0;
const friendApiService_1 = require("../../api/friend/friendApiService");
const mysqlStore_1 = require("../../data/mysqlStore");
const AccountMissionService_1 = require("../missions/AccountMissionService");
class RelationService {
    constructor(logger, proxyAgent, currentPhone) {
        this.logger = logger;
        this.proxyAgent = proxyAgent;
        this.currentPhone = currentPhone;
    }
    async handleFriendManagement(accessToken, h, ctx, doMission) {
        try {
            const missionSvc = new AccountMissionService_1.AccountMissionService(this.logger, this.proxyAgent);
            let receivedReqs = null;
            await doMission("GetReceivedFriendRequests", async () => {
                const res = await friendApiService_1.FriendApiService.getReceivedRequests(accessToken, h, 10, 0, this.proxyAgent);
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
                            const res = await friendApiService_1.FriendApiService.acceptFriendRequest(accessToken, String(senderId), h, this.proxyAgent).catch((e) => {
                                if (e.response?.status === 409)
                                    acceptConflict = true;
                                throw e; // let doMission handle it
                            });
                            acceptSuccess = true;
                            return res;
                        }, ctx);
                        if (acceptSuccess || acceptConflict) {
                            await (0, mysqlStore_1.updateFriendRequestStatus)(String(senderId), this.currentPhone, 'ACCEPTED').catch(() => { });
                        }
                    }
                }
            }
            const friendPlan = await missionSvc.getActionRewardPlan(accessToken, h, ctx, "FRIEND");
            if (!friendPlan.shouldDoAction) {
                this.logger.info(friendPlan.reason === "NO_DAILY_POINT"
                    ? "ACTION_REWARD_ACTION_SKIPPED_NO_DAILY_POINT"
                    : friendPlan.reason === "ALL_SCOPES_CLAIMED"
                        ? "ACTION_REWARD_ACTION_SKIPPED_ALL_SCOPES_CLAIMED"
                        : "ACTION_REWARD_ACTION_SKIPPED_NO_ACTIVE_MISSION", {
                    ...ctx,
                    category: "FRIEND",
                    reason: friendPlan.reason || null,
                    activeScopes: friendPlan.activeScopes,
                    dailyPointState: friendPlan.dailyPointState || null
                });
                return;
            }
            let targetUsers = [];
            await (0, mysqlStore_1.getUsersForFriendRequest)(this.currentPhone, 3).then(users => {
                targetUsers = users;
                if (targetUsers.length > 0) {
                    this.logger.info("INTERNAL_FRIEND_TARGETS_FOUND", {
                        ...ctx,
                        total: targetUsers.length,
                        users: targetUsers
                    });
                }
                else {
                    this.logger.info("NO_INTERNAL_FRIEND_TARGETS", ctx);
                }
            }).catch((e) => {
                this.logger.error("FETCH_FRIEND_TARGETS_ERROR", { ...ctx, error: e.message });
            });
            for (const user of targetUsers) {
                const receiverId = user.app_user_id;
                const receiverPhone = user.phone;
                if (receiverId) {
                    let success = false;
                    await doMission(`SendInternalFriendRequest_${receiverPhone}`, async () => {
                        const res = await friendApiService_1.FriendApiService.sendFriendRequest(accessToken, receiverId, h, this.proxyAgent);
                        success = true;
                        return res;
                    }, ctx);
                    if (success) {
                        await (0, mysqlStore_1.recordFriendRequest)(this.currentPhone, receiverPhone, receiverId).catch(() => { });
                        await missionSvc.handleActionRewardClaim(accessToken, h, ctx, doMission, "FRIEND");
                    }
                }
            }
        }
        catch (e) {
            this.logger.error("HANDLE_FRIEND_MANAGEMENT_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
exports.RelationService = RelationService;
