import { UserApiService } from "../../api/user/userApiService";
import { NotificationApiService } from "../../api/notification/notificationApiService";
import { FriendApiService } from "../../api/friend/friendApiService";
import { FeedApiService } from "../../api/feed/feedApiService";
import { ReactionApiService } from "../../api/reaction/reactionApiService";
import { Log } from "../../utils/log";
import { AccountActionRewardService, ActionRewardCategory } from "./AccountActionRewardService";
import { AccountMissionRewardService } from "./AccountMissionRewardService";

type AppLogger = ReturnType<typeof Log.getLogger>;

export class AccountMissionService {
    private readonly actionRewardService: AccountActionRewardService;
    private readonly missionRewardService: AccountMissionRewardService;

    constructor(
        private readonly logger: AppLogger,
        private readonly proxyAgent: any
    ) {
        this.actionRewardService = new AccountActionRewardService(logger, proxyAgent);
        this.missionRewardService = new AccountMissionRewardService(logger, proxyAgent, this.actionRewardService);
    }

    async handleActionRewardClaim(
        accessToken: string,
        h: any,
        ctx: any,
        doMission: Function,
        category: ActionRewardCategory
    ) {
        return this.actionRewardService.handleActionRewardClaim(accessToken, h, ctx, doMission, category);
    }

    async getCachedDailyPointSummary(phone: string, now = new Date()) {
        return this.actionRewardService.getCachedDailyPointSummary(phone, now);
    }

    async getActionRewardPlan(accessToken: string, h: any, ctx: any, category: ActionRewardCategory) {
        return this.actionRewardService.getActionRewardPlan(accessToken, h, ctx, category);
    }

    async handleProfileAndSocial(accessToken: string, h: any, ctx: any, doMission: Function) {
        try {
            await doMission("ProfileMe", () => UserApiService.getProfileMe(accessToken, h, this.proxyAgent), ctx);
            await doMission("MyFriends", () => FriendApiService.getMyFriends(accessToken, h, this.proxyAgent), ctx);
            await doMission("Notifications", () => NotificationApiService.listNotifications(accessToken, h, 10, 0, this.proxyAgent), ctx);
        } catch (e: any) {
            this.logger.error("HANDLE_PROFILE_AND_SOCIAL_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }

    async handleRewardClaiming(accessToken: string, h: any, ctx: any, doMission: Function) {
        return this.missionRewardService.handleRewardClaiming(accessToken, h, ctx, doMission);
    }

    async handleStreakClaiming(accessToken: string, h: any, ctx: any, doMission: Function) {
        return this.missionRewardService.handleStreakClaiming(accessToken, h, ctx, doMission);
    }

    async handleActivityGeneration(accessToken: string, h: any, ctx: any, doMission: Function) {
        try {
            await doMission("BackgroundColor", () => FeedApiService.getFeedBackgroundColor(accessToken, h, this.proxyAgent), ctx);
            await doMission("ReactionList", () => ReactionApiService.listReactions(accessToken, h, 10, 0, this.proxyAgent), ctx);
        } catch (e: any) {
            this.logger.error("HANDLE_ACTIVITY_GENERATION_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
