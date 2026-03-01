import axios from 'axios';
import { ENV } from '../../config/env';

export class NotificationApiService {
    static async listNotifications(accessToken: string, limit = 10, offset = 0) {
        return axios.get(`${ENV.NOTIFICATION_URL}/api/v1/notification/list`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }

    static async readNotification(accessToken: string, notificationId: string) {
        return axios.post(`${ENV.NOTIFICATION_URL}/api/v1/notification/${notificationId}/read`, {}, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    }
}
