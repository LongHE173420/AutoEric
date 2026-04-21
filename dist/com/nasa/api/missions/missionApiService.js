"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissionApiService = void 0;
const env_1 = require("../../config/env");
const ApiClient_1 = require("../../utils/ApiClient");
const headers_1 = require("../../utils/headers");
class MissionApiService {
    static async getCurrentUserMissions(accessToken, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/missions/current-user`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
    static async claimMissionReward(accessToken, missionId, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/point/claim-mission-reward`, ApiClient_1.ApiClient.buildPayload({ missionId }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
    static async claimStreakMissionReward(accessToken, missionId, currentValue, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/point/claim-streak-mission-reward`, ApiClient_1.ApiClient.buildPayload({ missionId, currentValue }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
    static async getPointBalance(accessToken, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/point/balance`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
}
exports.MissionApiService = MissionApiService;
