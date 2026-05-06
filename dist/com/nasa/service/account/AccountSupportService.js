"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountSupportService = void 0;
const userApiService_1 = require("../../api/user/userApiService");
const notificationApiService_1 = require("../../api/notification/notificationApiService");
const friendApiService_1 = require("../../api/friend/friendApiService");
const feedApiService_1 = require("../../api/feed/feedApiService");
const reactionApiService_1 = require("../../api/reaction/reactionApiService");
class AccountSupportService {
    constructor(logger, proxyAgent) {
        this.logger = logger;
        this.proxyAgent = proxyAgent;
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
exports.AccountSupportService = AccountSupportService;
