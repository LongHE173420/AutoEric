import axios from 'axios';
import { ENV } from '../../config/env';

export class AppConfigApiService {
    static async updateTokenFirebase(accessToken: string, data: any, headers: any, agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/app-config/update-token-firebase`, data, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            httpsAgent: agent
        });
    }
}
