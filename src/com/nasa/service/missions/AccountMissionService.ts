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
        try {
            await doMission("ProfileMe", () => UserApiService.getProfileMe(accessToken, h, this.proxyAgent), ctx);
            await this.processMissionsAndRewards(accessToken, h, ctx, doMission);
            await doMission("MyFriends", () => FriendApiService.getMyFriends(accessToken, h, this.proxyAgent), ctx);
            await doMission("Notifications", () => NotificationApiService.listNotifications(accessToken, h, 10, 0, this.proxyAgent), ctx);
        } catch (e: any) {
            this.logger.error("HANDLE_PROFILE_AND_SOCIAL_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }

    private async processMissionsAndRewards(accessToken: string, h: any, ctx: any, doMission: Function) {
        try {
            // 1. Check daily point balance FIRST
            const balanceRes = await MissionApiService.getPointBalance(accessToken, h, this.proxyAgent);
            const balanceData = balanceRes.data?.data || balanceRes.data;
            const dailyRemainingPoint = balanceData?.dailyRemainingPoint ?? balanceData?.remainingPoint ?? null;
            const dailyEarnedPoint = balanceData?.dailyEarnedPoint ?? balanceData?.maxDailyPoint ?? null;
            this.logger.info("OK: PointBalance", { ...ctx, balance: balanceData, dailyRemainingPoint, dailyEarnedPoint });

            if (dailyRemainingPoint !== null && dailyRemainingPoint <= 0) {
                this.logger.info("SKIP_MISSIONS_DAILY_LIMIT_REACHED", { ...ctx, dailyRemainingPoint, dailyEarnedPoint });
                return;
            }

            // 2. Get mission list
            const res = await MissionApiService.getCurrentUserMissions(accessToken, h, this.proxyAgent);
            this.logger.info("OK: Missions", ctx);
            const missions = res.data?.data || res.data || [];

            // 3. Claim all eligible missions
            await this.claimAllMissions(missions, accessToken, h, ctx, doMission);
        } catch (e: any) {
            this.logger.error("MISSION_PROCESSING_ERROR", { ...ctx, err: e.message || String(e) });
        }
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

    private async claimAllMissions(missions: any[], accessToken: string, h: any, ctx: any, doMission: Function) {
        try {
            for (const m of missions) {
                const missionId = m.missionId || m.id;
                if (!missionId) continue;

                const isStreak = m.type === "STREAK_LOGIN" || m.type === "STREAK" || (m.name && m.name.toLowerCase().includes("chuỗi"));
                
                if (isStreak) {
                    const cv = m.currentValue || 0;
                    const lastStreakDate = m.lastStreakDate || 0;
                    
                    let alreadyClaimedToday = false;
                    const now = new Date();
                    
                    if (lastStreakDate > 0) {
                        try {
                            if (lastStreakDate > 20000000 && lastStreakDate < 30000000) { // YYYYMMDD
                                const y = now.getFullYear();
                                const mt = String(now.getMonth() + 1).padStart(2, '0');
                                const d = String(now.getDate()).padStart(2, '0');
                                alreadyClaimedToday = lastStreakDate === parseInt(`${y}${mt}${d}`);
                            } else { // Timestamp
                                const ms = lastStreakDate > 9999999999 ? lastStreakDate : lastStreakDate * 1000;
                                alreadyClaimedToday = new Date(ms).toDateString() === now.toDateString();
                            }
                        } catch(e) {}
                    }

                    if (alreadyClaimedToday) {
                        this.logger.debug(`SKIP_STREAK_MISSION_ALREADY_CLAIMED_TODAY_${missionId}`, { ...ctx, name: m.name, cv, lastStreakDate });
                    } else if (Array.isArray(m.rewardAmount)) {
                        let claimedAny = false;
                        const effectiveCv = cv + 1;
                        for (const rew of m.rewardAmount) {
                            if (rew.targetValue && rew.targetValue === effectiveCv) {
                                claimedAny = true;
                                await doMission(`ClaimStreakMission_${missionId}_Day_${rew.targetValue}`, 
                                    () => MissionApiService.claimStreakMissionReward(accessToken, missionId, rew.targetValue, h, this.proxyAgent), ctx);
                            }
                        }
                        if (!claimedAny) {
                             this.logger.debug(`SKIP_STREAK_MISSION_${missionId}`, { ...ctx, name: m.name, cv });
                        }
                    } else {
                        this.logger.debug(`SKIP_STREAK_MISSION_NO_CV_${missionId}`, { ...ctx, name: m.name, cv, rewards: m.rewardAmount });
                    }
                } else {
                    const isCompleted = m.status === "COMPLETED" || m.status === "DONE" || 
                        (m.targetValue > 0 && m.currentValue >= m.targetValue);
                        
                    const isClaimed = m.status === "CLAIMED";
                    
                    if (isCompleted && !isClaimed) {
                        await doMission(`ClaimMission_${missionId}`, () => MissionApiService.claimMissionReward(accessToken, missionId, h, this.proxyAgent), ctx);
                    } else {
                        // Log reason for skipping
                        this.logger.debug(`SKIP_MISSION_${missionId}`, { 
                            ...ctx, 
                            name: m.name, 
                            status: m.status, 
                            isCompleted, 
                            isClaimed, 
                            cv: m.currentValue, 
                            tv: m.targetValue 
                        });
                    }
                }
            }
        } catch (e: any) {
            this.logger.error("CLAIM_ALL_MISSIONS_ERROR", { ...ctx, err: e.message || String(e) });
            throw e;
        }
    }
}
