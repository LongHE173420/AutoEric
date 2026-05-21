"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountMissionService = void 0;
const userApiService_1 = require("../../api/user/userApiService");
const notificationApiService_1 = require("../../api/notification/notificationApiService");
const friendApiService_1 = require("../../api/friend/friendApiService");
const feedApiService_1 = require("../../api/feed/feedApiService");
const reactionApiService_1 = require("../../api/reaction/reactionApiService");
const AccountActionRewardService_1 = require("./AccountActionRewardService");
const AccountMissionRewardService_1 = require("./AccountMissionRewardService");
class AccountMissionService {
    constructor(logger, proxyAgent) {
        this.logger = logger;
        this.proxyAgent = proxyAgent;
        this.actionRewardService = new AccountActionRewardService_1.AccountActionRewardService(logger, proxyAgent);
        this.missionRewardService = new AccountMissionRewardService_1.AccountMissionRewardService(logger, proxyAgent, this.actionRewardService);
    }
    async handleActionRewardClaim(accessToken, h, ctx, doMission, category) {
        return this.actionRewardService.handleActionRewardClaim(accessToken, h, ctx, doMission, category);
    }
    async getCachedDailyPointSummary(phone, now = new Date()) {
        return this.actionRewardService.getCachedDailyPointSummary(phone, now);
    }
    async getActionRewardPlan(accessToken, h, ctx, category) {
        return this.actionRewardService.getActionRewardPlan(accessToken, h, ctx, category);
    }
    async handleProfileAndSocial(accessToken, h, ctx, doMission) {
        try {
            await doMission("ProfileMe", () => userApiService_1.UserApiService.getProfileMe(accessToken, h, this.proxyAgent), ctx);
            await doMission("MyFriends", () => friendApiService_1.FriendApiService.getMyFriends(accessToken, h, this.proxyAgent), ctx);
            await doMission("Notifications", () => notificationApiService_1.NotificationApiService.listNotifications(accessToken, h, 10, 0, this.proxyAgent), ctx);
        }
        catch (e) {
            this.logger.error("HANDLE_PROFILE_AND_SOCIAL_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
    async handleRewardClaiming(accessToken, h, ctx, doMission) {
        return this.missionRewardService.handleRewardClaiming(accessToken, h, ctx, doMission);
    }
    async handleStreakClaiming(accessToken, h, ctx, doMission) {
        return this.missionRewardService.handleStreakClaiming(accessToken, h, ctx, doMission);
    }
    async handleActivityGeneration(accessToken, h, ctx, doMission) {
        try {
            await doMission("BackgroundColor", () => feedApiService_1.FeedApiService.getFeedBackgroundColor(accessToken, h, this.proxyAgent), ctx);
            await doMission("ReactionList", () => reactionApiService_1.ReactionApiService.listReactions(accessToken, h, 10, 0, this.proxyAgent), ctx);
        }
        catch (e) {
            this.logger.error("HANDLE_ACTIVITY_GENERATION_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
exports.AccountMissionService = AccountMissionService;
