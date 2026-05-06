"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountMissionService = void 0;
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
    async handleRewardClaiming(accessToken, h, ctx, doMission) {
        return this.missionRewardService.handleRewardClaiming(accessToken, h, ctx, doMission);
    }
}
exports.AccountMissionService = AccountMissionService;
