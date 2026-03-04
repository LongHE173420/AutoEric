import axios from 'axios';
import { ENV } from '../../config/env';

export class MissionApiService {
    static async getCurrentUserMissions(accessToken: string, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/missions/current-user`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }
}
