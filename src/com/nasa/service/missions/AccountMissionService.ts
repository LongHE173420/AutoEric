import { UserApiService } from "../../api/user/userApiService";
import { MissionApiService } from "../../api/missions/missionApiService";
import { NotificationApiService } from "../../api/notification/notificationApiService";
import { FriendApiService } from "../../api/friend/friendApiService";
import { FeedApiService } from "../../api/feed/feedApiService";
import { ReactionApiService } from "../../api/reaction/reactionApiService";
import { Log } from "../../utils/log";

type AppLogger = ReturnType<typeof Log.getLogger>;

export class AccountMissionService {
    constructor(
        private readonly logger: AppLogger,
        private readonly api: any,
        private readonly proxyAgent: any
    ) {}

    async handleProfileAndSocial(accessToken: string, h: any, ctx: any, doMission: Function) {
        await doMission("ProfileMe", () => UserApiService.getProfileMe(accessToken, h, this.proxyAgent), ctx);
        await doMission("Missions", () => MissionApiService.getCurrentUserMissions(accessToken, h, this.proxyAgent), ctx);
        await doMission("MyFriends", () => FriendApiService.getMyFriends(accessToken, h, this.proxyAgent), ctx);
        await doMission("Notifications", () => NotificationApiService.listNotifications(accessToken, h, 10, 0, this.proxyAgent), ctx);
    }

    async handleActivityGeneration(accessToken: string, h: any, ctx: any, doMission: Function) {
        await doMission("BackgroundColor", () => FeedApiService.getFeedBackgroundColor(accessToken, h, this.proxyAgent), ctx);
        await doMission("ReactionList", () => ReactionApiService.listReactions(accessToken, h, 10, 0, this.proxyAgent), ctx);
    }
}
