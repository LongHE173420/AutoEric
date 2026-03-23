import axios from 'axios';
import { ENV } from '../../config/env';
import { ApiClient } from '../../utils/ApiClient';
import { buildHeaders } from '../../utils/headers';
export class NotificationApiService {
    static async listNotifications(accessToken: string, headers = buildHeaders(), limit = 10, offset = 0, agent?: any) {
        return ApiClient.createSignedClient(headers, agent).get(`${ENV.KONG_URL}/api/notification/list`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async readNotification(accessToken: string, notificationId: string, headers = buildHeaders(), agent?: any) {
        return ApiClient.createSignedClient(headers, agent).post(`${ENV.KONG_URL}/api/v1/notification/${notificationId}/read`, {}, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
}
