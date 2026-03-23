import axios from 'axios';
import { ENV } from '../../config/env';
import { ApiClient } from '../../utils/ApiClient';
export class AppConfigApiService {
    static async updateTokenFirebase(accessToken: string, data: any, headers: any, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/app-config/update-token-firebase`, data, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
}
