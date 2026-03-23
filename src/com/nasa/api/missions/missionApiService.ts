import axios from 'axios';
import { ENV } from '../../config/env';
import { ApiClient } from '../../utils/ApiClient';
import { buildHeaders } from '../../utils/headers';
export class MissionApiService {
    static async getCurrentUserMissions(accessToken: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/missions/current-user`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` }
        });
    }
}
