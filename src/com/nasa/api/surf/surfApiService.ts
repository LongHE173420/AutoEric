import axios from 'axios';
import { ENV } from '../../config/env';

export class SurfApiService {
    static async createSurf(accessToken: string, surfData: any, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/surf/create`, surfData, {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getSurfHome(accessToken: string, limit = 10, offset = 0, agent?: any) {
        return axios.get(`${ENV.KONG_URL}/api/surf/home`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset },
            httpsAgent: agent
        });
    }
}

