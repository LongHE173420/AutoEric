import axios from 'axios';
import { ENV } from '../config/env';
import { applyStandardInterceptors } from './axiosSignature';

export class ApiClient {
    static createSignedClient(headers: any, agent?: any) {
        const deviceId = headers?.["X-Device-Id"] || headers?.["x-device-id"];
        const client = axios.create({
            baseURL: ENV.KONG_URL,
            httpsAgent: agent,
            timeout: 10000
        });
        applyStandardInterceptors(client, String(deviceId || ""));
        return client;
    }

    static buildPayload(data: any) {
        return typeof data === 'string'
            ? data
            : JSON.stringify(data).replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId|entityId)"\s*:\s*"?(\d+)"?/g, '"$1":"$2"');
    }
}
