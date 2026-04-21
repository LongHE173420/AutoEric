"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationApiService = void 0;
const env_1 = require("../../config/env");
const ApiClient_1 = require("../../utils/ApiClient");
const headers_1 = require("../../utils/headers");
class NotificationApiService {
    static async listNotifications(accessToken, headers = (0, headers_1.buildHeaders)(), limit = 10, offset = 0, agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).get(`${env_1.ENV.KONG_URL}/api/notification/list`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}` },
            params: { limit, offset }
        });
    }
    static async readNotification(accessToken, notificationId, headers = (0, headers_1.buildHeaders)(), agent) {
        return ApiClient_1.ApiClient.createSignedClient(headers, agent).post(`${env_1.ENV.KONG_URL}/api/v1/notification/${notificationId}/read`, {}, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
    }
}
exports.NotificationApiService = NotificationApiService;
