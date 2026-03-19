import axios from 'axios';
import { ENV } from '../../config/env';
import { buildHeaders } from '../../utils/headers';

const buildPayload = (data: any) => typeof data === 'string' ? data : JSON.stringify(data).replace(/"(id|postId|commentId|parentId|userId|accountId|surfId|senderId|receiverId)"\s*:\s*"(\d+)"/g, '"$1":$2');

export class CommentApiService {

    static async createComment(accessToken: string, data: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/create`, buildPayload({
            postId: String(data.postId),
            parentId: data.parentId || "",
            level: data.level || "LEVEL_1",
            content: String(data.content),
            mentions: data.mentions || "",
            media: data.media || ""
        }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            httpsAgent: agent
        });
    }

    static async updateComment(accessToken: string, data: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/update`, buildPayload({
            id: String(data.id || data.commentId),
            content: String(data.content),
            mentions: data.mentions || "",
            media: data.media || ""
        }), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            httpsAgent: agent
        });
    }

    static async removeComment(accessToken: string, data: any, headers = buildHeaders(), agent?: any) {
        return axios.delete(`${ENV.KONG_URL}/api/comments/remove`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            data: buildPayload(data),
            httpsAgent: agent
        });
    }

    static async listComments(accessToken: string, data: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/list`, buildPayload(data), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            httpsAgent: agent
        });
    }

    static async hideComment(accessToken: string, data: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/hidden`, buildPayload(data), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            httpsAgent: agent
        });
    }

    static async unhideComment(accessToken: string, data: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments/un-hidden`, buildPayload(data), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            httpsAgent: agent
        });
    }

    static async addCommentReaction(accessToken: string, data: any, headers = buildHeaders(), agent?: any) {
        return axios.post(`${ENV.KONG_URL}/api/comments-reaction/add`, buildPayload(data), {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            httpsAgent: agent
        });
    }

    static async removeCommentReaction(accessToken: string, data: any, headers = buildHeaders(), agent?: any) {
        return axios.delete(`${ENV.KONG_URL}/api/comments-reaction/remove`, {
            headers: { ...headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            data: buildPayload(data),
            httpsAgent: agent
        });
    }
}
