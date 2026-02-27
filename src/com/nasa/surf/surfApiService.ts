import axios from 'axios';
import { ENV } from '../config/env';

export class SurfApiService {
    static async createSurf(accessToken: string, surfData: any) {
        return axios.post(`${ENV.KONG_URL}/api/surf/create`, surfData, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }

    static async getSurfHome(accessToken: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.KONG_URL}/api/surf/home`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }
}

