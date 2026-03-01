import axios from 'axios';
import { ENV } from '../../config/env';

export class MissionApiService {
    static async getCurrentUserMissions(accessToken: string) {
        return axios.get(`${ENV.KONG_URL}/api/missions/current-user`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }
}
