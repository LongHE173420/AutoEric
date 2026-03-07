import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';

export class SurfApiService {
    static async createSurf(accessToken: string, surfData: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/surf/create`, surfData, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }

    static async getSurfHome(accessToken: string, headers = buildHeaders(), surfId = "", createdAt = Math.floor(Date.now() / 1000), limit = 4, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/surf/home`, { surfId, createdAt, limit }, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }
}
