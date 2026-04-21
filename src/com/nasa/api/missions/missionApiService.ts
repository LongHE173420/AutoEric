import { ENV } from '../../config/env';
import { ApiClient } from '../../utils/ApiClient';
import { buildHeaders } from '../../utils/headers';

export class MissionApiService {
    static async getCurrentUserMissions(accessToken: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/missions/current-user`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }

    static async claimMissionReward(accessToken: string, missionId: number, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/point/claim-mission-reward`, ApiClient.buildPayload({ missionId }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }

    static async claimStreakMissionReward(accessToken: string, missionId: number, currentValue: number, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/point/claim-streak-mission-reward`, ApiClient.buildPayload({ missionId, currentValue }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }

    static async getPointBalance(accessToken: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/point/balance`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
}
